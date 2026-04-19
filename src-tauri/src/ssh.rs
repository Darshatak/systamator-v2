// SSH pool — libssh2 sessions with credential-fingerprint dedup, ref-counted
// leases, and a heartbeat thread that prunes dead sessions. Credentials live
// in the OS keychain (see keychain.rs); raw secrets are never serialised.

use std::collections::{HashMap, hash_map::DefaultHasher};
use std::hash::{Hash, Hasher};
use std::io::Read;
use std::net::TcpStream;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use ssh2::Session;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SshCredential {
    pub id:             String,
    pub name:           String,
    pub host:           String,
    pub port:           u16,
    pub username:       String,
    pub auth_type:      String,            // "password" | "key"
    pub password:       Option<String>,    // pulled from keychain at call time
    pub key_path:       Option<String>,
    pub key_passphrase: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshExecResult { pub stdout: String, pub stderr: String, pub exit_code: i32 }

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectResult { pub session_id: String, pub banner: Option<String> }

pub struct SshConnection { pub session: Session }
unsafe impl Send for SshConnection {}
unsafe impl Sync for SshConnection {}

pub struct SshPoolMeta {
    pub cred_fp:     String,
    pub leases:      AtomicUsize,
    pub alive:       AtomicBool,
    pub last_active: Mutex<Instant>,
}

pub struct SshState {
    pub connections: Mutex<HashMap<String, Arc<Mutex<SshConnection>>>>,
    pub meta:        Mutex<HashMap<String, Arc<SshPoolMeta>>>,
    pub fp_index:    Mutex<HashMap<String, String>>,
}

impl SshState {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            meta:        Mutex::new(HashMap::new()),
            fp_index:    Mutex::new(HashMap::new()),
        }
    }
}

fn cred_fp(c: &SshCredential) -> String {
    let mut h = DefaultHasher::new();
    c.host.hash(&mut h); c.port.hash(&mut h);
    c.username.hash(&mut h); c.auth_type.hash(&mut h);
    c.password.as_deref().unwrap_or("").hash(&mut h);
    c.key_path.as_deref().unwrap_or("").hash(&mut h);
    format!("{:x}", h.finish())
}

fn authenticate(session: &Session, c: &SshCredential) -> Result<(), String> {
    if c.auth_type == "password" {
        let pw = c.password.as_deref().unwrap_or("");
        session.userauth_password(&c.username, pw)
            .map_err(|e| format!("password auth: {e}"))?;
    } else {
        let kp = c.key_path.as_ref().ok_or("key_path required")?;
        let expanded = if let Some(rest) = kp.strip_prefix("~/") {
            std::path::PathBuf::from(format!("{}/{}", std::env::var("HOME").unwrap_or_default(), rest))
        } else { std::path::PathBuf::from(kp) };
        session.userauth_pubkey_file(&c.username, None, &expanded, c.key_passphrase.as_deref())
            .map_err(|e| format!("key auth: {e}"))?;
    }
    if !session.authenticated() { return Err("auth rejected".into()); }
    Ok(())
}

#[tauri::command]
pub fn ssh_test_connection(credential: SshCredential) -> Result<String, String> {
    let stream = TcpStream::connect_timeout(
        &format!("{}:{}", credential.host, credential.port).parse().map_err(|e: std::net::AddrParseError| e.to_string())?,
        Duration::from_secs(8),
    ).map_err(|e| format!("TCP: {e}"))?;
    let mut session = Session::new().map_err(|e| e.to_string())?;
    session.set_tcp_stream(stream);
    session.handshake().map_err(|e| format!("handshake: {e}"))?;
    authenticate(&session, &credential)?;
    let banner = session.banner().map(|s| s.trim().to_string()).unwrap_or_else(|| "ok".into());
    session.disconnect(None, "test", None).ok();
    Ok(banner)
}

#[tauri::command]
pub fn ssh_connect(state: tauri::State<'_, SshState>, credential: SshCredential) -> Result<SshConnectResult, String> {
    let fp = cred_fp(&credential);

    if let Some(existing) = pooled(&state, &fp) {
        if let Some(m) = state.meta.lock().unwrap().get(&existing).cloned() {
            m.leases.fetch_add(1, Ordering::Relaxed);
            *m.last_active.lock().unwrap() = Instant::now();
        }
        return Ok(SshConnectResult { session_id: existing, banner: None });
    }

    let stream = TcpStream::connect_timeout(
        &format!("{}:{}", credential.host, credential.port).parse().map_err(|e: std::net::AddrParseError| e.to_string())?,
        Duration::from_secs(10),
    ).map_err(|e| format!("TCP: {e}"))?;
    stream.set_read_timeout(Some(Duration::from_secs(30))).ok();

    let mut session = Session::new().map_err(|e| e.to_string())?;
    session.set_tcp_stream(stream);
    session.handshake().map_err(|e| format!("handshake: {e}"))?;
    authenticate(&session, &credential)?;
    session.set_keepalive(true, 30);

    let banner = session.banner().map(|s| s.trim().to_string());
    let sid = Uuid::new_v4().to_string();
    let meta = Arc::new(SshPoolMeta {
        cred_fp: fp.clone(),
        leases: AtomicUsize::new(1),
        alive: AtomicBool::new(true),
        last_active: Mutex::new(Instant::now()),
    });

    state.connections.lock().unwrap().insert(sid.clone(), Arc::new(Mutex::new(SshConnection { session })));
    state.meta.lock().unwrap().insert(sid.clone(), meta);
    state.fp_index.lock().unwrap().insert(fp, sid.clone());

    Ok(SshConnectResult { session_id: sid, banner })
}

