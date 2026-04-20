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
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct DbState {
    pub pool: Arc<Mutex<Option<Pool<Postgres>>>>,
}

impl DbState {
    pub fn new() -> Self { Self { pool: Arc::new(Mutex::new(None)) } }
}

pub async fn try_connect() -> Result<Pool<Postgres>, String> {
    let url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://systamator:systamator@127.0.0.1:5435/systamator_v2".into());
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
}

#[tauri::command]
pub async fn db_status(state: tauri::State<'_, DbState>) -> Result<DbStatus, String> {
    let guard = state.pool.lock().await;
    match guard.as_ref() {
        Some(_) => Ok(DbStatus { connected: true,  message: "Postgres connected".into() }),
        None    => Ok(DbStatus { connected: false, message: "Postgres not connected — check DATABASE_URL".into() }),
    }
}
