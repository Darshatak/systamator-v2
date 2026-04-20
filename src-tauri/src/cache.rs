// In-memory TTL cache — ported verbatim from v1, lightly cleaned.
// Used by every read-heavy tool (ssh_exec idempotent reads, docker_ps,
// mail_list_folders, github lists). One Mutex<HashMap>, no external deps.

use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct CacheState;
impl CacheState { pub fn new() -> Self { Self } }

struct Entry { value: String, expires_at: Instant }
static STORE: Lazy<Mutex<HashMap<String, Entry>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub fn cache_get(key: String) -> Option<String> {
    let store = STORE.lock().ok()?;
    let entry = store.get(&key)?;
    (entry.expires_at > Instant::now()).then(|| entry.value.clone())
}

#[tauri::command]
pub fn cache_set(key: String, value: String, ttl_secs: u64) {
    if let Ok(mut store) = STORE.lock() {
        let ttl = if ttl_secs == 0 { 365 * 24 * 3600 } else { ttl_secs };
        store.insert(key, Entry { value, expires_at: Instant::now() + Duration::from_secs(ttl) });
    }
}

#[tauri::command]
pub fn cache_invalidate(prefix: String) {
    if let Ok(mut store) = STORE.lock() {
        store.retain(|k, _| !k.starts_with(&prefix));
    }
}

#[tauri::command]
pub fn cache_flush() -> usize {
    let mut store = match STORE.lock() { Ok(s) => s, Err(_) => return 0 };
    let n = store.len();
    store.clear();
    n
}

#[tauri::command]
pub fn cache_stats() -> serde_json::Value {
    let store = match STORE.lock() { Ok(s) => s, Err(_) => return serde_json::json!({"error":"lock"}) };
    let now = Instant::now();
    let total  = store.len();
    let active = store.values().filter(|e| e.expires_at > now).count();
    serde_json::json!({ "total": total, "active": active, "expired": total - active })
}