fn pooled(state: &SshState, fp: &str) -> Option<String> {
    let sid = state.fp_index.lock().ok()?.get(fp).cloned()?;
    let meta = state.meta.lock().ok()?.get(&sid).cloned()?;
    if meta.alive.load(Ordering::Relaxed) { Some(sid) } else { None }
}

#[tauri::command]
pub fn ssh_exec(state: tauri::State<'_, SshState>, session_id: String, command: String) -> Result<SshExecResult, String> {
    let conn_arc = {
        let map = state.connections.lock().unwrap();
        map.get(&session_id).ok_or("session not found")?.clone()
    };
    if let Some(m) = state.meta.lock().unwrap().get(&session_id).cloned() {
        *m.last_active.lock().unwrap() = Instant::now();
    }
    let conn = conn_arc.lock().map_err(|_| "mutex poisoned")?;
    conn.session.set_timeout(30_000);
    let mut ch = conn.session.channel_session().map_err(|e| format!("channel: {e}"))?;
    ch.exec(&command).map_err(|e| format!("exec: {e}"))?;
    let mut stdout = String::new();
    let mut stderr = String::new();
    ch.read_to_string(&mut stdout).ok();
    ch.stderr().read_to_string(&mut stderr).ok();
    ch.wait_close().ok();
    Ok(SshExecResult { stdout, stderr, exit_code: ch.exit_status().unwrap_or(-1) })
}

#[tauri::command]
pub fn ssh_disconnect(state: tauri::State<'_, SshState>, session_id: String, force: Option<bool>) -> Result<u32, String> {
    let force = force.unwrap_or(false);
    let meta = state.meta.lock().unwrap().get(&session_id).cloned();
    let remaining = meta.as_ref().map(|m| {
        if force { 0 } else {
            let prev = m.leases.fetch_sub(1, Ordering::Relaxed);
            if prev == 0 { 0 } else { prev - 1 }
        }
    }).unwrap_or(0);

    if remaining == 0 {
        if let Some(arc) = state.connections.lock().unwrap().remove(&session_id) {
            if let Ok(c) = arc.lock() { c.session.disconnect(None, "bye", None).ok(); }
        }
        if let Some(m) = meta {
            m.alive.store(false, Ordering::Relaxed);
            state.fp_index.lock().unwrap().retain(|_, sid| sid != &session_id);
        }
        state.meta.lock().unwrap().remove(&session_id);
    }
    Ok(remaining as u32)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshPoolEntry { pub session_id: String, pub leases: u32, pub alive: bool, pub idle_secs: u64 }

#[tauri::command]
pub fn ssh_pool_status(state: tauri::State<'_, SshState>) -> Vec<SshPoolEntry> {
    let meta = state.meta.lock().unwrap();
    let now = Instant::now();
    meta.iter().map(|(sid, m)| SshPoolEntry {
        session_id: sid.clone(),
        leases:     m.leases.load(Ordering::Relaxed) as u32,
        alive:      m.alive.load(Ordering::Relaxed),
        idle_secs:  now.saturating_duration_since(*m.last_active.lock().unwrap()).as_secs(),
    }).collect()
}

pub fn spawn_heartbeat(handle: AppHandle, tick_secs: u64) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(tick_secs));
            let state = handle.state::<SshState>();
            let snap: Vec<_> = {
                let conns = match state.connections.lock() { Ok(g) => g, Err(_) => continue };
                let meta  = match state.meta.lock()        { Ok(g) => g, Err(_) => continue };
                conns.iter().filter_map(|(sid, conn)|
                    meta.get(sid).map(|m| (sid.clone(), conn.clone(), m.clone()))
                ).collect()
            };
            for (sid, conn, m) in snap {
                if !m.alive.load(Ordering::Relaxed) { continue; }
                let alive = match conn.lock() { Ok(c) => c.session.keepalive_send().is_ok(), Err(_) => false };
                if !alive {
                    m.alive.store(false, Ordering::Relaxed);
                    if let Ok(mut g) = state.connections.lock() { g.remove(&sid); }
                    if let Ok(mut g) = state.meta.lock() { g.remove(&sid); }
                    if let Ok(mut g) = state.fp_index.lock() { g.retain(|_, s| s != &sid); }
                }
            }
        }
    });
}
