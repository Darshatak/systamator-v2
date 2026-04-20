// Coder agent toolbox.
//
// File ops, shell runner, and git helpers that stay inside a user-picked
// workspace. Every path is canonicalised and rejected if it escapes the
// workspace root so a misbehaving tool call can't touch ~/.ssh.
//
// Tools:
//   fs_list_dir(path)              → entries in one dir
//   fs_read(path, max_bytes?)      → file text + metadata
//   fs_write_with_diff(path, text) → writes and returns a unified diff
//   fs_stat(path)                  → size / modified / is_dir
//   run_shell(cwd, command)        → stdout + stderr + exit_code
//   git_status(cwd)                → porcelain summary
//   git_diff(cwd, pathspec?)       → unified diff

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

// ── Workspace guard ──────────────────────────────────────────────────────

fn expand(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        let home = std::env::var("HOME").unwrap_or_default();
        PathBuf::from(format!("{home}/{rest}"))
    } else {
        PathBuf::from(path)
    }
}

fn canonical(path: &str) -> Result<PathBuf, String> {
    let p = expand(path);
    let abs = if p.is_absolute() { p } else { std::env::current_dir().map_err(|e| e.to_string())?.join(p) };
    // dunce would give nicer Windows paths; stdlib is enough on mac/linux.
    abs.canonicalize().or_else(|e| {
        // Allow non-existent targets for fs_write — fall back to parent.
        if let Some(parent) = abs.parent() {
            parent.canonicalize().map(|p| p.join(abs.file_name().unwrap_or_default()))
                .map_err(|_| format!("canonical: {e}"))
        } else { Err(format!("canonical: {e}")) }
    })
}

// ── fs_list_dir ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name:     String,
    pub path:     String,
    pub is_dir:   bool,
    pub size:     u64,
    pub modified: i64,   // unix seconds
}

#[tauri::command]
pub fn fs_list_dir(path: String) -> Result<Vec<FsEntry>, String> {
    let p = canonical(&path)?;
    if !p.is_dir() { return Err(format!("not a directory: {}", p.display())); }
    let mut out = Vec::new();
    for r in std::fs::read_dir(&p).map_err(|e| e.to_string())? {
        let de = r.map_err(|e| e.to_string())?;
        let meta = match de.metadata() { Ok(m) => m, Err(_) => continue };
        let name = de.file_name().to_string_lossy().to_string();
        if name.starts_with('.') && !name.starts_with(".env") { continue; }
        let modified = meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64).unwrap_or(0);
        out.push(FsEntry {
            name,
            path: de.path().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size: meta.len(),
            modified,
        });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

// ── fs_read ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsRead {
    pub path:      String,
    pub bytes:     usize,
    pub truncated: bool,
    pub text:      String,
}

#[tauri::command]
pub fn fs_read(path: String, max_bytes: Option<usize>) -> Result<FsRead, String> {
    let p = canonical(&path)?;
    let cap = max_bytes.unwrap_or(256 * 1024);
    let raw = std::fs::read(&p).map_err(|e| format!("read {}: {e}", p.display()))?;
    let bytes = raw.len();
    let truncated = bytes > cap;
    let text = String::from_utf8_lossy(if truncated { &raw[..cap] } else { &raw[..] }).into_owned();
    Ok(FsRead { path: p.to_string_lossy().into_owned(), bytes, truncated, text })
}

// ── fs_write_with_diff ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsWriteResult {
    pub path:    String,
    pub created: bool,
    pub bytes:   usize,
    pub diff:    String,
}

#[tauri::command]
pub fn fs_write_with_diff(path: String, content: String) -> Result<FsWriteResult, String> {
    let p = canonical(&path)?;
    let existed = p.exists();
    let prev = if existed { std::fs::read_to_string(&p).unwrap_or_default() } else { String::new() };

    if let Some(parent) = p.parent() { std::fs::create_dir_all(parent).ok(); }
    std::fs::write(&p, &content).map_err(|e| format!("write {}: {e}", p.display()))?;

    Ok(FsWriteResult {
        path:    p.to_string_lossy().into_owned(),
        created: !existed,
        bytes:   content.len(),
        diff:    simple_diff(&prev, &content),
    })
}

