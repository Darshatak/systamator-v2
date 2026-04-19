import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { User, KeyRound, Server, Users, SlidersHorizontal } from 'lucide-react'
import { ProvidersTab } from './ProvidersTab'
import clsx from 'clsx'

const TABS = [
  { to: '/settings/account',    label: 'Account',   icon: User },
  { to: '/settings/providers',  label: 'Providers', icon: KeyRound },
  { to: '/settings/fleet',      label: 'Fleet',     icon: Server },
  { to: '/settings/agents',     label: 'Agents',    icon: Users },
  { to: '/settings/advanced',   label: 'Advanced',  icon: SlidersHorizontal },
] as const

export default function SettingsScreen() {
  return (
    <div className="h-full flex">
      <aside className="w-[200px] flex-shrink-0 border-r border-white/8 flex flex-col py-4">
        <div className="px-4 text-[10px] font-bold text-meta uppercase tracking-wider mb-2">Settings</div>
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) =>
            clsx('flex items-center gap-2 px-4 py-2 text-[12px]',
                 isActive ? 'text-primary bg-primary/10 border-r-2 border-primary' : 'text-body hover:bg-white/5')}>
            <Icon size={12} />
            {label}
          </NavLink>
        ))}
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto p-6">
        <Routes>
          <Route path="account"   element={<Stub title="Account" />} />
          <Route path="providers" element={<ProvidersTab />} />
          <Route path="fleet"     element={<Stub title="Fleet — see /fleet for now" />} />
          <Route path="agents"    element={<Stub title="Agents — see /agents for now" />} />
          <Route path="advanced"  element={<Stub title="Advanced — cache, log level, export/import" />} />
          <Route path=""          element={<Navigate to="account" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function Stub({ title }: { title: string }) {
  return (
    <div className="text-meta text-[13px]">
      <h2 className="text-heading text-[15px] font-semibold mb-1">{title}</h2>
      Stub for M0. Comes online in subsequent milestones.
    </div>
  )
}
