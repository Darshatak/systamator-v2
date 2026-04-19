// OS-keychain wrapper.
//
// Every secret in v2 — provider API keys, SSH key passphrases, OAuth tokens,
// MCP server tokens — goes through this module. v1's plaintext JSON store
// is gone. On macOS the `keyring` crate uses Keychain, on Windows the
// Credential Manager, on Linux libsecret.
//
// Service prefix is `systamator-v2.<namespace>` so secrets can be enumerated
// per category (`providers`, `ssh`, `oauth`, `mcp`).

use serde::{Deserialize, Serialize};

const SERVICE_PREFIX: &str = "systamator-v2";

fn full_service(namespace: &str) -> String {
    format!("{SERVICE_PREFIX}.{namespace}")
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeychainEntryRef {
    pub namespace: String,
    pub key:       String,
}

#[tauri::command]
pub fn keychain_get(namespace: String, key: String) -> Option<String> {
    keyring::Entry::new(&full_service(&namespace), &key)
        .ok()?
        .get_password()
        .ok()
}

#[tauri::command]
pub fn keychain_set(namespace: String, key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&full_service(&namespace), &key)
        .map_err(|e| format!("keychain entry: {e}"))?;
    entry.set_password(&value)
        .map_err(|e| format!("keychain set: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn keychain_delete(namespace: String, key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&full_service(&namespace), &key)
        .map_err(|e| format!("keychain entry: {e}"))?;
    // delete_credential returns NoEntry if it never existed — treat as ok.
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete: {e}")),
    }
}

/// Listing isn't natively supported by `keyring` — we keep a small index of
/// known keys per namespace inside the Postgres `keychain_index` table so
/// the Settings UI can render the list. Migration creates the table; this
/// command is a thin Postgres select.
///
/// (Stubbed in M0 — returns empty until db.rs lands the index.)
#[tauri::command]
pub fn keychain_list(_namespace: String) -> Vec<String> {
    Vec::new()
}
