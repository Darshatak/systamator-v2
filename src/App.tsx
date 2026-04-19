import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import {
  Home, Target, Server, Users, Sparkles, Settings as Cog,
  Inbox, Command, Activity, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import clsx from 'clsx'
import { Palette } from './components/palette/Palette'

const HomeScreen      = lazy(() => import('./screens/home/HomeScreen'))
const GoalsScreen     = lazy(() => import('./screens/goals/GoalsScreen'))
const RunDetailScreen = lazy(() => import('./screens/runs/RunDetailScreen'))
const FleetScreen     = lazy(() => import('./screens/fleet/FleetScreen'))
const AgentsScreen    = lazy(() => import('./screens/agents/AgentsScreen'))
const SkillsScreen    = lazy(() => import('./screens/skills/SkillsScreen'))
const SettingsScreen  = lazy(() => import('./screens/settings/SettingsScreen'))

const NAV = [
  { to: '/',         icon: Home,     label: 'Home' },
  { to: '/goals',    icon: Target,   label: 'Goals' },
  { to: '/fleet',    icon: Server,   label: 'Fleet' },
  { to: '/agents',   icon: Users,    label: 'Agents' },
  { to: '/skills',   icon: Sparkles, label: 'Skills' },
] as const

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [expanded, setExpanded] = useState<boolean>(() => localStorage.getItem('rail.expanded') !== 'false')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(v => !v) }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
          <button
            className={clsx(
              'w-full flex items-center gap-3 px-3 h-9 rounded-xl text-[12px] text-meta hover:text-heading hover:bg-white/5',
              !expanded && 'justify-center px-0',
            )}
          >
            <Inbox size={14} className="flex-shrink-0" />
            {expanded && <>
              <span className="font-medium">Inbox</span>
              <span className="ml-auto text-[10px] text-meta bg-white/8 rounded-full px-1.5 py-0.5">0</span>
            </>}
          </button>

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
            <Route path="/"          element={<HomeScreen onPalette={() => setPaletteOpen(true)} />} />
            <Route path="/goals"     element={<GoalsScreen />} />
            <Route path="/goals/:id" element={<RunDetailScreen />} />
            <Route path="/fleet"     element={<FleetScreen />} />
            <Route path="/agents"    element={<AgentsScreen />} />
            <Route path="/skills"    element={<SkillsScreen />} />
            <Route path="/settings/*"element={<SettingsScreen />} />
            <Route path="*"          element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
