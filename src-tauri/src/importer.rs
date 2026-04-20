// v1 → v2 importer.
//
// v1 kept SSH credentials + MCP server specs as JSON files under its app
// local data dir. The conversations lived in localStorage which we can't
// reach from Rust, so this importer focuses on the two stores that are
// actually on disk:
//
//   ~/Library/Application Support/com.systamator.app/ssh_credentials.json
//   ~/Library/Application Support/com.systamator.app/mcp_servers.json
//
// SSH credentials become v2 resources (kind=ssh, meta carries host/port/
// username/auth_type/key_path — secrets go to the OS keychain). MCP
// specs are written into v2's own mcp_servers.json but with trusted=false
// so the user must re-approve each one.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use sqlx::Row;
use uuid::Uuid;

use crate::db::DbState;
use crate::keychain;

fn v1_data_dir() -> Option<PathBuf> {
    // macOS only for v1 — that's where v1 runs.
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join("Library/Application Support/com.systamator.app"))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct V1SshCred {
    id: String,
    name: String,
    host: String,
    port: Option<u16>,
    username: String,
    #[serde(alias = "authType")]
    auth_type: Option<String>,
    password: Option<String>,
    #[serde(alias = "keyPath")]
    key_path: Option<String>,
    #[serde(alias = "keyPassphrase")]
    key_passphrase: Option<String>,
    color: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct V1McpSpec {
    name: String,
    command: String,
    #[serde(default)] args: Vec<String>,
    #[serde(default)] env: std::collections::HashMap<String, String>,
    #[serde(default)] description: String,
    #[serde(default)] trusted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub v1_path:        String,
    pub exists:         bool,
    pub ssh_found:      usize,
    pub ssh_imported:   usize,
    pub mcp_found:      usize,
    pub mcp_imported:   usize,
    pub errors:         Vec<String>,
}

#[tauri::command]
pub async fn v1_import(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
) -> Result<ImportReport, String> {
    let dir = v1_data_dir().ok_or("HOME not set")?;
    let mut report = ImportReport {
        v1_path: dir.to_string_lossy().into_owned(),
        exists:  dir.exists(),
        ssh_found: 0, ssh_imported: 0,
        mcp_found: 0, mcp_imported: 0,
        errors: vec![],
    };
    if !report.exists { return Ok(report); }

    // ── SSH credentials ──────────────────────────────────────────────
    let ssh_path = dir.join("ssh_credentials.json");
    if ssh_path.exists() {
        match std::fs::read_to_string(&ssh_path)
            .map_err(|e| e.to_string())
            .and_then(|raw| serde_json::from_str::<Vec<V1SshCred>>(&raw).map_err(|e| e.to_string()))
        {
            Ok(creds) => {
                report.ssh_found = creds.len();
                let guard = state.pool.lock().await;
                match guard.as_ref() {
                    Some(pool) => {
                        for c in creds {
                            let id = Uuid::new_v4();
                            let meta = serde_json::json!({
                                "host":     c.host,
                                "port":     c.port.unwrap_or(22),
                                "username": c.username,
                                "authType": c.auth_type,
                                "keyPath":  c.key_path,
                                "color":    c.color,
                                "v1Id":     c.id,
                            });
                            let tags: Vec<String> = vec!["imported-from-v1".into()];
                            let r = sqlx::query("
                                INSERT INTO resources(id, kind, name, meta, tags)
                                VALUES ($1, 'ssh', $2, $3, $4)
                                ON CONFLICT (name) DO UPDATE SET meta = EXCLUDED.meta, tags = EXCLUDED.tags, updated_at = now()
                            ")
                            .bind(id).bind(&c.name).bind(&meta).bind(&tags)
                            .execute(pool).await;
                            match r {
                                Ok(_) => {
                                    // Secrets → keychain.
                                    if let Some(pw) = c.password.as_ref().filter(|s| !s.is_empty()) {
                                        let _ = keychain::keychain_set("ssh".into(), format!("{}.password", c.name), pw.clone());
                                    }
                                    if let Some(pp) = c.key_passphrase.as_ref().filter(|s| !s.is_empty()) {
                                        let _ = keychain::keychain_set("ssh".into(), format!("{}.keyPassphrase", c.name), pp.clone());
                                    }
                                    report.ssh_imported += 1;
                                }
                                Err(e) => report.errors.push(format!("ssh {}: {e}", c.name)),
                            }
                        }
                    }
                    None => report.errors.push("db not connected — SSH resources skipped".into()),
                }
            }
            Err(e) => report.errors.push(format!("ssh_credentials.json: {e}")),
        }
    }

    // ── MCP servers ──────────────────────────────────────────────────
    let mcp_path = dir.join("mcp_servers.json");
    if mcp_path.exists() {
        match std::fs::read_to_string(&mcp_path)
            .map_err(|e| e.to_string())
            .and_then(|raw| serde_json::from_str::<Vec<V1McpSpec>>(&raw).map_err(|e| e.to_string()))
        {
            Ok(specs) => {
                report.mcp_found = specs.len();
                // Merge into v2's own mcp_servers.json with trusted=false.
                let v2_path = {
                    let dir = app_local_data_dir(&app)?;
                    dir.join("mcp_servers.json")
                };
                let mut existing: Vec<V1McpSpec> = if v2_path.exists() {
                    serde_json::from_str(&std::fs::read_to_string(&v2_path).unwrap_or_default()).unwrap_or_default()
                } else { vec![] };
                for mut s in specs {
                    if existing.iter().any(|e| e.name == s.name) { continue; }
                    s.trusted = false;
                    existing.push(s);
                    report.mcp_imported += 1;
                }
                let _ = std::fs::write(&v2_path, serde_json::to_string_pretty(&existing).unwrap_or_default());
            }
            Err(e) => report.errors.push(format!("mcp_servers.json: {e}")),
        }
    }

    Ok(report)
}

fn app_local_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).ok();
    Ok(dir)
}
