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

/// Click any element by CSS selector. Fire-and-forget: success means the
/// eval dispatched, not that a real element was found (browser_extract
/// can verify presence first if the agent needs a guarantee).
#[tauri::command]
pub async fn browser_click(app: AppHandle, selector: String) -> Result<(), String> {
    let win = get_window(&app).ok_or("browser is not open")?;
    let js = format!(r#"(() => {{
        const el = document.querySelector({});
        if (el) {{ el.scrollIntoView({{ block: 'center' }}); el.click(); }}
    }})();"#, js_string(&selector));
    win.eval(&js).map_err(|e| format!("eval: {e}"))
}

/// Type text into an input / textarea / contenteditable matched by selector.
/// Fires both `input` and `change` so React / Vue / bare form handlers all
/// see the value.
#[tauri::command]
pub async fn browser_type(app: AppHandle, selector: String, text: String) -> Result<(), String> {
    let win = get_window(&app).ok_or("browser is not open")?;
    let js = format!(r#"(() => {{
        const el = document.querySelector({});
        if (!el) return;
        el.focus();
        if ('value' in el) {{
            const nativeSetter = Object.getOwnPropertyDescriptor(el.__proto__, 'value')?.set;
            if (nativeSetter) nativeSetter.call(el, {});
            else el.value = {};
        }} else {{
            el.textContent = {};
        }}
        el.dispatchEvent(new Event('input',  {{ bubbles: true }}));
        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
    }})();"#, js_string(&selector), js_string(&text), js_string(&text), js_string(&text));
    win.eval(&js).map_err(|e| format!("eval: {e}"))
}

/// Read the text content of an element. Hack: since Tauri's eval is
/// fire-and-forget, we stash the value in `document.title`, read it via
/// `WebviewWindow::title`, then restore the original title. Good enough
/// for M3.2 — bidirectional IPC (postMessage-to-Rust) is on the roadmap.
#[tauri::command]
pub async fn browser_extract(app: AppHandle, selector: String) -> Result<String, String> {
    let win = get_window(&app).ok_or("browser is not open")?;
    let stash = format!(r#"(() => {{
        if (window.__st_prev_title === undefined) window.__st_prev_title = document.title;
        const el = document.querySelector({});
        document.title = el ? (el.innerText || el.textContent || '') : '__SYSTAMATOR_MISSING__';
    }})();"#, js_string(&selector));
    win.eval(&stash).map_err(|e| format!("eval: {e}"))?;
    // Give the DOM a moment to paint the new title.
    tokio::time::sleep(std::time::Duration::from_millis(80)).await;
    let title = win.title().map_err(|e| format!("title: {e}"))?;
    let _ = win.eval("(() => { if (window.__st_prev_title !== undefined) { document.title = window.__st_prev_title; delete window.__st_prev_title; } })();");
    if title == "__SYSTAMATOR_MISSING__" {
        Err(format!("selector not found: {selector}"))
    } else {
        // Trim — browsers collapse long titles, but we dropped the original
        // so what we get back reflects the real element text up to browser's title limit (~1KB).
        Ok(title.chars().take(8 * 1024).collect())
    }
}

