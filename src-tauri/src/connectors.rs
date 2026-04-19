// Natural-language → MCP server spec resolver.
// Same idea as v1: rules-first table for common cases, local-path detection
// for user-built servers, URL → mcp-anything fallback.

use serde::{Deserialize, Serialize};
use crate::mcp::McpServerSpec;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorSuggestion {
    pub spec:         McpServerSpec,
    pub confidence:   f32,
    pub rationale:    String,
    pub needs_review: bool,
}

fn npx(name: &str, pkg: &str, desc: &str, extra: &[&str]) -> ConnectorSuggestion {
    let mut args = vec!["-y".into(), pkg.into()];
    args.extend(extra.iter().map(|s| s.to_string()));
    ConnectorSuggestion {
        spec: McpServerSpec { name: name.into(), command: "npx".into(), args, env: Default::default(), description: desc.into(), trusted: false },
        confidence: 0.85, rationale: format!("Spawn `{pkg}` via npx"), needs_review: false,
    }
}
fn any_cli(bin: &str) -> ConnectorSuggestion {
    ConnectorSuggestion {
        spec: McpServerSpec { name: bin.into(), command: "npx".into(),
            args: vec!["-y".into(), "any-cli-mcp-server".into(), bin.into()],
            env: Default::default(), description: format!("Wrap `{bin}` CLI via --help"), trusted: false },
        confidence: 0.7, rationale: format!("any-cli-mcp-server {bin}"), needs_review: true,
    }
}

#[tauri::command]
pub fn connector_resolve(utterance: String) -> Option<ConnectorSuggestion> {
    let toks: Vec<String> = utterance.to_lowercase()
        .split(|c: char| !c.is_alphanumeric() && c != '-' && c != '_')
        .filter(|t| !t.is_empty()).map(String::from).collect();

    if let Some(s) = resolve_local_path(&utterance) { return Some(s); }

    let table: &[(&[&str], fn() -> ConnectorSuggestion)] = &[
        (&["github","gh"],          || npx("github","@modelcontextprotocol/server-github","GitHub repos / issues / PRs", &[])),
        (&["filesystem","fs"],      || npx("filesystem","@modelcontextprotocol/server-filesystem","Local FS access", &["~"])),
        (&["postgres","postgresql"],|| npx("postgres","@modelcontextprotocol/server-postgres","PostgreSQL read-only", &[])),
        (&["slack"],                || npx("slack","@modelcontextprotocol/server-slack","Slack workspaces", &[])),
        (&["memory","notes"],       || npx("memory","@modelcontextprotocol/server-memory","Persistent agent memory", &[])),
        (&["fetch","http","web"],   || npx("fetch","@modelcontextprotocol/server-fetch","Generic HTTP fetch", &[])),
        (&["browser","playwright"], || npx("playwright","@playwright/mcp","Browser automation (Playwright)", &[])),
        (&["puppeteer"],            || npx("puppeteer","@modelcontextprotocol/server-puppeteer","Browser automation (Puppeteer)", &[])),
        (&["openspace"],            || npx("openspace","openspace-mcp","OpenSpace skill engine", &[])),
        (&["obsidian"],             || npx("obsidian","obsidian-mcp-server","Obsidian vault as MCP", &[])),
        (&["tailscale"],            || any_cli("tailscale")),
        (&["docker"],               || any_cli("docker")),
        (&["kubectl","k8s"],        || any_cli("kubectl")),
        (&["terraform"],            || any_cli("terraform")),
        (&["git"],                  || any_cli("git")),
        (&["az","azure"],           || any_cli("az")),
        (&["aws"],                  || any_cli("aws")),
        (&["gcloud"],               || any_cli("gcloud")),
        (&["systemctl","systemd"],  || any_cli("systemctl")),
        (&["brew"],                 || any_cli("brew")),
        (&["npm"],                  || any_cli("npm")),
    ];
    for (kws, factory) in table {
        if kws.iter().any(|k| toks.iter().any(|t| t == *k)) { return Some(factory()); }
    }

    if let Some(url) = toks.iter().find(|t| t.starts_with("http://") || t.starts_with("https://")) {
        return Some(ConnectorSuggestion {
            spec: McpServerSpec {
                name: sanitise(url), command: "uvx".into(),
                args: vec!["mcp-anything".into(), url.clone()],
                env: Default::default(), description: format!("Wrap OpenAPI/REST at {url}"), trusted: false,
            },
            confidence: 0.6, rationale: "URL → mcp-anything".into(), needs_review: true,
        });
    }

    let verbs = ["connect","add","install","wrap","register","create"];
    if toks.iter().any(|t| verbs.contains(&t.as_str())) {
        if let Some(b) = toks.iter().find(|t| !verbs.contains(&t.as_str()) && !is_filler(t)) {
            return Some(any_cli(b));
        }
    }
    None
}

