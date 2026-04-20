// Systamator v2 — Rust backend entry point.
//
// Responsibility split (one file per concern, per PRD §11):
//
//   keychain.rs   OS-keychain wrapper. Every secret in the app goes through
//                 here — providers, SSH keys, OAuth tokens.
//   ipc.rs        Thin Tauri command surface re-exported from each module.
//   ssh.rs        Pooled libssh2 sessions (dedup + heartbeat from v1).
//   cache.rs      In-memory TTL cache (ported from v1).
//   mcp.rs        MCP client (stdio JSON-RPC + registry, ported from v1).
//   connectors.rs NL → MCP server spec resolver (ported from v1, +path).
//   pii_guard.rs  Regex-based PII redaction before LLM calls (ported).
//   web_scrape.rs reqwest + entity-strip readable text (ported from v1).
//   web_search.rs Tavily / Brave / DDG chain (NEW vs v1 frontend lib).
//   agents.rs     Agent profiles (Team Lead / Manager / IC) — bidding +
//                 expertiseScore + skill scoping. Per ORG spec.
//   runs.rs       Run + Step persistence; PAUN loop entry points.
//   skills.rs     Skill + Failure stores (Postgres + fastembed planned).
//   resources.rs  Fleet — SSH / Docker / DB / Browser / MCP / Repo.
//   db.rs         Postgres pool + migrations runner.

mod keychain;
mod ssh;
mod cache;
mod mcp;
mod connectors;
mod pii_guard;
mod web_scrape;
mod web_search;
mod agents;
mod browser;
mod cli_providers;
mod code;
mod embeddings;
mod importer;
mod orchestrator;
mod runs;
mod skills;
mod resources;
mod db;

use db::DbState;
use ssh::SshState;
use mcp::McpState;
use cache::CacheState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DbState::new())
        .manage(SshState::new())
        .manage(McpState::new())
        .manage(CacheState::new())
        .setup(|app| {
            // Best-effort DB connect on boot. The app still loads if Postgres
            // isn't running yet — features that need it surface a friendly
            // error instead of a startup crash.
            let db = app.state::<DbState>().inner().clone();
            tauri::async_runtime::spawn(async move {
                match db::try_connect().await {
                    Ok(pool) => {
                        let _ = db::run_migrations(&pool).await;
                        *db.pool.lock().await = Some(pool);
                        println!("[v2] Postgres connected + migrated");
                    }
                    Err(e) => eprintln!("[v2] DB init skipped: {e}"),
                }
            });

            // Keep ssh sessions warm — same heartbeat as v1.
            ssh::spawn_heartbeat(app.handle().clone(), 30);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // keychain
            keychain::keychain_get,
            keychain::keychain_set,
            keychain::keychain_delete,
            keychain::keychain_list,
            // ssh
            ssh::ssh_test_connection,
            ssh::ssh_connect,
            ssh::ssh_exec,
            ssh::ssh_disconnect,
            ssh::ssh_pool_status,
            // cache
            cache::cache_get,
            cache::cache_set,
            cache::cache_invalidate,
            cache::cache_stats,
            // mcp
            mcp::mcp_list_servers,
            mcp::mcp_save_server,
            mcp::mcp_remove_server,
            mcp::mcp_set_trusted,
            mcp::mcp_server_status,
            mcp::mcp_list_tools,
            mcp::mcp_call,
            mcp::mcp_start,
            mcp::mcp_stop,
            connectors::connector_resolve,
            // pii / scrape / search
            pii_guard::pii_redact_text,
            web_scrape::web_fetch_markdown,
            web_search::web_search,
            // agents / runs / skills / resources / db
            agents::agent_list,
            agents::agent_save,
            agents::agent_delete,
            agents::agent_record_outcome,
            agents::agent_seed_defaults,
            runs::run_list,
            runs::run_create,
            runs::run_get,
            runs::run_append_step,
            runs::run_finish,
            orchestrator::run_start,
            orchestrator::run_tick,
            orchestrator::step_approve,
            orchestrator::skill_distill_run,
            cli_providers::cli_detect,
            cli_providers::cli_login_open,
            cli_providers::cli_exec,
            browser::browser_open,
            browser::browser_navigate,
            browser::browser_close,
            browser::browser_get_url,
            browser::browser_eval,
            browser::browser_click,
            browser::browser_type,
            browser::browser_extract,
            browser::browser_reload,
            browser::browser_back,
            browser::browser_forward,
            code::fs_list_dir,
            code::fs_read,
            code::fs_write_with_diff,
            code::run_shell,
            code::git_status,
            code::git_diff,
            importer::v1_import,
            skills::skill_list,
            skills::skill_record,
            skills::skill_search,
            skills::skill_reindex,
            resources::resource_list,
            resources::resource_save,
            resources::resource_delete,
            db::db_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Systamator v2");
}
