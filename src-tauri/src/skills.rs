// Skills + Failures (M0 stubs).
//
// Real semantic search via fastembed lands in M2 alongside the OpenSpace
// MCP wiring. M0 ships a literal LIKE-search so the UI can already render
// the Skills screen with mocked + manually-recorded entries.

use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::db::DbState;
use crate::embeddings;

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

    // Embed the title + description + trigger so future goals can cosine-
    // match against this skill. Best-effort: if fastembed isn't loaded
    // yet (first-run model download, no network) we save with NULL and
    // backfill later.
    let embed_source = format!("{}\n{}\n{}",
        input.title,
        input.description,
        input.trigger.clone().unwrap_or_default());
    let embedding = embeddings::embed_text(&embed_source).ok();
    let embedding_json = embedding.map(|v| serde_json::to_value(v).ok()).flatten();

    sqlx::query("INSERT INTO skills(id, agent_id, title, description, trigger, precondition, recipe, origin, embedding) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)")
        .bind(id)
        .bind(&input.agent_id)
        .bind(&input.title)
        .bind(&input.description)
        .bind(&input.trigger)
        .bind(&input.precondition)
        .bind(&input.recipe)
        .bind(input.origin.unwrap_or_else(|| "learned".to_string()))
        .bind(&embedding_json)
        .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(id.to_string())
}

/// Backfill embeddings for existing skills that have NULL — runs on
/// demand when the orchestrator first loads, giving post-update users a
/// populated skill library without a reindex step they have to trigger.
#[tauri::command]
pub async fn skill_reindex(state: tauri::State<'_, DbState>) -> Result<usize, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let rows = sqlx::query("SELECT id, title, description, trigger FROM skills WHERE embedding IS NULL LIMIT 200")
        .fetch_all(pool).await.map_err(|e| e.to_string())?;
    let mut done = 0;
    for r in rows {
        let id: Uuid = r.get("id");
        let title: String = r.get("title");
        let description: String = r.get("description");
        let trigger: Option<String> = r.try_get("trigger").ok();
        let text = format!("{title}\n{description}\n{}", trigger.unwrap_or_default());
        if let Ok(vec) = embeddings::embed_text(&text) {
            let j = serde_json::to_value(vec).ok();
            let _ = sqlx::query("UPDATE skills SET embedding = $1 WHERE id = $2")
                .bind(&j).bind(id).execute(pool).await;
            done += 1;
        }
    }
    Ok(done)
}

// ── Marketplace: export / import / remote fetch ──────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillBundle { pub version: u32, pub generated: String, pub skills: Vec<ExportedSkill> }

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedSkill {
    pub title:        String,
    pub description:  String,
    pub trigger:      Option<String>,
    pub precondition: Vec<String>,
    pub recipe:       serde_json::Value,
    pub origin:       String,
}

#[tauri::command]
pub async fn skill_export(state: tauri::State<'_, DbState>) -> Result<String, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let rows = sqlx::query("SELECT title, description, trigger, precondition, recipe, origin FROM skills ORDER BY created_at")
        .fetch_all(pool).await.map_err(|e| e.to_string())?;
    let skills: Vec<ExportedSkill> = rows.iter().map(|r| ExportedSkill {
        title:        r.get("title"),
        description:  r.get("description"),
        trigger:      r.try_get("trigger").ok(),
        precondition: r.try_get("precondition").unwrap_or_default(),
        recipe:       r.get("recipe"),
        origin:       r.get("origin"),
    }).collect();
    let bundle = SkillBundle { version: 1, generated: chrono::Utc::now().to_rfc3339(), skills };
    serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn skill_import(state: tauri::State<'_, DbState>, bundle_json: String) -> Result<usize, String> {
    let bundle: SkillBundle = serde_json::from_str(&bundle_json).map_err(|e| format!("bundle parse: {e}"))?;
    if bundle.version != 1 { return Err(format!("unsupported bundle version: {}", bundle.version)); }
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let mut added = 0usize;
    for s in bundle.skills {
        let exists: Option<sqlx::postgres::PgRow> = sqlx::query("SELECT id FROM skills WHERE title = $1 LIMIT 1")
            .bind(&s.title).fetch_optional(pool).await.map_err(|e| e.to_string())?;
        if exists.is_some() { continue; }
        let embed_text = format!("{}\n{}\n{}", s.title, s.description, s.trigger.clone().unwrap_or_default());
        let embedding_json = embeddings::embed_text(&embed_text).ok().and_then(|v| serde_json::to_value(v).ok());
        sqlx::query("INSERT INTO skills(id, agent_id, title, description, trigger, precondition, recipe, origin, embedding) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)")
            .bind(Uuid::new_v4())
            .bind(&s.title).bind(&s.description).bind(&s.trigger)
            .bind(&s.precondition).bind(&s.recipe).bind(&s.origin)
            .bind(&embedding_json)
            .execute(pool).await.map_err(|e| format!("insert '{}': {e}", s.title))?;
        added += 1;
    }
    Ok(added)
}

#[tauri::command]
pub async fn skill_fetch_remote(state: tauri::State<'_, DbState>, url: String) -> Result<usize, String> {
    let normalised = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
    let res = reqwest::Client::new().get(&normalised).send().await.map_err(|e| format!("fetch: {e}"))?;
    if !res.status().is_success() { return Err(format!("fetch {} returned {}", normalised, res.status())); }
    let body = res.text().await.map_err(|e| format!("body: {e}"))?;
    skill_import(state, body).await
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
