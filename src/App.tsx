import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import {
  Home, MessageSquare, Server, Boxes, Container, CalendarClock, Workflow,
  Sparkles, Settings as Cog, Inbox, Command, ChevronsLeft, ChevronsRight,
  Database, RefreshCw, Loader2, Copy, Check,
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
    return <PostgresGate onRetry={async () => {
      const s = await invoke<{ connected: boolean }>('db_reconnect', {}).catch(() => ({ connected: false }))
      setDbReady(s.connected)
    }} />
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

function PostgresGate({ onRetry }: { onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false)
  const [copied, setCopied]     = useState<string | null>(null)
  const [err, setErr]           = useState<string | null>(null)

  // Mac install snippet. Linux/Windows users just run their package mgr.
  const INSTALL = [
    'brew install postgresql@16',
    'brew services start postgresql@16',
    'createuser --superuser systamator 2>/dev/null || true',
    "psql -d postgres -c \"ALTER USER systamator WITH PASSWORD 'systamator';\"",
    'createdb -O systamator systamator_v2',
  ].join('\n')

  async function retry() {
    setRetrying(true); setErr(null)
    try { await onRetry() } catch (e) { setErr(String((e as Error)?.message ?? e)) }
    finally { setRetrying(false) }
  }
  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 1500) })
  }

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-[560px] w-full rounded-2xl border border-white/10 bg-[rgb(var(--c-surface))] shadow-2xl p-7">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[rgb(var(--c-danger)/0.14)] text-[rgb(var(--c-danger))] flex items-center justify-center">
            <Database size={16} />
          </div>
          <div>
            <div className="text-[16px] font-bold text-heading">Postgres required</div>
            <div className="text-[11px] text-meta">Systamator v2 stores every run, step, agent, and skill in Postgres. It's not optional.</div>
          </div>
        </div>

        <div className="text-[11px] text-meta mb-2">Expected: <code className="bg-white/5 rounded px-1 font-mono text-body">postgres://systamator:systamator@127.0.0.1:5435/systamator_v2</code></div>
        <div className="text-[11px] text-meta mb-2">Or override with <code className="bg-white/5 rounded px-1 font-mono text-body">DATABASE_URL</code>.</div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 relative">
          <div className="text-[10px] font-bold text-meta uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>macOS install — paste into Terminal</span>
            <button onClick={() => copy(INSTALL, 'install')} className="p-1 rounded hover:bg-white/5">
              {copied === 'install' ? <Check size={11} className="text-[rgb(var(--c-success))]" /> : <Copy size={11} />}
            </button>
          </div>
          <pre className="text-[11px] font-mono text-body whitespace-pre-wrap leading-relaxed">{INSTALL}</pre>
        </div>
        <div className="text-[10px] text-meta mt-2">Note: default port is 5432 — v2 uses <b>5435</b>. Either create a 5435 cluster or set <code className="bg-white/5 rounded px-1 font-mono">DATABASE_URL</code> to your 5432 instance and restart.</div>

        <div className="mt-5 flex items-center gap-2">
          <button onClick={retry} disabled={retrying}
                  className="inline-flex items-center gap-2 px-4 h-9 rounded-xl gradient-primary text-white text-[12px] font-semibold disabled:opacity-50">
            {retrying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Retry connection
          </button>
          {err && <span className="text-[11px] text-[rgb(var(--c-danger))] font-mono">{err}</span>}
        </div>
      </div>
    </div>
  )
}
