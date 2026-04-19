// PII redaction. Lightweight regex pass before any LLM call.
// Returns the sanitised string + a token map so the UI can show the
// "what was redacted" diff.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

static EMAIL: Lazy<Regex> = Lazy::new(|| Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}").unwrap());
static PHONE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\+?\d[\d\s\-]{8,}\d").unwrap());
static SSN:   Lazy<Regex> = Lazy::new(|| Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap());
static APIK:  Lazy<Regex> = Lazy::new(|| Regex::new(r"(?:sk|pk|ghp|tvly|xai)-[A-Za-z0-9_-]{20,}").unwrap());

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Redacted { pub text: String, pub counts: std::collections::HashMap<String, usize> }

#[tauri::command]
pub fn pii_redact_text(text: String) -> Redacted {
    let mut counts = std::collections::HashMap::new();
    let mut t = text;
    for (label, re) in [("email", &*EMAIL), ("phone", &*PHONE), ("ssn", &*SSN), ("apikey", &*APIK)] {
        let mut n = 0;
        t = re.replace_all(&t, |caps: &regex::Captures| {
            n += 1;
            format!("[REDACTED:{label}]")
        }).to_string();
        if n > 0 { counts.insert(label.to_string(), n); }
    }
    Redacted { text: t, counts }
}
