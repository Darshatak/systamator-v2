// Deep web search — Tavily first, DuckDuckGo HTML scrape fallback.
// Same shape as v1's frontend lib but lifted into Rust so any agent /
// tool path (not just Claude) can hit it.

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult {
    pub title:    String,
    pub url:      String,
    pub snippet:  Option<String>,
    pub source:   Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchInput {
    pub query:        String,
    pub top_k:        Option<i32>,
    pub tavily_key:   Option<String>,   // pulled from keychain by caller
}

#[tauri::command]
pub async fn web_search(input: WebSearchInput) -> Result<Vec<WebSearchResult>, String> {
    let top_k = input.top_k.unwrap_or(6);
    if let Some(key) = input.tavily_key.as_ref().filter(|k| !k.is_empty()) {
        match tavily(&input.query, key, top_k).await {
            Ok(r) => return Ok(r),
            Err(e) => eprintln!("[web_search] Tavily failed: {e}, falling back to DDG"),
        }
    }
    ddg(&input.query, top_k).await
}

async fn tavily(query: &str, key: &str, top_k: i32) -> Result<Vec<WebSearchResult>, String> {
    let body = serde_json::json!({
        "api_key": key, "query": query,
        "search_depth": "advanced", "include_answer": false,
        "include_raw_content": false, "max_results": top_k,
    });
    let res = reqwest::Client::new()
        .post("https://api.tavily.com/search")
        .json(&body).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() { return Err(format!("tavily {}", res.status())); }
    let v: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(v["results"].as_array().cloned().unwrap_or_default().into_iter().map(|r| {
        WebSearchResult {
            title:   r["title"].as_str().unwrap_or("").to_string(),
            url:     r["url"].as_str().unwrap_or("").to_string(),
            snippet: r["content"].as_str().map(String::from),
            source:  Some("tavily".into()),
        }
    }).collect())
}

async fn ddg(query: &str, top_k: i32) -> Result<Vec<WebSearchResult>, String> {
    let url = format!("https://duckduckgo.com/html/?q={}", urlencoding(query));
    let res = reqwest::Client::new()
        .get(&url)
        .header("user-agent", "Mozilla/5.0 (Systamator-v2)")
        .send().await.map_err(|e| e.to_string())?;
    let html = res.text().await.map_err(|e| e.to_string())?;
    // Simple DOM scrape — best-effort, suitable as a fallback only.
    let mut out = Vec::new();
    for cap in regex::Regex::new(r#"(?s)<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</a>.*?class="result__snippet"[^>]*>(.*?)</a>"#).unwrap().captures_iter(&html) {
        if out.len() >= top_k as usize { break; }
        let title   = strip_tags(cap.get(2).map(|m| m.as_str()).unwrap_or("").trim());
        let url     = decode_uddg(cap.get(1).map(|m| m.as_str()).unwrap_or("").trim());
        let snippet = strip_tags(cap.get(3).map(|m| m.as_str()).unwrap_or("").trim());
        out.push(WebSearchResult { title, url, snippet: Some(snippet), source: Some("duckduckgo".into()) });
    }
    Ok(out)
}

fn urlencoding(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}
fn strip_tags(s: &str) -> String { regex::Regex::new(r"<[^>]+>").unwrap().replace_all(s, "").to_string() }
fn decode_uddg(raw: &str) -> String {
    if let Some(idx) = raw.find("uddg=") { raw[idx+5..].split('&').next().map(|s| urldec(s)).unwrap_or_else(|| raw.to_string()) }
    else { raw.to_string() }
}
fn urldec(s: &str) -> String {
    let mut out = String::new(); let mut bytes = s.as_bytes().iter();
    while let Some(&b) = bytes.next() {
        if b == b'%' {
            let hi = bytes.next(); let lo = bytes.next();
            if let (Some(&h), Some(&l)) = (hi, lo) {
                let h = char::from(h).to_digit(16).unwrap_or(0) as u8;
                let l = char::from(l).to_digit(16).unwrap_or(0) as u8;
                out.push(((h << 4) | l) as char);
            }
        } else { out.push(b as char); }
    }
    out
}
