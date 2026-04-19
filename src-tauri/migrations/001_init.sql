-- Systamator v2 — initial schema (M0)
-- Idempotent. Re-runnable.

-- ── Fleet ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resources (
  id           UUID PRIMARY KEY,
  kind         TEXT NOT NULL,                         -- ssh / docker / db / browser / mcp / repo
  name         TEXT NOT NULL UNIQUE,
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,    -- host/port/username/etc
  tags         TEXT[] NOT NULL DEFAULT '{}',
  facts        JSONB NOT NULL DEFAULT '{}'::jsonb,    -- agent-observed cache
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Agents (org tree) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id             TEXT PRIMARY KEY,                    -- 'lead-conductor', 'mgr-frontend', 'ic-ui'
  tier           TEXT NOT NULL CHECK (tier IN ('lead','manager','ic')),
  speciality     TEXT NOT NULL,
  parent_id      TEXT REFERENCES agents(id) ON DELETE SET NULL,
  manifest       JSONB NOT NULL,                      -- full .agent.json
  stats          JSONB NOT NULL DEFAULT '{
    "runs":0,"wins":0,"losses":0,"tokensSpent":0,"dollarsSpent":0,
    "avgWallMs":0,"expertiseScore":0.5,"lastActive":null
  }'::jsonb,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_id);
CREATE INDEX IF NOT EXISTS idx_agents_tier   ON agents(tier);

-- ── Runs + Steps ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id            UUID PRIMARY KEY,
  goal          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running',     -- running / done / failed / aborted / awaiting_user
  task_type     TEXT,                                -- research / code / ops / writing / reasoning / multimodal / casual
  conductor_id  TEXT REFERENCES agents(id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  cost          JSONB NOT NULL DEFAULT '{"tokens":0,"dollars":0,"wallMs":0}'::jsonb,
  summary       TEXT,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

CREATE TABLE IF NOT EXISTS steps (
  id            UUID PRIMARY KEY,
  run_id        UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agent_id      TEXT REFERENCES agents(id),
  kind          TEXT NOT NULL,                       -- tool / llm / control.if / control.loop / control.merge
  label         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',     -- pending / running / done / failed / skipped / awaiting_user
  depends_on    TEXT[] NOT NULL DEFAULT '{}',
  input         JSONB NOT NULL DEFAULT '{}'::jsonb,
  output        JSONB,
  critique      JSONB,                               -- {verdict, reasons, retryHint}
  retries       INT NOT NULL DEFAULT 0,
  cost          JSONB NOT NULL DEFAULT '{"tokens":0,"dollars":0,"wallMs":0}'::jsonb,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_steps_run    ON steps(run_id);
CREATE INDEX IF NOT EXISTS idx_steps_agent  ON steps(agent_id);
CREATE INDEX IF NOT EXISTS idx_steps_status ON steps(status);

-- ── Skills + Failures ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
  id             UUID PRIMARY KEY,
  agent_id       TEXT REFERENCES agents(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  trigger        TEXT,                               -- regex/keyword pattern
  precondition   TEXT[] NOT NULL DEFAULT '{}',
  recipe         JSONB NOT NULL,                     -- parameterised step skeleton
  origin         TEXT NOT NULL DEFAULT 'learned',    -- builtin / learned / openspace / community
  success_count  INT NOT NULL DEFAULT 0,
  failure_count  INT NOT NULL DEFAULT 0,
  last_used_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skills_agent ON skills(agent_id);

CREATE TABLE IF NOT EXISTS failures (
  id             UUID PRIMARY KEY,
  agent_id       TEXT REFERENCES agents(id) ON DELETE CASCADE,
  skill_id       UUID REFERENCES skills(id) ON DELETE SET NULL,
  context        TEXT NOT NULL,
  symptom        TEXT NOT NULL,
  root_cause     TEXT,
  remediation    TEXT,
  seen_count     INT NOT NULL DEFAULT 1,
  last_seen      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_failures_agent ON failures(agent_id);

-- ── Keychain index (UI listing only — secrets stay in OS keychain) ──
CREATE TABLE IF NOT EXISTS keychain_index (
  namespace  TEXT NOT NULL,
  key        TEXT NOT NULL,
  label      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, key)
);
