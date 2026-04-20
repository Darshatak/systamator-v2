// Trusted-keys store for signed skill bundles.
//
// Format: JSON array of { name, publicKey (base64), addedAt } persisted
// at <app local data>/trusted_keys.json. Commands:
//   trusted_keys_list            → array for UI
//   trusted_keys_add(name, key)  → upsert
//   trusted_keys_remove(name)    → delete
//   trusted_keys_verify(payload, signature, publicKey) → bool
//
// The skill importer reaches into is_key_trusted() before accepting a
// signed bundle's source as "community-verified".

use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustedKey {
    pub name:       String,
    pub public_key: String,    // base64 32-byte ed25519 public key
    pub added_at:   i64,
}

fn store_path(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_local_data_dir().expect("app local data dir");
    std::fs::create_dir_all(&dir).ok();
    dir.join("trusted_keys.json")
}

fn load_keys(app: &AppHandle) -> Vec<TrustedKey> {
    let p = store_path(app);
    if !p.exists() { return vec![]; }
    serde_json::from_str(&std::fs::read_to_string(p).unwrap_or_default()).unwrap_or_default()
}

fn save_keys(app: &AppHandle, keys: &[TrustedKey]) {
    let p = store_path(app);
    let _ = std::fs::write(p, serde_json::to_string_pretty(keys).unwrap_or_default());
}

#[tauri::command]
pub fn trusted_keys_list(app: AppHandle) -> Vec<TrustedKey> { load_keys(&app) }

#[tauri::command]
pub fn trusted_keys_add(app: AppHandle, name: String, public_key: String) -> Result<TrustedKey, String> {
    if name.is_empty() || public_key.is_empty() { return Err("name + publicKey required".into()); }
    // Verify it's a legal 32-byte ed25519 key before storing.
    let bytes = base64::engine::general_purpose::STANDARD.decode(&public_key)
        .map_err(|e| format!("publicKey not base64: {e}"))?;
    if bytes.len() != 32 { return Err(format!("publicKey must be 32 bytes, got {}", bytes.len())); }
    let key_arr: [u8; 32] = bytes.try_into().unwrap();
    VerifyingKey::from_bytes(&key_arr).map_err(|e| format!("invalid ed25519 public key: {e}"))?;

    let mut keys = load_keys(&app);
    let entry = TrustedKey {
        name: name.clone(),
        public_key: public_key.clone(),
        added_at: chrono::Utc::now().timestamp(),
    };
    if let Some(existing) = keys.iter_mut().find(|k| k.name == name) {
        *existing = entry.clone();
    } else {
        keys.push(entry.clone());
    }
    save_keys(&app, &keys);
    Ok(entry)
}

#[tauri::command]
pub fn trusted_keys_remove(app: AppHandle, name: String) -> Result<(), String> {
    let keys: Vec<TrustedKey> = load_keys(&app).into_iter().filter(|k| k.name != name).collect();
    save_keys(&app, &keys);
    Ok(())
}

/// Public helper — used by skills.rs to decide if an import's signing
/// key is one the user has approved.
pub fn is_key_trusted(app: &AppHandle, public_key_b64: &str) -> bool {
    load_keys(app).iter().any(|k| k.public_key == public_key_b64)
}

/// Verify that `signature_b64` is a valid ed25519 signature over
/// `payload` produced by `public_key_b64`'s owner. Pure function —
/// doesn't consult the trust store; caller checks is_key_trusted
/// separately.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Keypair { pub public_key: String, pub private_key: String }

/// Generate a fresh ed25519 keypair. Private key is the 32-byte seed
/// (base64); public is also 32 bytes base64. Caller decides where to
/// store the private half — we never persist it server-side.
#[tauri::command]
pub fn skill_keygen() -> Result<Keypair, String> {
    let mut seed = [0u8; 32];
    OsRng.fill_bytes(&mut seed);
    let sk = SigningKey::from_bytes(&seed);
    let vk = sk.verifying_key();
    Ok(Keypair {
        public_key:  base64::engine::general_purpose::STANDARD.encode(vk.as_bytes()),
        private_key: base64::engine::general_purpose::STANDARD.encode(sk.as_bytes()),
    })
}

/// Take a bundle JSON + private-key seed (base64), sign the bundle's
/// skills array, and return the bundle with signature + publicKey
/// populated. Authors pipe this to a file and publish.
#[tauri::command]
pub fn skill_sign_bundle(bundle_json: String, private_key_b64: String) -> Result<String, String> {
    let seed_bytes = base64::engine::general_purpose::STANDARD.decode(&private_key_b64)
        .map_err(|e| format!("privateKey not base64: {e}"))?;
    if seed_bytes.len() != 32 { return Err(format!("privateKey must be 32 bytes, got {}", seed_bytes.len())); }
    let seed_arr: [u8; 32] = seed_bytes.try_into().unwrap();
    let sk = SigningKey::from_bytes(&seed_arr);
    let vk = sk.verifying_key();

    let mut bundle: serde_json::Value = serde_json::from_str(&bundle_json)
        .map_err(|e| format!("bundle parse: {e}"))?;
    // Strip any existing signature so re-signing is deterministic.
    if let Some(obj) = bundle.as_object_mut() {
        obj.remove("signature"); obj.remove("publicKey");
    }
    let skills = bundle.get("skills").cloned().ok_or("bundle missing `skills`")?;
    let payload = serde_json::to_string(&skills).map_err(|e| e.to_string())?;

    let sig = sk.sign(payload.as_bytes());
    if let Some(obj) = bundle.as_object_mut() {
        obj.insert("signature".into(),
            serde_json::Value::String(base64::engine::general_purpose::STANDARD.encode(sig.to_bytes())));
        obj.insert("publicKey".into(),
            serde_json::Value::String(base64::engine::general_purpose::STANDARD.encode(vk.as_bytes())));
    }
    serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn trusted_keys_verify(payload: String, signature_b64: String, public_key_b64: String) -> Result<bool, String> {
    let sig_bytes = base64::engine::general_purpose::STANDARD.decode(&signature_b64)
        .map_err(|e| format!("signature not base64: {e}"))?;
    if sig_bytes.len() != 64 { return Err(format!("signature must be 64 bytes, got {}", sig_bytes.len())); }
    let sig_arr: [u8; 64] = sig_bytes.try_into().unwrap();
    let sig = Signature::from_bytes(&sig_arr);

    let pk_bytes = base64::engine::general_purpose::STANDARD.decode(&public_key_b64)
        .map_err(|e| format!("publicKey not base64: {e}"))?;
    if pk_bytes.len() != 32 { return Err("publicKey must be 32 bytes".into()); }
    let pk_arr: [u8; 32] = pk_bytes.try_into().unwrap();
    let vk = VerifyingKey::from_bytes(&pk_arr).map_err(|e| format!("bad key: {e}"))?;
    Ok(vk.verify(payload.as_bytes(), &sig).is_ok())
}
