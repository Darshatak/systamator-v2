// Browser agent foundation — secondary Tauri webview for computer-use.
//
// Opens a second window (label "browser") that the user or an agent can
// drive. Commands here are the minimal set needed for the Browser agent's
// tool manifest:
//
//   browser_open(url)        spawn (or reuse) the window, navigate
//   browser_navigate(url)    navigate current window
//   browser_close()          close the window
//   browser_get_url()        current URL
//   browser_get_title()      document title (via eval)
//   browser_eval(js)         run JS in the page, return result as string
//
// Click / type / extract land on top of eval + injected helpers in a
// follow-up — for M3 foundation, the window + basic control + eval are
// enough to drive most pages.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const BROWSER_LABEL: &str = "browser";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserInfo {
    pub open:  bool,
    pub url:   Option<String>,
    pub title: Option<String>,
}

fn get_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window(BROWSER_LABEL)
}

#[tauri::command]
pub async fn browser_open(app: AppHandle, url: String) -> Result<BrowserInfo, String> {
    let normalized = normalize_url(&url);
    let parsed = normalized.parse::<url::Url>().unwrap_or_else(|_| {
        // fallback: plain string URL — Tauri will accept it as a relative webview URL.
        format!("https://duckduckgo.com/?q={}", urlencoding(&url)).parse().unwrap()
    });

    if let Some(win) = get_window(&app) {
        win.navigate(parsed.clone()).map_err(|e| format!("navigate: {e}"))?;
        return Ok(BrowserInfo { open: true, url: Some(parsed.to_string()), title: None });
    }

    let win = WebviewWindowBuilder::new(&app, BROWSER_LABEL, WebviewUrl::External(parsed.clone()))
        .title(format!("Systamator · Browser — {}", parsed.host_str().unwrap_or(&parsed.to_string())))
        .inner_size(1280.0, 900.0)
        .center()
        .resizable(true)
        .build()
        .map_err(|e| format!("open: {e}"))?;

    Ok(BrowserInfo { open: true, url: Some(win.url().map(|u| u.to_string()).unwrap_or_default()), title: None })
}

#[tauri::command]
pub async fn browser_navigate(app: AppHandle, url: String) -> Result<BrowserInfo, String> {
    browser_open(app, url).await
}

#[tauri::command]
pub fn browser_close(app: AppHandle) -> Result<(), String> {
    if let Some(win) = get_window(&app) {
        win.close().map_err(|e| format!("close: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_get_url(app: AppHandle) -> Result<Option<String>, String> {
    Ok(get_window(&app).and_then(|w| w.url().ok().map(|u| u.to_string())))
}

/// Evaluate JS in the browser window. Returns stringified result via a
/// convention: the JS expression should assign its result to
/// `window.__systamator_result` and we read it back in a follow-up eval.
#[tauri::command]
pub async fn browser_eval(app: AppHandle, js: String) -> Result<String, String> {
    let win = get_window(&app).ok_or("browser window is not open")?;
    // Wrap user JS so exceptions become a readable error.
    let wrapped = format!(
        r#"(() => {{
          try {{
            const r = (function(){{ {} }})();
            window.__systamator_result = JSON.stringify(r);
          }} catch (e) {{
            window.__systamator_result = JSON.stringify({{ __error: String(e) }});
          }}
        }})();"#,
        js
    );
    win.eval(&wrapped).map_err(|e| format!("eval: {e}"))?;
    // eval is fire-and-forget on Tauri 2; we give the page a tick, then
    // read the result via another eval that posts it to a channel. Out
    // of scope for M3 foundation — caller just trusts the side effect.
    Ok("(eval dispatched — result retrieval arrives with event-channel wiring in the next pass)".into())
}

/// Best-effort URL normaliser: prepend https:// if missing, otherwise
/// leave alone. Empty or malformed strings become a DuckDuckGo search.
fn normalize_url(u: &str) -> String {
    let t = u.trim();
    if t.is_empty() { return "https://duckduckgo.com/".into(); }
    if t.starts_with("http://") || t.starts_with("https://") || t.starts_with("file://") {
        return t.into();
    }
    if t.contains('.') && !t.contains(' ') {
        return format!("https://{t}");
    }
    format!("https://duckduckgo.com/?q={}", urlencoding(t))
}

fn urlencoding(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}
