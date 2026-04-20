import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import {
  Home, MessageSquare, Server, Boxes, Container, CalendarClock, Workflow,
  Sparkles, Settings as Cog, Inbox, Command, ChevronsLeft, ChevronsRight,
  Database, RefreshCw, Loader2, Copy, Check, Rocket, AlertCircle,
} from 'lucide-react'
import clsx from 'clsx'
import { Palette } from './components/palette/Palette'
import { Toaster } from './components/ui/Toaster'
import { invoke, isDesktop } from './lib/ipc'

const HomeScreen       = lazy(() => import('./screens/home/HomeScreen'))
const ChatScreen       = lazy(() => import('./screens/chat/ChatScreen'))
const GoalsScreen      = lazy(() => import('./screens/goals/GoalsScreen'))
const RunDetailScreen  = lazy(() => import('./screens/runs/RunDetailScreen'))
const FleetScreen      = lazy(() => import('./screens/fleet/FleetScreen'))
const AgentsScreen     = lazy(() => import('./screens/agents/AgentsScreen'))
const SkillsScreen     = lazy(() => import('./screens/skills/SkillsScreen'))
const SettingsScreen   = lazy(() => import('./screens/settings/SettingsScreen'))
const InboxScreen      = lazy(() => import('./screens/inbox/InboxScreen'))
const BrowserScreen    = lazy(() => import('./screens/browser/BrowserScreen'))
const CodeScreen       = lazy(() => import('./screens/code/CodeScreen'))
const AppsScreen       = lazy(() => import('./screens/infra/AppsScreen'))
const ContainersScreen = lazy(() => import('./screens/infra/ContainersScreen'))
const CronScreen       = lazy(() => import('./screens/infra/CronScreen'))
const FlowsScreen      = lazy(() => import('./screens/infra/FlowsScreen'))

