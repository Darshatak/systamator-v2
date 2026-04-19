// Runs + Steps. Persistence layer for the agent execution graph.
//
// M0 ships CRUD + append-only step log. The PAUN orchestrator (M1) will
// consume the same primitives: every Step transition writes here so reloads
// + retros + Inbox approvals all see the same authoritative timeline.

use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id:           String,
    pub goal:         String,
    pub status:       String,
    pub task_type:    Option<String>,
    pub conductor_id: Option<String>,
    pub started_at:   chrono::DateTime<chrono::Utc>,
    pub finished_at:  Option<chrono::DateTime<chrono::Utc>>,
    pub cost:         serde_json::Value,
    pub summary:      Option<String>,
    pub meta:         serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub id:          String,
    pub run_id:      String,
    pub agent_id:    Option<String>,
    pub kind:        String,
    pub label:       String,
    pub status:      String,
    pub depends_on:  Vec<String>,
    pub input:       serde_json::Value,
    pub output:      Option<serde_json::Value>,
    pub critique:    Option<serde_json::Value>,
    pub retries:     i32,
    pub cost:        serde_json::Value,
    pub started_at:  Option<chrono::DateTime<chrono::Utc>>,
    pub finished_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[tauri::command]
pub async fn run_list(state: tauri::State<'_, DbState>, limit: Option<i32>) -> Result<Vec<Run>, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let rows = sqlx::query("SELECT * FROM runs ORDER BY started_at DESC LIMIT $1")
        .bind(limit.unwrap_or(50))
        .fetch_all(pool).await.map_err(|e| e.to_string())?;
    Ok(rows.iter().map(|r| Run {
        id:           r.get::<Uuid, _>("id").to_string(),
        goal:         r.get("goal"),
        status:       r.get("status"),
        task_type:    r.try_get("task_type").ok(),
        conductor_id: r.try_get("conductor_id").ok(),
        started_at:   r.get("started_at"),
        finished_at:  r.try_get("finished_at").ok(),
        cost:         r.get("cost"),
        summary:      r.try_get("summary").ok(),
        meta:         r.get("meta"),
    }).collect())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRunInput {
    pub goal:         String,
    pub task_type:    Option<String>,
    pub conductor_id: Option<String>,
}

#[tauri::command]
pub async fn run_create(state: tauri::State<'_, DbState>, input: CreateRunInput) -> Result<String, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO runs(id, goal, task_type, conductor_id) VALUES ($1, $2, $3, $4)")
        .bind(id)
        .bind(&input.goal)
        .bind(&input.task_type)
        .bind(&input.conductor_id)
        .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(id.to_string())
}

#[tauri::command]
pub async fn run_get(state: tauri::State<'_, DbState>, run_id: String) -> Result<(Run, Vec<Step>), String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let r = sqlx::query("SELECT * FROM runs WHERE id = $1")
        .bind(Uuid::parse_str(&run_id).map_err(|e| e.to_string())?)
        .fetch_one(pool).await.map_err(|e| e.to_string())?;
    let run = Run {
        id:           r.get::<Uuid, _>("id").to_string(),
        goal:         r.get("goal"),
        status:       r.get("status"),
        task_type:    r.try_get("task_type").ok(),
        conductor_id: r.try_get("conductor_id").ok(),
        started_at:   r.get("started_at"),
        finished_at:  r.try_get("finished_at").ok(),
        cost:         r.get("cost"),
        summary:      r.try_get("summary").ok(),
        meta:         r.get("meta"),
    };
    let step_rows = sqlx::query("SELECT * FROM steps WHERE run_id = $1 ORDER BY started_at NULLS LAST, id")
        .bind(Uuid::parse_str(&run_id).map_err(|e| e.to_string())?)
        .fetch_all(pool).await.map_err(|e| e.to_string())?;
    let steps = step_rows.iter().map(|r| Step {
        id:          r.get::<Uuid, _>("id").to_string(),
        run_id:      r.get::<Uuid, _>("run_id").to_string(),
        agent_id:    r.try_get("agent_id").ok(),
        kind:        r.get("kind"),
        label:       r.get("label"),
        status:      r.get("status"),
        depends_on:  r.get("depends_on"),
        input:       r.get("input"),
        output:      r.try_get("output").ok(),
        critique:    r.try_get("critique").ok(),
        retries:     r.get("retries"),
        cost:        r.get("cost"),
        started_at:  r.try_get("started_at").ok(),
        finished_at: r.try_get("finished_at").ok(),
    }).collect();
    Ok((run, steps))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendStepInput {
    pub run_id:     String,
    pub agent_id:   Option<String>,
    pub kind:       String,
    pub label:      String,
    pub depends_on: Vec<String>,
    pub input:      serde_json::Value,
}

#[tauri::command]
pub async fn run_append_step(state: tauri::State<'_, DbState>, input: AppendStepInput) -> Result<String, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO steps(id, run_id, agent_id, kind, label, depends_on, input, started_at, status) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), 'running')")
        .bind(id)
        .bind(Uuid::parse_str(&input.run_id).map_err(|e| e.to_string())?)
        .bind(&input.agent_id)
        .bind(&input.kind)
        .bind(&input.label)
        .bind(&input.depends_on)
        .bind(&input.input)
        .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(id.to_string())
}

#[tauri::command]
pub async fn run_finish(state: tauri::State<'_, DbState>, run_id: String, summary: Option<String>, status: String) -> Result<(), String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    sqlx::query("UPDATE runs SET status=$2, summary=$3, finished_at=now() WHERE id=$1")
        .bind(Uuid::parse_str(&run_id).map_err(|e| e.to_string())?)
        .bind(&status)
        .bind(&summary)
        .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}
