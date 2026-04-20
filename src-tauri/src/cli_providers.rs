// CLI provider integration — Claude / Codex / Gemini / Opencode.
//
// Same idea as v1: many users sign into AI providers via the official CLI
// (OAuth, no API key required). We detect what's installed, surface a
// "Sign in via CLI" affordance in Settings, and let the orchestrator
// invoke the CLI as the model backend when no API key is available.

use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::io::Write;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInfo {
    pub installed: bool,
    pub path:      Option<String>,
    pub version:   Option<String>,
    pub login_hint:Option<String>,    // human-readable "how to sign in"
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliDetectResult {
    pub claude:   CliInfo,
    pub codex:    CliInfo,
    pub gemini:   CliInfo,
    pub opencode: CliInfo,
}

fn which(bin: &str) -> Option<String> {
    let out = Command::new("which").arg(bin).output().ok()?;
    if !out.status.success() { return None; }
    let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if p.is_empty() { None } else { Some(p) }
}

fn version_of(bin: &str) -> Option<String> {
    let out = Command::new(bin).arg("--version").output().ok()?;
    let combined = format!("{}{}",
        String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    combined.lines().next().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn detect_one(bin: &str, login_hint: &str) -> CliInfo {
    match which(bin) {
        Some(path) => CliInfo {
            installed: true,
            path:      Some(path),
            version:   version_of(bin),
            login_hint:Some(login_hint.to_string()),
        },
        None => CliInfo::default(),
    }
}

/// Detect installed AI CLIs on $PATH. Used by Settings → Providers and by
/// the orchestrator (to decide whether the CLI path is a viable fallback).
#[tauri::command]
pub fn cli_detect() -> CliDetectResult {
    CliDetectResult {
        claude:   detect_one("claude",   "Run `claude` in your terminal — `/login` for OAuth."),
        codex:    detect_one("codex",    "Run `codex login` to sign in (OpenAI Codex CLI)."),
        gemini:   detect_one("gemini",   "Run `gemini auth login` (Google Gemini CLI)."),
        opencode: detect_one("opencode", "Run `opencode login` for SST OpenCode."),
    }
}

// ── Browser-based OAuth login ─────────────────────────────────────────────
//
// All four CLIs use OAuth that opens a browser. Previously we bounced
// through Terminal.app which is clunky — now we spawn the login
// subcommand directly with stdin/stdout piped, watch for the auth URL
// in its output, and hand the URL to the OS default browser via `open`.
// The CLI process itself keeps running to finish the OAuth exchange;
// the user completes auth in browser, the CLI exits, credentials land
// on disk. cli_detect on the next poll reflects logged-in state.

fn login_cmd(provider: &str) -> Option<(&'static str, Vec<&'static str>)> {
    match provider {
        "claude"   => Some(("claude",   vec!["/login"])),        // TUI-less login in recent versions
        "codex"    => Some(("codex",    vec!["login"])),
        "gemini"   => Some(("gemini",   vec!["auth", "login"])),
        "opencode" => Some(("opencode", vec!["login"])),
        _ => None,
    }
}

#[tauri::command]
pub fn cli_login_open(app: tauri::AppHandle, provider: String) -> Result<String, String> {
    use tauri::Emitter;
    let (bin, args) = login_cmd(&provider).ok_or_else(|| format!("unknown provider: {provider}"))?;

    // Spawn detached — the CLI itself opens the system browser via `open`
    // on macOS / `xdg-open` on Linux. We stream its stdout/stderr back so
    // the UI can surface the auth URL in case auto-open fails.
    let mut child = Command::new(bin)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn {bin}: {e}"))?;

    let provider_out = provider.clone();
    let app_out = app.clone();
    if let Some(out) = child.stdout.take() {
        std::thread::spawn(move || stream_login_output(app_out, &provider_out, out, "stdout"));
    }
    let provider_err = provider.clone();
    let app_err = app.clone();
    if let Some(err) = child.stderr.take() {
        std::thread::spawn(move || stream_login_output(app_err, &provider_err, err, "stderr"));
    }
    // Reap the child in the background so it doesn't zombie — we don't
    // block the Tauri command since auth can take a minute.
    std::thread::spawn(move || {
        let code = child.wait().map(|s| s.code().unwrap_or(-1)).unwrap_or(-2);
        let _ = app.emit("cli:login-done", serde_json::json!({ "provider": provider, "exitCode": code }));
    });

    Ok(format!("Launched {bin} {} — browser will open for OAuth", args.join(" ")))
}

fn stream_login_output<R: std::io::Read>(app: tauri::AppHandle, provider: &str, r: R, stream: &str) {
    use tauri::Emitter;
    use std::io::BufRead;
    let br = std::io::BufReader::new(r);
    for line in br.lines().map_while(Result::ok) {
        // Extract https://… auth URLs from CLI chatter — both for the UI
        // ("if browser didn't open, click here") and for a fallback
        // `open <url>` we fire ourselves the first time we see one.
        let url = find_auth_url(&line);
        if let Some(ref u) = url {
            #[cfg(target_os = "macos")]
            { let _ = Command::new("open").arg(u).status(); }
            #[cfg(target_os = "linux")]
            { let _ = Command::new("xdg-open").arg(u).status(); }
            #[cfg(target_os = "windows")]
            { let _ = Command::new("cmd").args(["/C", "start", "", u]).status(); }
        }
        let _ = app.emit("cli:login-line", serde_json::json!({
            "provider": provider, "stream": stream, "line": line, "url": url,
        }));
    }
}

fn find_auth_url(s: &str) -> Option<String> {
    let start = s.find("https://")?;
    let tail = &s[start..];
    let end = tail.find(|c: char| c.is_whitespace() || c == ')' || c == '>' || c == '"').unwrap_or(tail.len());
    Some(tail[..end].to_string())
}

// ── Non-interactive prompt execution ─────────────────────────────────────
//
// Synchronous, blocking. Used by the orchestrator's planner when the API
// key path isn't available. Each CLI takes a different flag for non-
// interactive mode — we hide that behind one entry point.

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliExecResult {
    pub stdout:    String,
    pub stderr:    String,
    pub exit_code: i32,
    pub provider:  String,
}

#[tauri::command]
pub fn cli_exec(provider: String, prompt: String) -> Result<CliExecResult, String> {
    // Prefer flags that suppress the TUI. Each CLI has its own.
    let (cmd, args, use_stdin) = match provider.as_str() {
        "claude"   => ("claude",   vec!["--print".to_string()],         true),  // claude reads stdin with --print
        "codex"    => ("codex",    vec!["exec".to_string(), prompt.clone()], false),
        "gemini"   => ("gemini",   vec!["-p".to_string(),    prompt.clone()], false),
        "opencode" => ("opencode", vec!["run".to_string(),  prompt.clone()], false),
        _ => return Err(format!("unknown provider: {provider}")),
    };

    let mut child = Command::new(cmd)
        .args(&args)
        .stdin(if use_stdin { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn {cmd}: {e}"))?;

    if use_stdin {
        if let Some(mut sin) = child.stdin.take() {
            let _ = sin.write_all(prompt.as_bytes());
        }
    }

    let out = child.wait_with_output().map_err(|e| format!("{cmd}: {e}"))?;
    Ok(CliExecResult {
        stdout: String::from_utf8_lossy(&out.stdout).to_string(),
        stderr: String::from_utf8_lossy(&out.stderr).to_string(),
        exit_code: out.status.code().unwrap_or(-1),
        provider,
    })
}
