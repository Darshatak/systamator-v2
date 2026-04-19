import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, ArrowRight, Target, Server, Users, Sparkles, Settings,
  Home, KeyRound, Plug, Globe, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'

interface PaletteItem {
  id:    string
  label: string
  hint?: string
  group: string
  run:   () => void | Promise<void>
}

interface Props { open: boolean; onClose: () => void }

const SAMPLE_GOALS = [
  'Restart nginx on every prod server',
  'Find the 10 largest files on Mac mini and archive old ones',
  'Search the web for the latest Tauri 2 release notes and summarise',
  'Open Disk Drill on Mac mini and run a Cleanup scan',
  'Compare PostgreSQL backup costs across AWS / GCP / Hetzner',
]

export function Palette({ open, onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items: PaletteItem[] = useMemo(() => [
    { id: 'nav-home',     label: 'Home',     group: 'Navigate', run: () => navigate('/'),         hint: 'g h' },
    { id: 'nav-goals',    label: 'Goals',    group: 'Navigate', run: () => navigate('/goals'),    hint: 'g g' },
    { id: 'nav-fleet',    label: 'Fleet',    group: 'Navigate', run: () => navigate('/fleet'),    hint: 'g f' },
    { id: 'nav-agents',   label: 'Agents',   group: 'Navigate', run: () => navigate('/agents'),   hint: 'g a' },
    { id: 'nav-skills',   label: 'Skills',   group: 'Navigate', run: () => navigate('/skills'),   hint: 'g s' },
    { id: 'nav-settings', label: 'Settings', group: 'Navigate', run: () => navigate('/settings'), hint: 'g .' },
    { id: 'goal-new',     label: 'New goal',                          group: 'Quick action', run: () => navigate('/goals?new=1') },
    { id: 'fleet-add',    label: 'Add SSH server',                    group: 'Quick action', run: () => navigate('/fleet?add=ssh') },
    { id: 'login',        label: '/login — connect a provider',       group: 'Quick action', run: () => navigate('/settings/providers') },
    ...SAMPLE_GOALS.map((g, i) => ({
      id: `sample-${i}`,
      label: g,
      group: 'Try a goal',
      run: () => navigate('/goals?new=1&prefill=' + encodeURIComponent(g)),
    })),
  ], [navigate])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(i => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q))
  }, [query, items])

  useEffect(() => {
    if (open) { setQuery(''); setHighlight(0); requestAnimationFrame(() => inputRef.current?.focus()) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(filtered.length - 1, h + 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(0, h - 1)) }
      if (e.key === 'Enter') {
        e.preventDefault()
        const it = filtered[highlight]
        if (it) { it.run(); onClose() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, highlight, onClose])

  if (!open) return null

  const grouped = filtered.reduce<Record<string, PaletteItem[]>>((acc, it) => {
    (acc[it.group] ??= []).push(it); return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-md" onClick={onClose}>
      <div className="w-[680px] max-w-[92vw] glass rounded-2xl shadow-2xl overflow-hidden ring-glow" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3.5">
          <Search size={16} className="text-meta" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlight(0) }}
            placeholder="Type a goal · jump to screen · /login · search resources"
            className="flex-1 bg-transparent text-[14px] text-heading outline-none placeholder:text-meta"
          />
          <kbd>esc</kbd>
        </div>

        {/* Items */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {Object.entries(grouped).map(([group, list]) => (
            <div key={group} className="px-2 pb-2">
              <div className="text-[9px] font-bold text-meta uppercase tracking-[0.18em] px-3 pt-3 pb-1.5">{group}</div>
              {list.map((it) => {
                const idx = filtered.indexOf(it)
                const active = idx === highlight
                return (
                  <button
                    key={it.id}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => { it.run(); onClose() }}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-[13px] transition-colors',
                      active ? 'bg-[rgb(var(--c-primary)/0.18)] text-[rgb(var(--c-primary-2))]' : 'text-body hover:bg-white/5',
                    )}
                  >
                    <PaletteIcon group={it.group} active={active} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.hint && <kbd>{it.hint}</kbd>}
                    {active && <ArrowRight size={13} className="text-[rgb(var(--c-primary-2))]" />}
                  </button>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-[12px] text-meta py-10">No matches.</div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/8 px-4 py-2.5 text-[11px] text-meta flex items-center gap-3">
          <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span className="ml-auto opacity-70">Systamator v2 · M0</span>
        </div>
      </div>
    </div>
  )
}

function PaletteIcon({ group, active }: { group: string; active: boolean }) {
  const Icon =
    group === 'Navigate'    ? Home :
    group === 'Quick action'? KeyRound :
    group === 'Try a goal'  ? Target :
    group === 'Fleet'       ? Server :
    group === 'Agents'      ? Users :
    group === 'Skills'      ? Sparkles :
                              ChevronRight
  return (
    <span className={clsx('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0',
      active ? 'bg-[rgb(var(--c-primary)/0.2)]' : 'bg-white/5')}>
      <Icon size={12} className={active ? 'text-[rgb(var(--c-primary-2))]' : 'text-meta'} />
    </span>
  )
}
