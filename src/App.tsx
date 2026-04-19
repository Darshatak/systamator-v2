import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Home, Target, Server, Users, Sparkles, Settings as Cog, Inbox, Command } from 'lucide-react'
import { Palette } from './components/palette/Palette'

const HomeScreen     = lazy(() => import('./screens/home/HomeScreen'))
const GoalsScreen    = lazy(() => import('./screens/goals/GoalsScreen'))
const FleetScreen    = lazy(() => import('./screens/fleet/FleetScreen'))
const AgentsScreen   = lazy(() => import('./screens/agents/AgentsScreen'))
const SkillsScreen   = lazy(() => import('./screens/skills/SkillsScreen'))
const SettingsScreen = lazy(() => import('./screens/settings/SettingsScreen'))

const NAV = [
  { to: '/',         icon: Home,     label: 'Home' },
  { to: '/goals',    icon: Target,   label: 'Goals' },
  { to: '/fleet',    icon: Server,   label: 'Fleet' },
  { to: '/agents',   icon: Users,    label: 'Agents' },
  { to: '/skills',   icon: Sparkles, label: 'Skills' },
  { to: '/settings', icon: Cog,      label: 'Settings' },
] as const

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)

  // ⌘K / Ctrl+K opens the palette — the only universal entry point.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPaletteOpen(v => !v)
      }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="h-full flex bg-bg text-body">
      {/* Rail */}
      <aside className="w-[64px] flex-shrink-0 border-r border-white/8 flex flex-col items-center py-3 gap-1">
        <button
          onClick={() => setPaletteOpen(true)}
          title="Open palette (⌘K)"
          className="w-10 h-10 rounded-xl mb-3 flex items-center justify-center bg-primary text-white shadow-md hover:opacity-90"
        >
          <Command size={16} />
        </button>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                isActive ? 'bg-primary/10 text-primary' : 'text-meta hover:text-heading hover:bg-white/5'
              }`}
            title={label}
          >
            <Icon size={16} />
          </NavLink>
        ))}
        <div className="mt-auto">
          <button title="Inbox"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-meta hover:text-heading hover:bg-white/5">
            <Inbox size={16} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-hidden">
        <Suspense fallback={<div className="h-full flex items-center justify-center text-meta text-sm">Loading…</div>}>
          <Routes>
            <Route path="/"          element={<HomeScreen onPalette={() => setPaletteOpen(true)} />} />
            <Route path="/goals"     element={<GoalsScreen />} />
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