// Infrastructure-first rail (v1-shape). Goals/Browser/Code/Agents are
// intentionally absent — they're observer sub-tabs inside /runs/:id now,
// not standalone destinations.
const NAV = [
  { to: '/',           icon: Home,          label: 'Home' },
  { to: '/chat',       icon: MessageSquare, label: 'Chat' },
  { to: '/fleet',      icon: Server,        label: 'Fleet' },
  { to: '/apps',       icon: Boxes,         label: 'Apps' },
  { to: '/containers', icon: Container,     label: 'Containers' },
  { to: '/cron',       icon: CalendarClock, label: 'Cron' },
  { to: '/flows',      icon: Workflow,      label: 'Flows' },
  { to: '/skills',     icon: Sparkles,      label: 'Skills' },
] as const

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [expanded, setExpanded] = useState<boolean>(() => localStorage.getItem('rail.expanded') !== 'false')
  const [dbReady, setDbReady] = useState<boolean | null>(isDesktop() ? null : true)

  useEffect(() => {
    if (!isDesktop()) return
    let cancelled = false
    async function poll() {
      while (!cancelled) {
        const s = await invoke<{ connected: boolean }>('db_status', {}).catch(() => ({ connected: false }))
        if (cancelled) return
        if (s.connected) { setDbReady(true); return }
        setDbReady(false)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
    void poll()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(v => !v) }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (dbReady === null) {
    return <div className="h-full flex items-center justify-center text-meta text-[12px] gap-2"><Loader2 size={14} className="animate-spin" /> connecting to Postgres…</div>
  }
  if (dbReady === false) {
    return <PostgresGate onConnected={() => setDbReady(true)} />
  }

  return (
    <div className="h-full flex">
      {/* ── Rail ──────────────────────────────────────────────── */}
      <aside
        className={clsx(
          'flex-shrink-0 flex flex-col border-r border-white/8 bg-[rgb(var(--c-bg-elev)/0.6)] backdrop-blur-md transition-[width] duration-200',
          expanded ? 'w-[212px]' : 'w-[64px]',
        )}
      >
        {/* Logo + collapse */}
        <div className={clsx('flex items-center px-3 py-3', expanded ? 'justify-between' : 'justify-center')}>
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center text-white font-bold text-[13px] shadow-lg shadow-[rgb(var(--c-primary)/0.4)]">S</div>
            {expanded && (
              <div>
                <div className="text-[12px] font-bold text-heading leading-tight">Systamator</div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-meta">Agent OS</div>
              </div>
            )}
          </div>
          {expanded && (
            <button onClick={() => { setExpanded(false); localStorage.setItem('rail.expanded', 'false') }}
                    className="p-1 rounded-md text-meta hover:text-heading hover:bg-white/5">
              <ChevronsLeft size={14} />
            </button>
          )}
        </div>

        {/* Palette button */}
        <div className="px-2 mb-3">
          <button
            onClick={() => setPaletteOpen(true)}
            className={clsx(
              'w-full flex items-center gap-2 px-3 h-10 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/5 text-meta hover:text-heading transition-colors',
              !expanded && 'justify-center px-0'
            )}
          >
            <Command size={14} className="flex-shrink-0" />
            {expanded && <>
              <span className="text-[12px]">Search · run goal</span>
              <kbd className="ml-auto">⌘K</kbd>
            </>}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => clsx(
              'group flex items-center gap-3 px-3 h-9 rounded-xl text-[12px] transition-colors',
              !expanded && 'justify-center px-0',
              isActive
                ? 'bg-[rgb(var(--c-primary)/0.16)] text-[rgb(var(--c-primary-2))]'
                : 'text-meta hover:text-heading hover:bg-white/5',
            )}>
              <Icon size={14} className="flex-shrink-0" />
              {expanded && <span className="font-medium">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: Inbox + Settings + expand toggle */}
        <div className="px-2 pb-3 space-y-0.5 border-t border-white/8 pt-3">
          <NavLink to="/settings" className={({ isActive }) => clsx(
            'flex items-center gap-3 px-3 h-9 rounded-xl text-[12px]',
            !expanded && 'justify-center px-0',
            isActive ? 'bg-[rgb(var(--c-primary)/0.16)] text-[rgb(var(--c-primary-2))]' : 'text-meta hover:text-heading hover:bg-white/5',
          )}>
            <Cog size={14} className="flex-shrink-0" />
            {expanded && <span className="font-medium">Settings</span>}
          </NavLink>
          <NavLink to="/inbox" className={({ isActive }) => clsx(
            'flex items-center gap-3 px-3 h-9 rounded-xl text-[12px]',
            !expanded && 'justify-center px-0',
            isActive ? 'bg-[rgb(var(--c-primary)/0.16)] text-[rgb(var(--c-primary-2))]' : 'text-meta hover:text-heading hover:bg-white/5',
          )}>
            <Inbox size={14} className="flex-shrink-0" />
            {expanded && <span className="font-medium">Inbox</span>}
          </NavLink>

          {!expanded && (
            <button onClick={() => { setExpanded(true); localStorage.setItem('rail.expanded', 'true') }}
                    className="w-full flex items-center justify-center h-9 rounded-xl text-meta hover:text-heading hover:bg-white/5">
              <ChevronsRight size={14} />
            </button>
          )}
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <Suspense fallback={<div className="h-full flex items-center justify-center text-meta text-sm">Loading…</div>}>
          <Routes>
            <Route path="/"           element={<HomeScreen onPalette={() => setPaletteOpen(true)} />} />
            <Route path="/chat"       element={<ChatScreen />} />
            <Route path="/fleet"      element={<FleetScreen />} />
            <Route path="/apps"       element={<AppsScreen />} />
            <Route path="/containers" element={<ContainersScreen />} />
            <Route path="/cron"       element={<CronScreen />} />
            <Route path="/flows"      element={<FlowsScreen />} />
            <Route path="/skills"     element={<SkillsScreen />} />
            <Route path="/settings/*" element={<SettingsScreen />} />
            <Route path="/inbox"      element={<InboxScreen />} />
            {/* Observer + deep-link routes — not in primary nav. */}
            <Route path="/runs/:id"   element={<RunDetailScreen />} />
            <Route path="/goals"      element={<GoalsScreen />} />
            <Route path="/goals/:id"  element={<RunDetailScreen />} />
            <Route path="/agents"     element={<AgentsScreen />} />
            <Route path="/browser"    element={<BrowserScreen />} />
            <Route path="/code"       element={<CodeScreen />} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toaster />
    </div>
  )
}

interface DbStatusPayload { connected: boolean; message: string; url: string; source: string }
interface DockerInfoPayload { installed: boolean; version: string | null; daemonOk: boolean }

function PostgresGate({ onConnected }: { onConnected: () => void }) {
  const [retrying, setRetrying]       = useState(false)
  const [copied, setCopied]           = useState<string | null>(null)
  const [err, setErr]                 = useState<string | null>(null)
  const [status, setStatus]           = useState<DbStatusPayload | null>(null)
  const [urlDraft, setUrlDraft]       = useState<string>('')
  const [saving, setSaving]           = useState(false)
  const [docker, setDocker]           = useState<DockerInfoPayload | null>(null)
  const [dockerBusy, setDockerBusy]   = useState(false)
  const [dockerPhase, setDockerPhase] = useState<string | null>(null)

  useEffect(() => {
    invoke<DbStatusPayload>('db_status', {})
      .then(s => { setStatus(s); setUrlDraft(s.url) })
      .catch(() => {})
    invoke<DockerInfoPayload>('infra_docker_check', {}).then(setDocker).catch(() => setDocker({ installed: false, version: null, daemonOk: false }))
  }, [])

  // Manual brew fallback for people who'd rather not touch Docker.
  const INSTALL = [
    'brew install postgresql@16',
    'brew services start postgresql@16',
    'createuser --superuser systamator 2>/dev/null || true',
    'createdb -O systamator systamator_v2 2>/dev/null || true',
  ].join('\n')

  async function startDocker() {
    setDockerBusy(true); setErr(null); setDockerPhase('Starting container + waiting for pg_isready…')
    try {
      const s = await invoke<DbStatusPayload>('infra_postgres_up', {})
      setStatus(s); setUrlDraft(s.url)
      if (s.connected) { onConnected(); return }
      setErr(s.message)
    } catch (e) { setErr(String((e as Error)?.message ?? e)) }
    finally { setDockerBusy(false); setDockerPhase(null) }
  }

  async function retry() {
    setRetrying(true); setErr(null)
    try {
      const s = await invoke<DbStatusPayload>('db_reconnect', {})
      setStatus(s)
      if (s.connected) { onConnected(); return }
      setErr(s.message)
    } catch (e) { setErr(String((e as Error)?.message ?? e)) }
    finally { setRetrying(false) }
  }
  async function saveUrl() {
    setSaving(true); setErr(null)
    try {
      const s = await invoke<DbStatusPayload>('db_set_url', { url: urlDraft })
      setStatus(s)
      if (s.connected) { onConnected(); return }
      setErr(s.message)
    } catch (e) { setErr(String((e as Error)?.message ?? e)) }
    finally { setSaving(false) }
  }
  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 1500) })
  }

  const dockerReady = docker?.installed && docker?.daemonOk

  return (
    <div className="h-full flex items-center justify-center p-8 overflow-auto">
      <div className="max-w-[620px] w-full rounded-2xl border border-white/10 bg-[rgb(var(--c-surface))] shadow-2xl p-7">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[rgb(var(--c-danger)/0.14)] text-[rgb(var(--c-danger))] flex items-center justify-center">
            <Database size={16} />
          </div>
          <div>
            <div className="text-[16px] font-bold text-heading">Postgres required</div>
            <div className="text-[11px] text-meta">Systamator v2 stores every run, step, agent, and skill in Postgres. It's not optional.</div>
          </div>
        </div>

        {/* Live status */}
        {status && (
          <div className="text-[11px] text-meta mb-4">
            Last tried <code className="bg-white/5 rounded px-1 font-mono text-body">{status.url}</code>
            <span className="ml-2 opacity-60">(source: {status.source})</span>
          </div>
        )}

        {/* ── Primary path: Docker ──────────────────────────── */}
        <div className="rounded-xl border border-[rgb(var(--c-primary)/0.35)] bg-[rgb(var(--c-primary)/0.06)] p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Rocket size={13} className="text-[rgb(var(--c-primary-2))]" />
            <span className="text-[12px] font-bold text-heading">One-click — Docker</span>
            <span className="ml-auto text-[10px] text-meta">
              {docker === null ? 'detecting…' :
               !docker.installed ? 'not installed' :
               !docker.daemonOk   ? 'daemon offline' :
               docker.version}
            </span>
          </div>
          <div className="text-[11px] text-meta leading-relaxed mb-3">
            Starts <code className="bg-white/5 rounded px-1 font-mono">postgres:16-alpine</code> as <code className="bg-white/5 rounded px-1 font-mono">systamator-postgres</code> on :5432, with a persistent volume at <code className="bg-white/5 rounded px-1 font-mono">app-data/pgdata</code>. We wait for pg_isready, save the URL, and unlock.
          </div>
          <button onClick={startDocker} disabled={!dockerReady || dockerBusy}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 h-10 rounded-xl gradient-primary text-white text-[13px] font-semibold disabled:opacity-50">
            {dockerBusy ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
            {dockerBusy ? (dockerPhase ?? 'Starting…') : 'Start Postgres with Docker'}
          </button>
          {!dockerReady && docker !== null && (
            <div className="mt-3 flex items-start gap-2 text-[11px] text-meta">
              <AlertCircle size={11} className="mt-0.5 flex-shrink-0 text-[rgb(var(--c-warn))]" />
              <span>
                {!docker.installed
                  ? <>Install <a href="https://www.docker.com/products/docker-desktop/" target="_blank" rel="noreferrer" className="underline">Docker Desktop</a>, <a href="https://orbstack.dev" target="_blank" rel="noreferrer" className="underline">OrbStack</a>, or run <code className="bg-white/5 rounded px-1 font-mono">brew install colima docker && colima start</code>.</>
                  : <>Docker is installed but the daemon isn't reachable. Start Docker Desktop / OrbStack / <code className="bg-white/5 rounded px-1 font-mono">colima start</code>.</>}
              </span>
            </div>
          )}
        </div>

        {/* ── Already have Postgres elsewhere? ──────────────── */}
        <div className="mb-4">
          <div className="text-[10px] font-bold text-meta uppercase tracking-wider mb-1.5">Already running Postgres somewhere?</div>
          <div className="flex items-center gap-2">
            <input value={urlDraft} onChange={e => setUrlDraft(e.target.value)}
                   placeholder="postgres://user:pass@host:port/db"
                   className="flex-1 h-9 px-3 rounded-lg border border-white/10 bg-white/5 text-[12px] font-mono text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
            <button onClick={saveUrl} disabled={saving}
                    className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-[12px] text-body hover:bg-white/10 disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save & try'}
            </button>
          </div>
          <div className="text-[10px] text-meta mt-1">Env <code className="bg-white/5 rounded px-1 font-mono">DATABASE_URL</code> wins if set — otherwise this value is stored in app settings.</div>
        </div>

        {/* ── Manual brew fallback (collapsed by default) ──── */}
        <details className="mb-3">
          <summary className="text-[11px] text-meta cursor-pointer hover:text-body select-none">Prefer a native install? brew snippet →</summary>
          <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-3 relative">
            <div className="text-[10px] font-bold text-meta uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>macOS — paste into Terminal</span>
              <button onClick={() => copy(INSTALL, 'install')} className="p-1 rounded hover:bg-white/5">
                {copied === 'install' ? <Check size={11} className="text-[rgb(var(--c-success))]" /> : <Copy size={11} />}
              </button>
            </div>
            <pre className="text-[11px] font-mono text-body whitespace-pre-wrap leading-relaxed">{INSTALL}</pre>
          </div>
        </details>

        <div className="flex items-center gap-2">
          <button onClick={retry} disabled={retrying}
                  className="inline-flex items-center gap-2 px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-[12px] text-body hover:bg-white/10 disabled:opacity-50">
            {retrying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Retry
          </button>
          {err && <span className="text-[11px] text-[rgb(var(--c-danger))] font-mono truncate">{err}</span>}
        </div>
      </div>
    </div>
  )
}
