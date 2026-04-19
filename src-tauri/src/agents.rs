// Agent profiles (Team Lead / Manager / IC) — see docs/SYSTAMATOR-V2-ORG.md.
//
// M0 covers persistence and basic stats updates. Bidding + retros land in M1.

use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    pub id:         String,
    pub tier:       String,                       // lead / manager / ic
    pub speciality: String,
    pub parent_id:  Option<String>,
    pub manifest:   serde_json::Value,
    pub stats:      serde_json::Value,
    pub active:     bool,
}

#[tauri::command]
pub async fn agent_list(state: tauri::State<'_, DbState>) -> Result<Vec<AgentProfile>, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let rows = sqlx::query("SELECT id, tier, speciality, parent_id, manifest, stats, active FROM agents ORDER BY tier, speciality")
        .fetch_all(pool).await.map_err(|e| e.to_string())?;
    Ok(rows.iter().map(|r| AgentProfile {
        id:         r.get("id"),
        tier:       r.get("tier"),
        speciality: r.get("speciality"),
        parent_id:  r.try_get("parent_id").ok(),
        manifest:   r.get("manifest"),
        stats:      r.get("stats"),
        active:     r.get("active"),
    }).collect())
}

#[tauri::command]
pub async fn agent_save(state: tauri::State<'_, DbState>, agent: AgentProfile) -> Result<(), String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    sqlx::query("
        INSERT INTO agents(id, tier, speciality, parent_id, manifest, stats, active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          tier = EXCLUDED.tier,
          speciality = EXCLUDED.speciality,
          parent_id = EXCLUDED.parent_id,
          manifest = EXCLUDED.manifest,
          stats = EXCLUDED.stats,
          active = EXCLUDED.active,
          updated_at = now()
    ")
    .bind(&agent.id)
    .bind(&agent.tier)
    .bind(&agent.speciality)
    .bind(&agent.parent_id)
    .bind(&agent.manifest)
    .bind(&agent.stats)
    .bind(agent.active)
    .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn agent_delete(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    sqlx::query("DELETE FROM agents WHERE id = $1").bind(&id)
        .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutcomeReport {
    pub agent_id:  String,
    pub success:   bool,
    pub tokens:    i64,
    pub wall_ms:   i64,
}

/// EWMA-update an agent's expertiseScore + counters after a step.
/// EWMA constant 0.2 — tuned so 5 wins flip a fresh agent from 0.5 → ~0.85.
#[tauri::command]
pub async fn agent_record_outcome(state: tauri::State<'_, DbState>, report: OutcomeReport) -> Result<(), String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let alpha = 0.2_f64;
    let win = if report.success { 1.0_f64 } else { 0.0_f64 };
    sqlx::query("
        UPDATE agents
           SET stats = jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       jsonb_set(
                         jsonb_set(stats,
                           '{runs}',          to_jsonb((COALESCE(stats->>'runs','0')::int) + 1)),
                         '{wins}',            to_jsonb((COALESCE(stats->>'wins','0')::int) + $2::int)),
                       '{losses}',            to_jsonb((COALESCE(stats->>'losses','0')::int) + $3::int)),
                     '{tokensSpent}',         to_jsonb((COALESCE(stats->>'tokensSpent','0')::int) + $4::int)),
                   '{avgWallMs}',             to_jsonb((COALESCE(stats->>'avgWallMs','0')::int + $5::int) / 2)),
                 '{expertiseScore}',          to_jsonb(((COALESCE(stats->>'expertiseScore','0.5')::float) * (1.0 - $6::float)) + ($7::float * $6::float))),
              updated_at = now()
         WHERE id = $1
    ")
    .bind(&report.agent_id)
    .bind(if report.success { 1_i32 } else { 0_i32 })
    .bind(if report.success { 0_i32 } else { 1_i32 })
    .bind(report.tokens as i32)
    .bind(report.wall_ms as i32)
    .bind(alpha)
    .bind(win)
    .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}
