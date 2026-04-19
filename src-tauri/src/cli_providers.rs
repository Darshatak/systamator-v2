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

// ── Open the user's terminal at the login command ────────────────────────
//
// Best-effort: on macOS we ask Terminal.app to open a new tab running the
// login. Linux/Windows fallbacks just print the command and tell the user
// to copy it. The user finishes auth in their terminal, then comes back to
// the app — `cli_detect` will reflect it.

#[tauri::command]
pub fn cli_login_open(provider: String) -> Result<String, String> {
    let cmd = match provider.as_str() {
        "claude"   => "claude",
        "codex"    => "codex login",
        "gemini"   => "gemini auth login",
        "opencode" => "opencode login",
        _ => return Err(format!("unknown provider: {provider}")),
    };

    #[cfg(target_os = "macos")]
    {
        let script = format!(
            r#"tell application "Terminal" to do script "{}"
               tell application "Terminal" to activate"#,
            cmd.replace('"', "\\\""),
        );
        let _ = Command::new("osascript").arg("-e").arg(&script).status();
        return Ok(format!("Opened Terminal with: {cmd}"));
    }
    #[cfg(not(target_os = "macos"))]
    {
        return Ok(format!("Run this in your shell: {cmd}"));
    }
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
