// Worktree isolation — the Vibe Kanban primitive.
//
// When a run (or a Coder agent step) wants a scratch copy of a repo,
// we materialise a fresh git worktree under ~/.systamator/worktrees/<id>
// on a new branch `systamator/<id>`. Two parallel agents working on the
// same repo see the same committed history but can't stomp each other's
// working trees.
//
// Cleanup is explicit — run_finish should call worktree_remove. Stale
// worktrees survive restarts; worktree_list shows them all.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

fn worktrees_root() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let p = PathBuf::from(home).join(".systamator").join("worktrees");
    std::fs::create_dir_all(&p).map_err(|e| format!("mkdir: {e}"))?;
    Ok(p)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub id:        String,
    pub path:      String,
    pub repo:      String,
    pub branch:    String,
    pub created_at:i64,
}

/// Create a fresh worktree for a run/task. Fails if <repo_path> isn't a
/// git repo or if the worktree already exists (pass clobber=true to
/// recreate). Returns the absolute worktree path.
#[tauri::command]
pub fn worktree_create(repo_path: String, run_id: String, clobber: Option<bool>) -> Result<WorktreeInfo, String> {
    let repo = expand_path(&repo_path);
    if !repo.join(".git").exists() && !repo.join(".git").is_dir() {
        // Could be a bare .git file (submodule) — trust git to error if not.
    }
    let wt_path = worktrees_root()?.join(&run_id);
    let branch  = format!("systamator/{}", run_id);

    if wt_path.exists() {
        if clobber.unwrap_or(false) {
            let _ = worktree_remove_inner(&repo, &wt_path, &branch);
        } else {
            return Err(format!("worktree already exists at {}", wt_path.display()));
        }
    }

    let out = Command::new("git")
        .arg("-C").arg(&repo)
        .args(["worktree", "add", "-b"])
        .arg(&branch)
        .arg(&wt_path)
        .output()
        .map_err(|e| format!("git spawn: {e}"))?;
    if !out.status.success() {
        return Err(format!("git worktree add failed: {}", String::from_utf8_lossy(&out.stderr)));
    }

    Ok(WorktreeInfo {
        id:         run_id,
        path:       wt_path.to_string_lossy().into_owned(),
        repo:       repo.to_string_lossy().into_owned(),
        branch,
        created_at: chrono::Utc::now().timestamp(),
    })
}

/// Remove a worktree + its branch. Idempotent.
#[tauri::command]
pub fn worktree_remove(run_id: String, repo_path: Option<String>) -> Result<(), String> {
    let wt_path = worktrees_root()?.join(&run_id);
    let branch  = format!("systamator/{}", run_id);
    let repo = match repo_path {
        Some(p) => expand_path(&p),
        None => {
            // Look up the upstream repo via `git rev-parse --git-common-dir`.
            if !wt_path.exists() { return Ok(()); }
            let out = Command::new("git").arg("-C").arg(&wt_path)
                .args(["rev-parse", "--git-common-dir"]).output()
                .map_err(|e| format!("rev-parse: {e}"))?;
            let common = String::from_utf8_lossy(&out.stdout).trim().to_string();
            PathBuf::from(&common).parent().map(|p| p.to_path_buf()).unwrap_or(wt_path.clone())
        }
    };
    worktree_remove_inner(&repo, &wt_path, &branch)
}

fn worktree_remove_inner(repo: &Path, wt_path: &Path, branch: &str) -> Result<(), String> {
    if wt_path.exists() {
        let _ = Command::new("git").arg("-C").arg(repo)
            .args(["worktree", "remove", "--force"]).arg(wt_path)
            .status();
    }
    // Delete branch too (ignore failure if already gone).
    let _ = Command::new("git").arg("-C").arg(repo)
        .args(["branch", "-D", branch]).status();
    if wt_path.exists() {
        // Last resort — rm -rf if git prune didn't clean it.
        std::fs::remove_dir_all(wt_path).ok();
    }
    Ok(())
}

/// List every systamator worktree on disk. Useful for diagnostics +
/// cleanup UI (user can nuke stale worktrees after crashes).
#[tauri::command]
pub fn worktree_list() -> Result<Vec<WorktreeInfo>, String> {
    let root = worktrees_root()?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = match entry { Ok(e) => e, Err(_) => continue };
        let path = entry.path();
        if !path.is_dir() { continue; }
        let id = entry.file_name().to_string_lossy().to_string();
        let created_at = entry.metadata().ok()
            .and_then(|m| m.created().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64).unwrap_or(0);
        // Find the upstream repo via git rev-parse.
        let repo = Command::new("git").arg("-C").arg(&path)
            .args(["rev-parse", "--show-toplevel"]).output().ok()
            .and_then(|o| o.status.success().then(|| String::from_utf8_lossy(&o.stdout).trim().to_string()))
            .unwrap_or_default();
        let branch = format!("systamator/{}", id);
        out.push(WorktreeInfo {
            id, path: path.to_string_lossy().into_owned(),
            repo, branch, created_at,
        });
    }
    Ok(out)
}

fn expand_path(p: &str) -> PathBuf {
    if let Some(rest) = p.strip_prefix("~/") {
        let home = std::env::var("HOME").unwrap_or_default();
        PathBuf::from(format!("{home}/{rest}"))
    } else { PathBuf::from(p) }
}