fn resolve_local_path(raw: &str) -> Option<ConnectorSuggestion> {
    let r = raw.trim();
    let (forced, candidate) = if let Some(rest) = r.strip_prefix("node ") { (Some("node"), rest.trim()) }
        else if let Some(rest) = r.strip_prefix("python3 ") { (Some("python3"), rest.trim()) }
        else if let Some(rest) = r.strip_prefix("python ")  { (Some("python3"), rest.trim()) }
        else { (None, r) };

    let token = candidate.split_whitespace().find(|t| {
        t.starts_with('/') || t.starts_with('~') || t.starts_with("./") || t.starts_with("../") ||
        (t.contains('/') && (t.ends_with(".js") || t.ends_with(".mjs") || t.ends_with(".ts") || t.ends_with(".py") || t.ends_with("package.json") || t.ends_with("/index.js")))
    })?;

    let expanded = if let Some(rest) = token.strip_prefix("~/") {
        format!("{}/{}", std::env::var("HOME").unwrap_or_default(), rest)
    } else { token.to_string() };

    let p = std::path::Path::new(&expanded);
    let full = if p.is_absolute() { p.to_path_buf() } else { std::env::current_dir().ok()?.join(p) };
    if !full.exists() { return None; }
    let meta = std::fs::metadata(&full).ok()?;
    let name = sanitise(full.file_name()?.to_string_lossy().as_ref());

    if meta.is_file() {
        let ext = full.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        let cmd = forced.map(String::from).unwrap_or_else(|| match ext.as_str() {
            "js" | "mjs" | "cjs" => "node".into(),
            "ts" => "tsx".into(),
            "py" => "python3".into(),
            _ => "node".into(),
        });
        return Some(ConnectorSuggestion {
            spec: McpServerSpec {
                name, command: cmd.clone(),
                args: vec![full.to_string_lossy().into_owned()],
                env: Default::default(),
                description: format!("Local MCP at {}", full.display()),
                trusted: false,
            },
            confidence: 0.85, rationale: format!("`{} {}`", cmd, full.display()), needs_review: false,
        });
    }

    if meta.is_dir() && full.join("package.json").exists() {
        let entry = full.join("index.js");
        return Some(ConnectorSuggestion {
            spec: McpServerSpec {
                name, command: "node".into(),
                args: vec![entry.to_string_lossy().into_owned()],
                env: Default::default(),
                description: format!("Node MCP in {}", full.display()),
                trusted: false,
            },
            confidence: 0.8, rationale: format!("node {}", entry.display()), needs_review: false,
        });
    }
    None
}

fn is_filler(t: &str) -> bool {
    matches!(t, "mcp"|"server"|"tool"|"to"|"for"|"the"|"a"|"an"|"my"|"with"|"and"|"please"|"using")
}
fn sanitise(s: &str) -> String {
    s.chars().map(|c| if c.is_alphanumeric() || c == '-' { c.to_ascii_lowercase() } else { '-' })
     .collect::<String>().trim_matches('-').chars().take(40).collect()
}
