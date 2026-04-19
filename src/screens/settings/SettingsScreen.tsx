import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { User, KeyRound, Server, Users, SlidersHorizontal, Plug } from 'lucide-react'
import { ProvidersTab } from './ProvidersTab'
import { McpTab } from './McpTab'
import clsx from 'clsx'
import { TopBar } from '@/components/ui'

const TABS = [
  { to: '/settings/account',   label: 'Account',   icon: User,     hint: 'Profile, theme, shortcuts' },
  { to: '/settings/providers', label: 'Providers', icon: KeyRound, hint: 'AI provider keys + CLI' },
  { to: '/settings/mcp',       label: 'MCP',       icon: Plug,     hint: 'Featured + registered MCPs' },
  { to: '/settings/fleet',     label: 'Fleet',     icon: Server,   hint: 'SSH, Docker, DB' },
  { to: '/settings/agents',    label: 'Agents',    icon: Users,    hint: 'Roster + budgets' },
  { to: '/settings/advanced',  label: 'Advanced',  icon: SlidersHorizontal, hint: 'Cache, logs, export' },
] as const

export default function SettingsScreen() {
  return (
    <div className="h-full flex flex-col">
      <TopBar title="Settings" subtitle="One screen, five groups. No mid-task popups, no scattered tabs." />
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[230px] flex-shrink-0 border-r border-white/8 py-4">
          <div className="px-4 text-[10px] font-bold uppercase tracking-[0.18em] text-meta mb-2">Sections</div>
          {TABS.map(({ to, label, icon: Icon, hint }) => (
            <NavLink key={to} to={to} className={({ isActive }) =>
              clsx('flex items-start gap-3 px-4 py-2.5 text-[12px] transition-colors',
                isActive ? 'text-[rgb(var(--c-primary-2))] bg-[rgb(var(--c-primary)/0.10)] border-r-2 border-[rgb(var(--c-primary-2))]' : 'text-body hover:bg-white/5')}>
              <Icon size={13} className="mt-0.5" />
              <div>
                <div className="font-semibold leading-tight">{label}</div>
                <div className="text-[10px] text-meta">{hint}</div>
              </div>
            </NavLink>
          ))}
        </aside>
        <main className="flex-1 min-w-0 overflow-y-auto px-7 py-6">
          <Routes>
            <Route path="account"   element={<Stub title="Account" />} />
            <Route path="providers" element={<ProvidersTab />} />
            <Route path="mcp"       element={<McpTab />} />
            <Route path="fleet"     element={<Stub title="Fleet — see /fleet" />} />
            <Route path="agents"    element={<Stub title="Agents — see /agents" />} />
            <Route path="advanced"  element={<Stub title="Advanced" />} />
            <Route path=""          element={<Navigate to="account" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function Stub({ title }: { title: string }) {
  return (
    <div>
      <h2 className="text-[18px] font-bold text-heading mb-2">{title}</h2>
      <p className="text-[12px] text-meta">Stub for M0. Comes online in subsequent milestones.</p>
    </div>
  )
}
