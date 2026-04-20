// Postgres pool + migrations.
//
// v2 keeps v1's tables intact (so the import-from-v1 path is straight SQL
// copy) but adds:
//   resources       — fleet (ssh/docker/db/browser/mcp/repo)
//   agents          — Team Lead / Manager / IC profiles
//   runs            — top-level goal runs
//   steps           — PAUN steps inside a run
//   skills          — distilled reusable tactics (mirrors OpenSpace)
//   failures        — anti-patterns per agent
//   keychain_index  — list of (namespace,key) for the Settings UI
//
// Migrations live in src-tauri/migrations/*.sql and are applied in order
// at startup. Never edit a migration after release — write a new one.

use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres, postgres::PgPoolOptions};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

const DEFAULT_URL: &str = "postgres://systamator:systamator@127.0.0.1:5432/systamator_v2";

#[derive(Clone)]
pub struct DbState {
    pub pool: Arc<Mutex<Option<Pool<Postgres>>>>,
}

impl DbState {
    pub fn new() -> Self { Self { pool: Arc::new(Mutex::new(None)) } }
}

fn config_path(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_local_data_dir().expect("app local data dir");
    std::fs::create_dir_all(&dir).ok();
    dir.join("db.json")
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DbConfig {
    url: Option<String>,
}

fn load_config(app: &AppHandle) -> DbConfig {
    let p = config_path(app);
    if !p.exists() { return DbConfig::default(); }
    serde_json::from_str(&std::fs::read_to_string(p).unwrap_or_default()).unwrap_or_default()
}

fn save_config(app: &AppHandle, cfg: &DbConfig) {
    let _ = std::fs::write(config_path(app), serde_json::to_string_pretty(cfg).unwrap_or_default());
}

/// Persist a URL override from outside this module (e.g. docker bring-up
/// wants the next boot to already know where Postgres is).
pub fn save_url_override(app: &AppHandle, url: &str) {
    save_config(app, &DbConfig { url: Some(url.to_string()) });
}

/// Resolve URL with precedence: env DATABASE_URL → config file → default.
pub fn effective_url(app: Option<&AppHandle>) -> (String, &'static str) {
    if let Ok(v) = std::env::var("DATABASE_URL") { return (v, "env"); }
    if let Some(a) = app {
        if let Some(u) = load_config(a).url.filter(|s| !s.is_empty()) { return (u, "settings"); }
    }
    (DEFAULT_URL.to_string(), "default")
}

pub async fn try_connect(app: Option<&AppHandle>) -> Result<Pool<Postgres>, String> {
    let (url, _src) = effective_url(app);
    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&url)
        .await
        .map_err(|e| format!("connect: {e}"))
}

pub async fn run_migrations(pool: &Pool<Postgres>) -> Result<(), String> {
    // Embedded migrations — bundled via include_str so we don't need files
    // at runtime. Idempotent CREATE TABLE IF NOT EXISTS keeps this safe.
    let scripts: &[&str] = &[
        include_str!("../migrations/001_init.sql"),
        include_str!("../migrations/002_embeddings.sql"),
    ];
    for sql in scripts {
        sqlx::query(sql).execute(pool).await
            .map_err(|e| format!("migration failed: {e}"))?;
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbStatus {
    pub connected: bool,
    pub message:   String,
    pub url:       String,
    pub source:    String, // "env" | "settings" | "default"
}

#[tauri::command]
pub async fn db_status(app: AppHandle, state: tauri::State<'_, DbState>) -> Result<DbStatus, String> {
    let guard = state.pool.lock().await;
    let (url, source) = effective_url(Some(&app));
    Ok(DbStatus {
        connected: guard.is_some(),
        message: if guard.is_some() { "Postgres connected".into() } else { format!("Postgres not connected — tried {url}") },
        url,
        source: source.into(),
    })
}

/// Force a reconnect — used by the Postgres gate + Diagnostics panel.
/// Closes the old pool, picks up whatever URL is currently effective
/// (env → settings → default), runs migrations on the new pool.
#[tauri::command]
pub async fn db_reconnect(app: AppHandle, state: tauri::State<'_, DbState>) -> Result<DbStatus, String> {
    let mut guard = state.pool.lock().await;
    *guard = None;
    drop(guard);
    let (url, source) = effective_url(Some(&app));
    match try_connect(Some(&app)).await {
        Ok(pool) => {
            run_migrations(&pool).await?;
            let mut g = state.pool.lock().await;
            *g = Some(pool);
            Ok(DbStatus { connected: true, message: "Reconnected + migrations applied".into(), url, source: source.into() })
        }
        Err(e) => Ok(DbStatus { connected: false, message: format!("reconnect failed: {e}"), url, source: source.into() }),
    }
}

/// Persist a DATABASE_URL override and reconnect. Empty string clears
/// the override so the app falls back to env or default.
#[tauri::command]
pub async fn db_set_url(app: AppHandle, state: tauri::State<'_, DbState>, url: String) -> Result<DbStatus, String> {
    let trimmed = url.trim().to_string();
    save_config(&app, &DbConfig {
        url: if trimmed.is_empty() { None } else { Some(trimmed) },
    });
    db_reconnect(app, state).await
}