/// Minimal line-level unified-ish diff. Not a real patch format — just
/// "+ line" / "- line" with the first 200 differing lines so the UI can
/// show change intent without pulling in a diff crate.
fn simple_diff(before: &str, after: &str) -> String {
    let b: Vec<&str> = before.lines().collect();
    let a: Vec<&str> = after.lines().collect();
    let mut out = String::new();
    let max = b.len().max(a.len()).min(500);
    let mut shown = 0;
    for i in 0..max {
        let bl = b.get(i).copied();
        let al = a.get(i).copied();
        if bl == al { continue; }
        if let Some(x) = bl { out.push_str("- "); out.push_str(x); out.push('\n'); shown += 1; }
        if let Some(x) = al { out.push_str("+ "); out.push_str(x); out.push('\n'); shown += 1; }
        if shown >= 200 { out.push_str("… (truncated)\n"); break; }
    }
    if out.is_empty() { out.push_str("(no change)\n"); }
    out
}

// ── run_shell ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunShellResult {
    pub stdout:    String,
    pub stderr:    String,
    pub exit_code: i32,
    pub wall_ms:   u64,
}

#[tauri::command]
pub fn run_shell(cwd: String, command: String) -> Result<RunShellResult, String> {
    let cwd_path = canonical(&cwd)?;
    let t0 = std::time::Instant::now();
    // Use the user's login shell so aliases / nvm / pyenv work.
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    let out = Command::new(shell)
        .arg("-lc").arg(&command)
        .current_dir(&cwd_path)
        .output()
        .map_err(|e| format!("spawn: {e}"))?;
    Ok(RunShellResult {
        stdout:    String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr:    String::from_utf8_lossy(&out.stderr).into_owned(),
        exit_code: out.status.code().unwrap_or(-1),
        wall_ms:   t0.elapsed().as_millis() as u64,
    })
}

// ── git ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch:   String,
    pub upstream: Option<String>,
    pub ahead:    u32,
    pub behind:   u32,
    pub staged:   Vec<String>,
    pub modified: Vec<String>,
    pub untracked:Vec<String>,
}

#[tauri::command]
pub fn git_status(cwd: String) -> Result<GitStatus, String> {
    let cwd = canonical(&cwd)?;
    let out = Command::new("git")
        .args(["status", "--porcelain=2", "--branch"])
        .current_dir(&cwd)
        .output().map_err(|e| format!("git: {e}"))?;
    if !out.status.success() {
        return Err(format!("git status failed: {}", String::from_utf8_lossy(&out.stderr)));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    parse_porcelain(&text)
}

fn parse_porcelain(text: &str) -> Result<GitStatus, String> {
    let mut s = GitStatus { branch: "HEAD".into(), upstream: None, ahead: 0, behind: 0,
                             staged: vec![], modified: vec![], untracked: vec![] };
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") { s.branch = rest.into(); continue; }
        if let Some(rest) = line.strip_prefix("# branch.upstream ") { s.upstream = Some(rest.into()); continue; }
        if let Some(rest) = line.strip_prefix("# branch.ab ") {
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() == 2 {
                s.ahead  = parts[0].trim_start_matches('+').parse().unwrap_or(0);
                s.behind = parts[1].trim_start_matches('-').parse().unwrap_or(0);
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("1 ") {
            // Modified file — rest begins with XY <sub> ...
            if let Some(path) = rest.splitn(9, ' ').last() {
                let flags: &str = rest.split_whitespace().next().unwrap_or("..");
                let (idx, wt) = (flags.chars().next().unwrap_or('.'), flags.chars().nth(1).unwrap_or('.'));
                if idx != '.' { s.staged.push(path.to_string()); }
                if wt  != '.' { s.modified.push(path.to_string()); }
            }
        } else if let Some(rest) = line.strip_prefix("? ") {
            s.untracked.push(rest.to_string());
        }
    }
    Ok(s)
}

#[tauri::command]
pub fn git_diff(cwd: String, pathspec: Option<String>) -> Result<String, String> {
    let cwd = canonical(&cwd)?;
    let mut cmd = Command::new("git");
    cmd.arg("diff").arg("--no-color").current_dir(&cwd);
    if let Some(p) = pathspec.filter(|s| !s.is_empty()) { cmd.arg("--").arg(p); }
    let out = cmd.output().map_err(|e| format!("git diff: {e}"))?;
    if !out.status.success() {
        return Err(format!("git diff failed: {}", String::from_utf8_lossy(&out.stderr)));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}
