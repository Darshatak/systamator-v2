// Fleet resources — SSH / Docker / DB / Browser / MCP / Repo.
// CRUD only in M0; agent-observed `facts` populated in M2.

use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Resource {
    pub id:    String,
    pub kind:  String,
    pub name:  String,
    pub meta:  serde_json::Value,
    pub tags:  Vec<String>,
    pub facts: serde_json::Value,
}

#[tauri::command]
pub async fn resource_list(state: tauri::State<'_, DbState>, kind: Option<String>) -> Result<Vec<Resource>, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let rows = sqlx::query("SELECT * FROM resources WHERE ($1::text IS NULL OR kind = $1) ORDER BY name")
        .bind(&kind)
        .fetch_all(pool).await.map_err(|e| e.to_string())?;
    Ok(rows.iter().map(|r| Resource {
        id:    r.get::<Uuid, _>("id").to_string(),
        kind:  r.get("kind"),
        name:  r.get("name"),
        meta:  r.get("meta"),
        tags:  r.try_get("tags").unwrap_or_default(),
        facts: r.get("facts"),
    }).collect())
}

#[tauri::command]
pub async fn resource_save(state: tauri::State<'_, DbState>, mut resource: Resource) -> Result<Resource, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let id = if resource.id.is_empty() {
        let new = Uuid::new_v4();
        resource.id = new.to_string();
        new
    } else {
        Uuid::parse_str(&resource.id).map_err(|e| e.to_string())?
    };
    sqlx::query("
        INSERT INTO resources(id, kind, name, meta, tags, facts)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          kind = EXCLUDED.kind, name = EXCLUDED.name, meta = EXCLUDED.meta,
          tags = EXCLUDED.tags, facts = EXCLUDED.facts, updated_at = now()
    ")
    .bind(id).bind(&resource.kind).bind(&resource.name).bind(&resource.meta)
    .bind(&resource.tags).bind(&resource.facts)
    .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(resource)
}

#[tauri::command]
pub async fn resource_delete(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    sqlx::query("DELETE FROM resources WHERE id = $1")
        .bind(Uuid::parse_str(&id).map_err(|e| e.to_string())?)
        .execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}
