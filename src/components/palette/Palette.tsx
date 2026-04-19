// ⌘K command palette — the single universal entry point.
//
// Sources unified: navigate / start a goal / pick a resource / pick an agent /
// pick a skill / open a recent run / open a settings tab. Each source plugs
// into the same fuzzy match.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowRight, Target, Server, Users, Sparkles, Settings, Home, KeyRound } from 'lucide-react'
import clsx from 'clsx'

interface PaletteItem {
  id:    string
  label: string
  hint?: string
  group: 'Navigate' | 'Goals' | 'Fleet' | 'Agents' | 'Skills' | 'Settings'
  run:   () => void | Promise<void>
}

interface Props { open: boolean; onClose: () => void }

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
    { id: 'goal-new',     label: 'New goal…',         group: 'Goals',    run: () => navigate('/goals?new=1') },
    { id: 'fleet-add',    label: 'Add SSH server…',   group: 'Fleet',    run: () => navigate('/fleet?add=ssh') },
    { id: 'login',        label: '/login — connect a provider', group: 'Settings', run: () => navigate('/settings/providers') },
  ], [navigate])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? items.filter(i => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q))
      : items
    return list
  }, [query, items])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(filtered.length - 1, h + 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(0, h - 1)) }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = filtered[highlight]
        if (item) { item.run(); onClose() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, highlight, onClose])

  if (!open) return null

  // Group preserving original order
  const grouped = filtered.reduce<Record<string, PaletteItem[]>>((acc, it) => {
    (acc[it.group] ??= []).push(it); return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[640px] max-w-[92vw] rounded-2xl border border-white/10 bg-surface shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-3">
          <Search size={14} className="text-meta" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlight(0) }}
            placeholder="Type a goal · jump to screen · /login · search resources / agents / skills"
            className="flex-1 bg-transparent text-[14px] text-heading outline-none placeholder:text-meta"
          />
          <kbd className="text-[10px] text-meta border border-white/10 rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {Object.entries(grouped).map(([group, list]) => (
            <div key={group} className="px-2 pb-2">
              <div className="text-[10px] font-bold text-meta uppercase tracking-wider px-2 pt-2 pb-1">{group}</div>
              {list.map((it, _) => {
                const idx = filtered.indexOf(it)
                const active = idx === highlight
                return (
                  <button
                    key={it.id}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => { it.run(); onClose() }}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px]',
                      active ? 'bg-primary/10 text-primary' : 'text-body hover:bg-white/5',
                    )}
                  >
                    <PaletteIcon group={it.group} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.hint && <kbd className="text-[10px] text-meta border border-white/10 rounded px-1.5 py-0.5">{it.hint}</kbd>}
                    {active && <ArrowRight size={12} className="text-primary" />}
                  </button>
                )
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-[12px] text-meta py-8">No matches.</div>
          )}
        </div>

        <div className="border-t border-white/10 px-3 py-2 text-[11px] text-meta flex items-center gap-3">
          <span><kbd className="border border-white/10 rounded px-1">↑</kbd>/<kbd className="border border-white/10 rounded px-1">↓</kbd> navigate</span>
          <span><kbd className="border border-white/10 rounded px-1">↵</kbd> select</span>
          <span className="ml-auto opacity-70">Systamator v2</span>
        </div>
      </div>
    </div>
  )
}

function PaletteIcon({ group }: { group: string }) {
  const Icon =
    group === 'Navigate' ? Home :
    group === 'Goals'    ? Target :
    group === 'Fleet'    ? Server :
    group === 'Agents'   ? Users :
    group === 'Skills'   ? Sparkles :
                           KeyRound
  return <Icon size={13} className="text-meta" />
}
