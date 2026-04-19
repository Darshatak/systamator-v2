# M0 — Foundation checklist

Tracks what landed in the initial scaffold + what's required before M0 ships.

## ✓ Landed

- Project scaffold: package.json, tsconfig, vite.config, tailwind/postcss, index.html
- Tauri shell: tauri.conf.json, Cargo.toml, build.rs, main.rs, lib.rs
- Rust modules:
  - `keychain.rs` — OS keychain wrapper (NEW vs v1)
  - `db.rs` + `migrations/001_init.sql` — Postgres schema for runs/steps/agents/skills/failures/resources/keychain_index
  - `agents.rs` — agent CRUD + EWMA outcome stats
  - `runs.rs` — run + step CRUD
  - `skills.rs` — skill CRUD + literal LIKE search (fastembed in M2)
  - `resources.rs` — fleet CRUD
  - `ssh.rs` — pool dedup + heartbeat (ported)
  - `cache.rs`, `mcp.rs`, `connectors.rs`, `pii_guard.rs`, `web_scrape.rs`, `web_search.rs` (ported)
- Three seed agent manifests: Conductor (lead), Ironsmith (Ops mgr), IC-SSH (ic)
- React 19 frontend:
  - `App.tsx` with 6-screen rail + ⌘K palette
  - `main.tsx` with TanStack Query provider
  - `components/palette/Palette.tsx` — universal command palette
  - 6 screens (Home, Goals, Fleet, Agents, Skills, Settings)
  - Settings → Providers tab — unified `/login` rows for 6 providers
  - `lib/ipc.ts` — Tauri ↔ HTTP bridge
  - `lib/keychain.ts` — frontend wrapper around keychain commands
  - `types/domain.ts` — canonical models (Resource, AgentProfile, Run, Step, Skill)
  - Design tokens in `styles/index.css`

## ☐ Before "M0 done" sticker

- [ ] `npm install && npm run lint` passes
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` passes
- [ ] `npm run tauri:dev` boots, palette opens with ⌘K, all 6 screens render
- [ ] Postgres connection (DATABASE_URL or default `postgres://systamator:systamator@127.0.0.1:5435/systamator_v2`) creates the schema
- [ ] At least one provider key persists into the OS keychain via Settings → Providers
- [ ] At least one Resource saved + listed in Fleet
- [ ] App icons in `src-tauri/icons/` (currently empty — copy from v1 or generate fresh)

## What is intentionally NOT in M0

- Agent JSON loader → DB seeder (M1)
- PAUN orchestrator + step execution (M1)
- Conductor → Manager → IC bidding (M1)
- OpenSpace integration (M2)
- Graphify / Obsidian MCP (M3)
- Browser agent / computer-use (M3)
- Vibe Kanban Goals board (M4)

See `../Systamator/docs/SYSTAMATOR-V2-PRD.md`, `INTEGRATIONS.md`, `ORG.md` for the full plan.