/// Compact accessibility-like snapshot of interactive elements. Walks
/// links / buttons / form controls / role-tagged nodes and returns a
/// JSON array [role, name, selector, href?] capped at 2 KB so it fits
/// the document.title round-trip we use for reads.
#[tauri::command]
pub async fn browser_snapshot_a11y(app: AppHandle) -> Result<String, String> {
    let win = get_window(&app).ok_or("browser is not open")?;
    let snapshot_js = r#"
        (() => {
          if (window.__st_prev_title === undefined) window.__st_prev_title = document.title;
          const interactive = [...document.querySelectorAll('a, button, input, select, textarea, [role], [onclick]')].slice(0, 120);
          const out = interactive.map(el => {
            const role = el.getAttribute('role') || el.tagName.toLowerCase();
            const nameCandidate = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || '').trim();
            const name = nameCandidate.slice(0, 60);
            const href = el.getAttribute('href') || undefined;
            const sel  = el.id ? ('#' + el.id)
                       : el.getAttribute('data-testid') ? '[data-testid="' + el.getAttribute('data-testid') + '"]'
                       : (role + ':nth-of-type(' + ([...(el.parentElement?.children||[])].filter(c => c.tagName === el.tagName).indexOf(el) + 1) + ')');
            return [role, name, sel, href].filter(Boolean);
          });
          document.title = '__ST_SNAP__' + JSON.stringify(out).slice(0, 1800);
        })();
    "#;
    win.eval(snapshot_js).map_err(|e| format!("eval: {e}"))?;
    tokio::time::sleep(std::time::Duration::from_millis(120)).await;
    let title = win.title().map_err(|e| format!("title: {e}"))?;
    let _ = win.eval("(() => { if (window.__st_prev_title !== undefined) { document.title = window.__st_prev_title; delete window.__st_prev_title; } })();");
    title.strip_prefix("__ST_SNAP__").map(|s| s.to_string())
        .ok_or_else(|| "snapshot payload missing (title rewrite blocked?)".into())
}

/// PNG screenshot of the browser window via macOS `screencapture -l<id>`.
/// Returns a `data:image/png;base64,…` string the UI can render inline.
/// macOS only for now; Linux / Windows fallbacks are a TODO.
#[tauri::command]
pub fn browser_screenshot(app: AppHandle) -> Result<String, String> {
    #[cfg(not(target_os = "macos"))]
    { let _ = app; return Err("screenshot is macOS-only for now".into()); }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let _win = get_window(&app).ok_or("browser is not open")?;
        let tmp = std::env::temp_dir().join(format!("systamator-v2-snap-{}.png", uuid::Uuid::new_v4()));
        let id  = window_id_for_title("Systamator · Browser")?;
        let st = Command::new("screencapture")
            .arg("-x").arg("-l").arg(&id).arg(&tmp)
            .status().map_err(|e| format!("screencapture spawn: {e}"))?;
        if !st.success() { return Err(format!("screencapture exit {}", st.code().unwrap_or(-1))); }
        let bytes = std::fs::read(&tmp).map_err(|e| format!("read png: {e}"))?;
        std::fs::remove_file(&tmp).ok();
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(format!("data:image/png;base64,{b64}"))
    }
}

#[cfg(target_os = "macos")]
fn window_id_for_title(fragment: &str) -> Result<String, String> {
    use std::process::Command;
    let script = format!(
        "tell application \"System Events\"\nset frontApp to first process whose name is \"Systamator v2\"\nset winIds to id of every window of frontApp whose name contains \"{}\"\nreturn item 1 of winIds\nend tell",
        fragment
    );
    let out = Command::new("osascript").arg("-e").arg(&script).output()
        .map_err(|e| format!("osascript: {e}"))?;
    if !out.status.success() { return Err(format!("osascript exit {}", out.status.code().unwrap_or(-1))); }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[tauri::command]
pub async fn browser_reload(app: AppHandle) -> Result<(), String> {
    let win = get_window(&app).ok_or("browser is not open")?;
    win.eval("location.reload()").map_err(|e| format!("reload: {e}"))
}

#[tauri::command]
pub async fn browser_back(app: AppHandle) -> Result<(), String> {
    let win = get_window(&app).ok_or("browser is not open")?;
    win.eval("history.back()").map_err(|e| format!("back: {e}"))
}

#[tauri::command]
pub async fn browser_forward(app: AppHandle) -> Result<(), String> {
    let win = get_window(&app).ok_or("browser is not open")?;
    win.eval("history.forward()").map_err(|e| format!("forward: {e}"))
}

/// Escape a string as a JS literal (wrapped in quotes). Small helper used
/// by the eval-building helpers — keeps them readable without depending
/// on serde_json for every argument.
fn js_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"'  => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
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
