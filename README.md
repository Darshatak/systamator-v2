# Systamator v2

> Agent-first infrastructure OS. Hand the team a goal — Conductor delegates, ICs execute, Critic checks, Skills accumulate.

This is the ground-up rewrite spec'd in [the v1 repo's docs](../Systamator/docs/SYSTAMATOR-V2-PRD.md). It is **not** a flag on v1 — it lives in its own folder, its own git history, its own data dirs.

## Status

**M0 Foundation** — scaffold landed. Runs as a desktop shell with the 6 screens, command palette, and IPC bridge. Backend modules ported but not all wired yet.

## Quick start

```bash
npm install
npm run tauri:dev    # desktop app on :1420
```

For frontend-only work (no Tauri):
```bash
npm run dev
```

## Layout

```
.
├── docs/                      ← will mirror parent repo's v2 specs
├── src/                       ← React 19 + TS frontend
│   ├── components/            ← palette / layout / ui / inbox
│   ├── lib/                   ← ipc, keychain, stores, helpers
│   ├── screens/               ← home, goals, fleet, agents, skills, settings
│   ├── store/                 ← Zustand slices per domain
│   └── types/                 ← canonical domain models
├── src-tauri/                 ← Rust backend
│   ├── agents/                ← *.agent.json manifests
│   ├── migrations/            ← Postgres SQL migrations
│   └── src/                   ← per-module Rust code
└── scripts/                   ← devops + bootstrap
```

## Reference docs (in parent repo)

- `docs/SYSTAMATOR-V2-PRD.md` — vision, control-room UX, 10-sprint rollout
- `docs/SYSTAMATOR-V2-INTEGRATIONS.md` — OpenSpace · Vibe Kanban · Graphify · Obsidian · PAUN
- `docs/SYSTAMATOR-V2-ORG.md` — Team Lead → Manager → IC hierarchy with bidding & evolution

## Differences from v1 already in place

- Secrets live in **OS keychain** (`keyring` crate), never in JSON
- Domain models (Goal, Run, Step, Agent, Skill, Failure, Resource) are first-class
- Six screens — no 25-route sidebar
- Command Palette is the only universal entry point
- Inbox is the only place the agent ever interrupts you
