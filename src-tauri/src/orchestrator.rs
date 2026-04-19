// PAUN orchestrator — M1 core.
//
// Wires: goal → create run → conductor draft plan → bidding picks an
// agent per step → each step runs through Plan-Analyse-Apply-Unify-Next
// → critic verdict → persist + emit Tauri events.
//
// M1 ships a deterministic plan generator so the loop is observable
// end-to-end without yet requiring LLM credentials. The real LLM-driven
// planner is a drop-in: replace `plan_for_goal` with an Anthropic call
// that uses the planner's keychain-stored API key.

use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::db::DbState;

// Verbs that should NEVER auto-execute. Steps whose label or input
// matches any of these flip to 'awaiting_user' so the Inbox surfaces
// an approval card before they run. Deliberately narrow — false
// positives waste user attention.
const DESTRUCTIVE_VERBS: &[&str] = &[
    "rm ", "rm -", "drop table", "drop database", "shutdown", "reboot",
    "halt", "kill -9", "git push --force", "git reset --hard",
    "docker rm -f", "checkout", "delete from", "truncate ",
];

fn is_destructive(label: &str, input: &serde_json::Value) -> bool {
    let l = label.to_lowercase();
    if DESTRUCTIVE_VERBS.iter().any(|v| l.contains(v)) { return true; }
    let txt = input.to_string().to_lowercase();
    DESTRUCTIVE_VERBS.iter().any(|v| txt.contains(v))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlannedStep {
    pub kind:       String,            // tool / llm / control.*
    pub label:      String,
    pub agent_role: String,             // 'ic-ssh', 'mgr-ops', etc — winner of bidding
    pub depends_on: Vec<usize>,         // indices of previous steps
    pub input:      serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlannedGoal {
    pub task_type:    String,
    pub conductor_id: String,
    pub steps:        Vec<PlannedStep>,
}

/// Deterministic planner used while LLM wiring is M1's TODO.
/// Routes by simple keyword matching — research / ops / writing / chat.
pub fn plan_for_goal(goal: &str) -> PlannedGoal {
    let g = goal.to_lowercase();
    let task_type = if g.contains("search") || g.contains("find") || g.contains("research")
                    || g.contains("compare") || g.contains("news") { "research" }
                    else if g.contains("server") || g.contains("ssh") || g.contains("docker")
                         || g.contains("deploy") || g.contains("disk") || g.contains("launch") { "ops" }
                    else if g.contains("write") || g.contains("draft") || g.contains("summari") { "writing" }
                    else { "casual" };

    let steps: Vec<PlannedStep> = match task_type {
        "research" => vec![
            mk_step("tool", "web_search", "scout-web", json_str([("query", goal)])),
            mk_step("tool", "page_read",  "scout-web", json_str([("url", "(top result)")]))
                .with_dep(0),
            mk_step("llm",  "synthesize answer", "scribe", json_str([("instruction", "write a cited summary")]))
                .with_dep(1),
        ],
        "ops" => vec![
            mk_step("tool", "ssh_exec",   "ic-ssh",      json_str([("command", "uname -a")])),
            mk_step("tool", "ssh_exec",   "ic-ssh",      json_str([("command", "df -h")]))
                .with_dep(0),
            mk_step("llm",  "format report", "scribe",   json_str([("instruction", "1-paragraph status")]))
                .with_dep(1),
        ],
        "writing" => vec![
            mk_step("llm", "draft", "scribe", json_str([("goal", goal)])),
            mk_step("llm", "revise", "scribe", json_str([("goal", goal)]))
                .with_dep(0),
        ],
        _ => vec![
            mk_step("llm", "answer", "scribe", json_str([("prompt", goal)])),
        ],
    };

    PlannedGoal {
        task_type:    task_type.to_string(),
        conductor_id: "lead-conductor".to_string(),
        steps,
    }
}

fn mk_step(kind: &str, label: &str, agent: &str, input: serde_json::Value) -> PlannedStep {
    PlannedStep {
        kind: kind.to_string(),
        label: label.to_string(),
        agent_role: agent.to_string(),
        depends_on: vec![],
        input,
    }
}
trait WithDep { fn with_dep(self, idx: usize) -> Self; }
impl WithDep for PlannedStep {
    fn with_dep(mut self, idx: usize) -> Self { self.depends_on.push(idx); self }
}

fn json_str<'a, I: IntoIterator<Item = (&'static str, &'a str)>>(pairs: I) -> serde_json::Value {
    let mut o = serde_json::Map::new();
    for (k, v) in pairs { o.insert(k.to_string(), serde_json::Value::String(v.to_string())); }
    serde_json::Value::Object(o)
}

// ── Tauri command: start a run ─────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRunInput { pub goal: String }

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRunResult { pub run_id: String, pub plan: PlannedGoal }

#[tauri::command]
pub async fn run_start(state: tauri::State<'_, DbState>, input: StartRunInput) -> Result<StartRunResult, String> {
    let plan = plan_for_goal(&input.goal);

    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected — start Postgres + restart the app")?;

    // Insert the run
    let run_id = Uuid::new_v4();
    sqlx::query("INSERT INTO runs(id, goal, task_type, conductor_id) VALUES ($1, $2, $3, $4)")
        .bind(run_id)
        .bind(&input.goal)
        .bind(&plan.task_type)
        .bind(&plan.conductor_id)
        .execute(pool).await.map_err(|e| format!("insert run: {e}"))?;

    // Persist all steps as 'pending'
    let mut step_ids: Vec<Uuid> = Vec::with_capacity(plan.steps.len());
    for _ in 0..plan.steps.len() { step_ids.push(Uuid::new_v4()); }
    for (i, s) in plan.steps.iter().enumerate() {
        let depends_on: Vec<String> = s.depends_on.iter().map(|d| step_ids[*d].to_string()).collect();
        sqlx::query("INSERT INTO steps(id, run_id, agent_id, kind, label, depends_on, input, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')")
            .bind(step_ids[i])
            .bind(run_id)
            .bind(&s.agent_role)
            .bind(&s.kind)
            .bind(&s.label)
            .bind(&depends_on)
            .bind(&s.input)
            .execute(pool).await.map_err(|e| format!("insert step #{i}: {e}"))?;
    }

    Ok(StartRunResult { run_id: run_id.to_string(), plan })
}

// ── Tauri command: tick the next pending step ─────────────────────────
//
// Frontend polls this to advance the run one step at a time. Each tick:
//   1. find first pending step whose deps are all 'done'
//   2. flip to 'running', record agent_id, set started_at
//   3. simulate execution (sleep 600ms, generate output by kind)
//   4. flip to 'done' with output
//   5. update agent stats via existing agent_record_outcome path
//   6. if no more steps, mark run done
// Returns the changed step (or null + run_done flag).

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickResult {
    pub step_id:   Option<String>,
    pub status:    String,        // 'advanced' / 'idle' / 'done'
    pub run_done:  bool,
}

#[tauri::command]
pub async fn run_tick(state: tauri::State<'_, DbState>, run_id: String) -> Result<TickResult, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let run_uuid = Uuid::parse_str(&run_id).map_err(|e| e.to_string())?;

    // 1. Find next pending step with all deps done.
    let pending_rows = sqlx::query("SELECT id, agent_id, kind, label, depends_on, input FROM steps WHERE run_id = $1 AND status = 'pending' ORDER BY id")
        .bind(run_uuid).fetch_all(pool).await.map_err(|e| e.to_string())?;
    if pending_rows.is_empty() {
        // Maybe everything's done — mark run done if so.
        let still = sqlx::query("SELECT COUNT(*) AS n FROM steps WHERE run_id = $1 AND status NOT IN ('done', 'failed', 'skipped')")
            .bind(run_uuid).fetch_one(pool).await.map_err(|e| e.to_string())?;
        let n: i64 = still.try_get("n").unwrap_or(0);
        if n == 0 {
            sqlx::query("UPDATE runs SET status='done', finished_at=now() WHERE id=$1 AND finished_at IS NULL")
                .bind(run_uuid).execute(pool).await.map_err(|e| e.to_string())?;
            return Ok(TickResult { step_id: None, status: "done".into(), run_done: true });
        }
        return Ok(TickResult { step_id: None, status: "idle".into(), run_done: false });
    }

    // Pick the first whose deps are all done.
    let mut next: Option<(Uuid, String, String, String, serde_json::Value)> = None;
    for r in pending_rows {
        let id: Uuid = r.get("id");
        let depends_on: Vec<String> = r.try_get("depends_on").unwrap_or_default();
        let mut all_done = true;
        for d in &depends_on {
            let du = Uuid::parse_str(d).map_err(|e| e.to_string())?;
            let dr = sqlx::query("SELECT status FROM steps WHERE id = $1")
                .bind(du).fetch_one(pool).await.map_err(|e| e.to_string())?;
            if dr.get::<String, _>("status") != "done" { all_done = false; break; }
        }
        if all_done {
            let agent_id: Option<String> = r.try_get("agent_id").ok();
            next = Some((
                id,
                agent_id.unwrap_or_else(|| "lead-conductor".into()),
                r.get::<String, _>("kind"),
                r.get::<String, _>("label"),
                r.get("input"),
            ));
            break;
        }
    }
    let Some((step_id, agent_id, kind, label, input)) = next else {
        return Ok(TickResult { step_id: None, status: "idle".into(), run_done: false });
    };

    // 2a. Destructive guard — flip to awaiting_user, surface in Inbox.
    if is_destructive(&label, &input) {
        sqlx::query("UPDATE steps SET status='awaiting_user' WHERE id=$1").bind(step_id)
            .execute(pool).await.map_err(|e| e.to_string())?;
        sqlx::query("UPDATE runs SET status='awaiting_user' WHERE id=$1 AND status='running'")
            .bind(run_uuid).execute(pool).await.ok();
        return Ok(TickResult { step_id: Some(step_id.to_string()), status: "awaiting_user".into(), run_done: false });
    }

    // 2. running
    sqlx::query("UPDATE steps SET status='running', started_at=now() WHERE id=$1").bind(step_id)
        .execute(pool).await.map_err(|e| e.to_string())?;

    // 3. Simulate execution. Real tool-calling plugs in here per step.kind.
    tokio::time::sleep(std::time::Duration::from_millis(450)).await;
    let output = simulate_execution(&kind, &label, &input);

    // 4. done
    let critique = serde_json::json!({ "verdict": "pass", "reasons": ["m0 simulated execution"], "retryHint": null });
    let cost     = serde_json::json!({ "tokens": 120, "dollars": 0.0006, "wallMs": 450 });
    sqlx::query("UPDATE steps SET status='done', output=$2, critique=$3, cost=$4, finished_at=now() WHERE id=$1")
        .bind(step_id).bind(&output).bind(&critique).bind(&cost)
        .execute(pool).await.map_err(|e| e.to_string())?;

    // 5. agent stats EWMA
    let _ = sqlx::query("UPDATE agents SET stats = jsonb_set(stats, '{runs}', to_jsonb((COALESCE(stats->>'runs','0')::int)+1)) WHERE id=$1")
        .bind(&agent_id).execute(pool).await;

    // 6. anything left?
    let still = sqlx::query("SELECT COUNT(*) AS n FROM steps WHERE run_id = $1 AND status NOT IN ('done', 'failed', 'skipped')")
        .bind(run_uuid).fetch_one(pool).await.map_err(|e| e.to_string())?;
    let n: i64 = still.try_get("n").unwrap_or(0);
    let mut run_done = false;
    if n == 0 {
        sqlx::query("UPDATE runs SET status='done', finished_at=now() WHERE id=$1").bind(run_uuid)
            .execute(pool).await.map_err(|e| e.to_string())?;
        run_done = true;
    }

    Ok(TickResult { step_id: Some(step_id.to_string()), status: "advanced".into(), run_done })
}

// Approve a step that's awaiting_user — flip back to pending so the
// next tick picks it up. Inbox UI calls this.
#[tauri::command]
pub async fn step_approve(state: tauri::State<'_, DbState>, step_id: String) -> Result<(), String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let id = Uuid::parse_str(&step_id).map_err(|e| e.to_string())?;
    sqlx::query("UPDATE steps SET status='pending' WHERE id=$1 AND status='awaiting_user'")
        .bind(id).execute(pool).await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE runs SET status='running' WHERE id=(SELECT run_id FROM steps WHERE id=$1) AND status='awaiting_user'")
        .bind(id).execute(pool).await.ok();
    Ok(())
}

// Distill a Skill row capturing the goal pattern + step recipe so a
// future similar goal can reuse it. Local Postgres only for now;
// OpenSpace export comes later.
#[tauri::command]
pub async fn skill_distill_run(state: tauri::State<'_, DbState>, run_id: String) -> Result<Option<String>, String> {
    let guard = state.pool.lock().await;
    let pool  = guard.as_ref().ok_or("db not connected")?;
    let run_uuid = Uuid::parse_str(&run_id).map_err(|e| e.to_string())?;

    let run = sqlx::query("SELECT goal, task_type, status FROM runs WHERE id=$1")
        .bind(run_uuid).fetch_one(pool).await.map_err(|e| e.to_string())?;
    let status: String = run.get("status");
    if status != "done" { return Ok(None); }
    let goal:      String         = run.get("goal");
    let task_type: Option<String> = run.try_get("task_type").ok();

    let steps = sqlx::query("SELECT kind, label, agent_id, input FROM steps WHERE run_id=$1 AND status='done' ORDER BY started_at")
        .bind(run_uuid).fetch_all(pool).await.map_err(|e| e.to_string())?;
    if steps.is_empty() { return Ok(None); }

    let recipe: serde_json::Value = serde_json::Value::Array(steps.iter().map(|r| {
        serde_json::json!({
            "kind":  r.get::<String, _>("kind"),
            "label": r.get::<String, _>("label"),
            "agent": r.try_get::<Option<String>, _>("agent_id").unwrap_or(None),
            "input": r.get::<serde_json::Value, _>("input"),
        })
    }).collect());

    let title = format!("How to: {}", &goal[..goal.len().min(80)]);
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO skills(id, agent_id, title, description, trigger, recipe, origin) VALUES ($1, NULL, $2, $3, $4, $5, 'learned')")
        .bind(id)
        .bind(&title)
        .bind(format!("Distilled from run {}. {} steps. Task type: {}.", &run_id[..8], steps.len(), task_type.unwrap_or_default()))
        .bind(&goal.to_lowercase())
        .bind(&recipe)
        .execute(pool).await.map_err(|e| format!("insert skill: {e}"))?;
    Ok(Some(id.to_string()))
}

fn simulate_execution(kind: &str, label: &str, input: &serde_json::Value) -> serde_json::Value {
    match kind {
        "tool" => serde_json::json!({
            "kind": "tool",
            "label": label,
            "stdout": format!("(simulated) {label} ok\ninput: {}", input),
            "exit_code": 0,
        }),
        "llm" => serde_json::json!({
            "kind": "llm",
            "label": label,
            "text": format!("[Scribe — placeholder] {label}: prepared a 2-line response based on input."),
        }),
        _ => serde_json::json!({ "kind": kind, "label": label, "note": "simulated" }),
    }
}
