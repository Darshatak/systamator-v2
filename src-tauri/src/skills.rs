// Skills + Failures (M0 stubs).
//
// Real semantic search via fastembed lands in M2 alongside the OpenSpace
// MCP wiring. M0 ships a literal LIKE-search so the UI can already render
// the Skills screen with mocked + manually-recorded entries.

use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id:            String,
    pub agent_id:      Option<String>,
    pub title:         String,
    pub description:   String,
    pub trigger:       Option<String>,
    pub precondition:  Vec<String>,
    pub recipe:        serde_json::Value,
    pub origin:        String,
    pub success_count: i32,
    pub failure_count: i32,
}

#[tauri::command]
pub async fn skill_list(state: tauri::State<'_, DbState>, agent_id: Option<String>) -> Result<Vec<Skill>, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let rows = sqlx::query("SELECT * FROM skills WHERE ($1::text IS NULL OR agent_id = $1) ORDER BY success_count DESC, last_used_at DESC NULLS LAST")
        .bind(&agent_id)
        .fetch_all(pool).await.map_err(|e| e.to_string())?;
    Ok(rows.iter().map(skill_from_row).collect())
}

#[tauri::command]
pub async fn skill_search(state: tauri::State<'_, DbState>, query: String, top_k: Option<i32>) -> Result<Vec<Skill>, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let q = format!("%{}%", query.to_lowercase());
    let rows = sqlx::query("SELECT * FROM skills WHERE LOWER(title) LIKE $1 OR LOWER(description) LIKE $1 ORDER BY success_count DESC LIMIT $2")
        .bind(&q)
        .bind(top_k.unwrap_or(10))
        .fetch_all(pool).await.map_err(|e| e.to_string())?;
    Ok(rows.iter().map(skill_from_row).collect())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordSkillInput {
    pub agent_id:    Option<String>,
    pub title:       String,
    pub description: String,
    pub trigger:     Option<String>,
    pub precondition:Vec<String>,
    pub recipe:      serde_json::Value,
    pub origin:      Option<String>,
}

#[tauri::command]
pub async fn skill_record(state: tauri::State<'_, DbState>, input: RecordSkillInput) -> Result<String, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO skills(id, agent_id, title, description, trigger, precondition, recipe, origin) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)")
        .bind(id)
        .bind(&input.agent_id)
        .bind(&input.title)
        .bind(&input.description)
        .bind(&input.trigger)
        .bind(&input.precondition)
        .bind(&input.recipe)
        .bind(input.origin.unwrap_or_else(|| "learned".to_string()))
        .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(id.to_string())
}

fn skill_from_row(r: &sqlx::postgres::PgRow) -> Skill {
    Skill {
        id:            r.get::<Uuid, _>("id").to_string(),
        agent_id:      r.try_get("agent_id").ok(),
        title:         r.get("title"),
        description:   r.get("description"),
        trigger:       r.try_get("trigger").ok(),
        precondition:  r.try_get("precondition").unwrap_or_default(),
        recipe:        r.get("recipe"),
        origin:        r.get("origin"),
        success_count: r.get("success_count"),
        failure_count: r.get("failure_count"),
    }
}
