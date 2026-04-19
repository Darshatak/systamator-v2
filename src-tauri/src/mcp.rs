// MCP client — stdio JSON-RPC 2.0. Spawns child processes, runs the
// initialize handshake, exposes tools/list + tools/call. Registry is
// persisted (see McpServerSpec) to the app data dir; each server has a
// trust flag that gates spawning.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex, RwLock};

fn specs_path(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_local_data_dir().expect("local data dir");
    std::fs::create_dir_all(&dir).ok();
    dir.join("mcp_servers.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerSpec {
    pub name:        String,
    pub command:     String,
    pub args:        Vec<String>,
    #[serde(default)] pub env:         HashMap<String, String>,
    #[serde(default)] pub description: String,
    #[serde(default)] pub trusted:     bool,
}

fn load_specs(app: &AppHandle) -> Vec<McpServerSpec> {
    let p = specs_path(app);
    if !p.exists() { return vec![]; }
    serde_json::from_str(&std::fs::read_to_string(p).unwrap_or_default()).unwrap_or_default()
}
fn save_specs(app: &AppHandle, specs: &[McpServerSpec]) {
    if let Ok(j) = serde_json::to_string_pretty(specs) {
        let _ = std::fs::write(specs_path(app), j);
    }
}

type PendingMap = Mutex<HashMap<u64, oneshot::Sender<Value>>>;

pub struct McpClient {
    stdin:       Mutex<ChildStdin>,
    next_id:     AtomicU64,
    pending:     Arc<PendingMap>,
    initialized: Mutex<bool>,
    _child:      Mutex<Child>,
}

impl McpClient {
    async fn spawn(spec: McpServerSpec) -> Result<Arc<Self>, String> {
        let mut cmd = Command::new(&spec.command);
        cmd.args(&spec.args);
        for (k, v) in &spec.env { cmd.env(k, v); }
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);

        let mut child = cmd.spawn().map_err(|e| format!("spawn '{}': {e}", spec.command))?;
        let stdin = child.stdin.take().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        if let Some(err) = child.stderr.take() {
            let name = spec.name.clone();
            tokio::spawn(async move {
                let mut r = BufReader::new(err).lines();
                while let Ok(Some(line)) = r.next_line().await {
                    eprintln!("[mcp:{name}] {line}");
                }
            });
        }

        let pending: Arc<PendingMap> = Arc::new(Mutex::new(HashMap::new()));
        let pending_bg = pending.clone();
        tokio::spawn(async move {
            let mut r = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = r.next_line().await {
                if let Ok(msg) = serde_json::from_str::<Value>(&line) {
                    if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
                        if let Some(tx) = pending_bg.lock().await.remove(&id) {
                            let _ = tx.send(msg);
                        }
                    }
                }
            }
        });

        let client = Arc::new(Self {
            stdin: Mutex::new(stdin), next_id: AtomicU64::new(1),
            pending, initialized: Mutex::new(false), _child: Mutex::new(child),
        });
        client.handshake().await?;
        Ok(client)
    }

    async fn send(&self, mut msg: Value, want_response: bool) -> Result<Value, String> {
        if want_response {
            let id = self.next_id.fetch_add(1, Ordering::Relaxed);
            msg["id"] = json!(id);
            let (tx, rx) = oneshot::channel();
            self.pending.lock().await.insert(id, tx);
            self.write_line(&msg).await?;
            match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
                Ok(Ok(v)) => Ok(v),
                Ok(Err(_)) => Err("channel closed".into()),
                Err(_) => { self.pending.lock().await.remove(&id); Err("mcp timeout".into()) }
            }
        } else {
            self.write_line(&msg).await?;
            Ok(Value::Null)
        }
    }

    async fn write_line(&self, msg: &Value) -> Result<(), String> {
        let mut line = serde_json::to_string(msg).map_err(|e| e.to_string())?;
        line.push('\n');
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(line.as_bytes()).await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn handshake(&self) -> Result<(), String> {
        if *self.initialized.lock().await { return Ok(()); }
        let init = json!({
            "jsonrpc":"2.0","method":"initialize","params":{
                "protocolVersion":"2024-11-05",
                "capabilities":{"tools":{}},
                "clientInfo":{"name":"systamator-v2","version":env!("CARGO_PKG_VERSION")}
            }
        });
        let r = self.send(init, true).await?;
        if r.get("error").is_some() { return Err(format!("init: {}", r["error"])); }
        let _ = self.send(json!({"jsonrpc":"2.0","method":"notifications/initialized"}), false).await;
        *self.initialized.lock().await = true;
        Ok(())
    }

    pub async fn list_tools(&self) -> Result<Value, String> {
        let r = self.send(json!({"jsonrpc":"2.0","method":"tools/list","params":{}}), true).await?;
        if r.get("error").is_some() { return Err(format!("tools/list: {}", r["error"])); }
        Ok(r.get("result").cloned().unwrap_or(Value::Null))
    }

    pub async fn call(&self, name: &str, args: Value) -> Result<Value, String> {
        let r = self.send(json!({"jsonrpc":"2.0","method":"tools/call","params":{"name":name,"arguments":args}}), true).await?;
        if r.get("error").is_some() { return Err(format!("tools/call({name}): {}", r["error"])); }
        Ok(r.get("result").cloned().unwrap_or(Value::Null))
    }
}

