// Docker-based sidecar bring-up. Today: Postgres. Designed to scale to
// Redis, a shared MCP host, etc. — each future service gets its own
// `infra_X_up/down/status` trio on the same pattern.
//
// We shell out to the `docker` CLI so whichever engine the user has
// (Docker Desktop, OrbStack, Colima, Rancher, Podman-with-shim) just
// works — we don't talk to the daemon socket directly.

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

const CONTAINER: &str = "systamator-postgres";
const IMAGE:     &str = "postgres:16-alpine";
const PORT:      u16  = 5432;

fn data_dir(app: &AppHandle) -> PathBuf {
    let d = app.path().app_local_data_dir().expect("local data dir").join("pgdata");
    std::fs::create_dir_all(&d).ok();
    d
}

// ── docker check ─────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerInfo {
    pub installed: bool,
    pub version:   Option<String>,
    pub daemon_ok: bool,   // daemon reachable?
}

#[tauri::command]
pub fn infra_docker_check() -> DockerInfo {
    let version = Command::new("docker").arg("--version").output().ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    let daemon_ok = Command::new("docker").args(["info", "--format", "{{.ServerVersion}}"])
        .output().ok()
        .map(|o| o.status.success() && !o.stdout.is_empty())
        .unwrap_or(false);

    DockerInfo { installed: version.is_some(), version, daemon_ok }
}

// ── postgres status ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostgresStatus {
    pub running:   bool,
    pub healthy:   bool,
    pub port:      u16,
    pub url:       String,
    pub container: String,
    pub exists:    bool,   // container present but possibly stopped
}

fn container_exists() -> bool {
    Command::new("docker")
        .args(["ps", "-a", "--filter", &format!("name=^/{CONTAINER}$"), "--format", "{{.Names}}"])
        .output().map(|o| String::from_utf8_lossy(&o.stdout).contains(CONTAINER))
        .unwrap_or(false)
}

fn container_running_status() -> (bool, bool) {
    let out = Command::new("docker")
        .args(["ps", "--filter", &format!("name=^/{CONTAINER}$"), "--format", "{{.Status}}"])
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { (false, false) }
            else {
                let healthy = s.contains("(healthy)");
                let running = s.to_lowercase().starts_with("up");
                (running, healthy)
            }
        }
        Err(_) => (false, false),
    }
}

#[tauri::command]
pub fn infra_postgres_status() -> PostgresStatus {
    let (running, healthy) = container_running_status();
    PostgresStatus {
        running, healthy, port: PORT,
        url: format!("postgres://systamator:systamator@127.0.0.1:{PORT}/systamator_v2"),
        container: CONTAINER.to_string(),
        exists: container_exists(),
    }
}

// ── postgres up ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn infra_postgres_up(
    app: AppHandle,
    state: tauri::State<'_, crate::db::DbState>,
) -> Result<crate::db::DbStatus, String> {
    let check = infra_docker_check();
    if !check.installed {
        return Err("Docker not installed. Install Docker Desktop / OrbStack / Colima first.".into());
    }
    if !check.daemon_ok {
        return Err("Docker daemon not reachable. Start Docker Desktop (or `colima start`) and retry.".into());
    }

    // Create or restart the container.
    if container_exists() {
        let o = Command::new("docker").args(["start", CONTAINER]).output()
            .map_err(|e| format!("docker start: {e}"))?;
        if !o.status.success() {
            return Err(format!("docker start failed: {}", String::from_utf8_lossy(&o.stderr).trim()));
        }
    } else {
        let vol = data_dir(&app).to_string_lossy().to_string();
        let bind     = format!("127.0.0.1:{PORT}:5432");
        let volmount = format!("{vol}:/var/lib/postgresql/data");
        let o = Command::new("docker").args([
            "run", "-d",
            "--name", CONTAINER,
            "-p", &bind,
            "-e", "POSTGRES_USER=systamator",
            "-e", "POSTGRES_PASSWORD=systamator",
            "-e", "POSTGRES_DB=systamator_v2",
            "-v", &volmount,
            "--restart", "unless-stopped",
            "--health-cmd", "pg_isready -U systamator -d systamator_v2",
            "--health-interval", "5s",
            "--health-timeout", "3s",
            "--health-retries", "10",
            IMAGE,
        ]).output().map_err(|e| format!("docker run: {e}"))?;
        if !o.status.success() {
            return Err(format!("docker run failed: {}", String::from_utf8_lossy(&o.stderr).trim()));
        }
    }

    // Wait up to 30s for pg_isready. Polls docker exec pg_isready so we
    // aren't racing the TCP listener vs the database being init-ready.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    loop {
        let ready = Command::new("docker")
            .args(["exec", CONTAINER, "pg_isready", "-U", "systamator", "-d", "systamator_v2"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if ready { break; }
        if std::time::Instant::now() >= deadline {
            return Err("Postgres did not become ready within 30s. `docker logs systamator-postgres` for details.".into());
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    // Persist URL so subsequent boots are hands-off, then reconnect.
    let url = format!("postgres://systamator:systamator@127.0.0.1:{PORT}/systamator_v2");
    crate::db::save_url_override(&app, &url);
    crate::db::db_reconnect(app, state).await
}

// ── postgres down ────────────────────────────────────────────────────

#[tauri::command]
pub fn infra_postgres_down() -> Result<(), String> {
    if !container_exists() { return Ok(()); }
    let _ = Command::new("docker").args(["stop", CONTAINER]).output();
    Ok(())
}
