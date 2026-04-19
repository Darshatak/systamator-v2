// Deep page scrape — fetch URL, strip noise, return readable prose.
// Same approach as v1.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;

static RE_SCRIPT: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?is)<(script|style|nav|footer|aside|form|template|noscript)\b[^>]*>.*?</\1>").unwrap());
static RE_BR:     Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)<br\s*/?>").unwrap());
static RE_BLOCK:  Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)</?(p|div|li|tr|h[1-6]|article|section|header|main)[^>]*>").unwrap());
static RE_TAG:    Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]+>").unwrap());
static RE_BLANKS: Lazy<Regex> = Lazy::new(|| Regex::new(r"\n{3,}").unwrap());
static RE_TITLE:  Lazy<Regex> = Lazy::new(|| Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap());

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageExtract {
    pub url: String, pub title: Option<String>, pub text: String,
    pub bytes: usize, pub truncated: bool,
}

#[tauri::command]
pub async fn web_fetch_markdown(url: String, max_bytes: Option<usize>) -> Result<PageExtract, String> {
    let cap = max_bytes.unwrap_or(8 * 1024);
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Systamator-v2)")
        .timeout(std::time::Duration::from_secs(15))
        .build().map_err(|e| e.to_string())?;
    let res = client.get(&url).send().await.map_err(|e| format!("fetch: {e}"))?;
    if !res.status().is_success() { return Err(format!("status {}", res.status())); }
    let html = res.text().await.map_err(|e| e.to_string())?;

    let title = RE_TITLE.captures(&html).and_then(|c| c.get(1)).map(|m| decode(m.as_str().trim()).chars().take(200).collect());
    let no_noise = RE_SCRIPT.replace_all(&html, "");
    let lb = RE_BR.replace_all(&no_noise, "\n");
    let lb = RE_BLOCK.replace_all(&lb, "\n");
    let stripped = RE_TAG.replace_all(&lb, "");
    let cleaned = decode(&stripped);
    let cleaned: String = cleaned.lines().map(|l| l.trim().to_string()).collect::<Vec<_>>().join("\n");
    let cleaned = RE_BLANKS.replace_all(&cleaned, "\n\n").to_string();

    let bytes = cleaned.len();
    let truncated = bytes > cap;
    let text = if truncated {
        let mut t = cleaned.as_bytes()[..cap].to_vec();
        while !t.is_empty() && (t.last().unwrap() & 0b1100_0000) == 0b1000_0000 { t.pop(); }
        format!("{}\n\n…[truncated at {} bytes]", String::from_utf8_lossy(&t), cap)
    } else { cleaned };

    Ok(PageExtract { url, title, text, bytes, truncated })
}

fn decode(s: &str) -> String {
    s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
     .replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'")
     .replace("&mdash;", "—").replace("&ndash;", "–").replace("&hellip;", "…")
}