pub struct McpState { pub clients: RwLock<HashMap<String, Arc<McpClient>>> }
impl McpState {
    pub fn new() -> Self { Self { clients: RwLock::new(HashMap::new()) } }
    async fn ensure(&self, app: &AppHandle, name: &str) -> Result<Arc<McpClient>, String> {
        if let Some(c) = self.clients.read().await.get(name).cloned() { return Ok(c); }
        let spec = load_specs(app).into_iter().find(|s| s.name == name).ok_or_else(|| format!("'{name}' not registered"))?;
        if !spec.trusted { return Err(format!("'{name}' not trusted — approve in Settings")); }
        let client = McpClient::spawn(spec).await?;
        self.clients.write().await.insert(name.to_string(), client.clone());
        Ok(client)
    }
    async fn stop(&self, name: &str) { self.clients.write().await.remove(name); }
}

#[tauri::command]
pub fn mcp_list_servers(app: AppHandle) -> Vec<McpServerSpec> { load_specs(&app) }

#[tauri::command]
pub fn mcp_save_server(app: AppHandle, spec: McpServerSpec) -> Result<McpServerSpec, String> {
    if spec.name.is_empty() || spec.command.is_empty() { return Err("name + command required".into()); }
    let mut all = load_specs(&app);
    if let Some(e) = all.iter_mut().find(|s| s.name == spec.name) { *e = spec.clone(); } else { all.push(spec.clone()); }
    save_specs(&app, &all);
    Ok(spec)
}

#[tauri::command]
pub async fn mcp_remove_server(app: AppHandle, state: tauri::State<'_, McpState>, name: String) -> Result<(), String> {
    state.stop(&name).await;
    let all: Vec<_> = load_specs(&app).into_iter().filter(|s| s.name != name).collect();
    save_specs(&app, &all);
    Ok(())
}

#[tauri::command]
pub fn mcp_set_trusted(app: AppHandle, name: String, trusted: bool) -> Result<(), String> {
    let mut all = load_specs(&app);
    let s = all.iter_mut().find(|s| s.name == name).ok_or("not found")?;
    s.trusted = trusted;
    save_specs(&app, &all);
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus { pub name: String, pub command: String, pub running: bool, pub trusted: bool }

#[tauri::command]
pub async fn mcp_server_status(app: AppHandle, state: tauri::State<'_, McpState>) -> Result<Vec<McpServerStatus>, String> {
    let specs = load_specs(&app);
    let clients = state.clients.read().await;
    Ok(specs.into_iter().map(|s| McpServerStatus {
        running: clients.contains_key(&s.name), trusted: s.trusted, name: s.name, command: s.command,
    }).collect())
}

#[tauri::command]
pub async fn mcp_list_tools(app: AppHandle, state: tauri::State<'_, McpState>, name: String) -> Result<Value, String> {
    state.ensure(&app, &name).await?.list_tools().await
}

#[tauri::command]
pub async fn mcp_call(app: AppHandle, state: tauri::State<'_, McpState>, name: String, tool: String, arguments: Value) -> Result<Value, String> {
    state.ensure(&app, &name).await?.call(&tool, arguments).await
}

#[tauri::command]
pub async fn mcp_start(app: AppHandle, state: tauri::State<'_, McpState>, name: String) -> Result<(), String> {
    state.ensure(&app, &name).await.map(|_| ())
}

#[tauri::command]
pub async fn mcp_stop(state: tauri::State<'_, McpState>, name: String) -> Result<(), String> {
    state.stop(&name).await; Ok(())
}
