// Account tab — identity + theme + shortcuts.
// Personal profile lives in localStorage (no backend needed); theme
// toggle flips the .light class on <html>.

import { useEffect, useState } from 'react'
import { User, Sun, Moon, Save, Keyboard } from 'lucide-react'
import { Card, Button, Chip } from '@/components/ui'

const LS_NAME  = 'systamator.account.name'
const LS_EMAIL = 'systamator.account.email'
const LS_THEME = 'systamator.account.theme'

const SHORTCUTS: [string, string][] = [
  ['⌘K',      'Open command palette (universal entry)'],
  ['⌘↵',     'Submit goal composer'],
  ['Esc',     'Close palette / drawer'],
  ['g h',     'Go Home'],
  ['g g',     'Go Goals'],
  ['g f',     'Go Fleet'],
  ['g a',     'Go Agents'],
  ['g s',     'Go Skills'],
  ['g .',     'Go Settings'],
]

export function AccountTab() {
  const [name,  setName]  = useState(() => localStorage.getItem(LS_NAME)  ?? '')
  const [email, setEmail] = useState(() => localStorage.getItem(LS_EMAIL) ?? '')
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem(LS_THEME) as 'dark' | 'light') ?? 'dark')
  const [saved, setSaved] = useState(false)

  // Apply theme class on mount + whenever changed.
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') root.classList.add('light'); else root.classList.remove('light')
    localStorage.setItem(LS_THEME, theme)
  }, [theme])

  function saveProfile() {
    localStorage.setItem(LS_NAME,  name)
    localStorage.setItem(LS_EMAIL, email)
    setSaved(true); setTimeout(() => setSaved(false), 1400)
  }

  const initials = (name.trim() || 'You').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-[18px] font-bold text-heading mb-1">Account</h2>
        <p className="text-[12px] text-meta">Identity, theme, keyboard shortcuts. Local-first — nothing leaves this machine.</p>
      </div>

      {/* Profile */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl gradient-primary text-white flex items-center justify-center font-bold text-[18px] shadow-lg">
            {initials}
          </div>
          <div className="flex-1 grid grid-cols-2 gap-2">
            <label>
              <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-1">Display name</div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="What the agents call you"
                     className="w-full h-8 px-2 rounded-md border border-white/10 bg-white/5 text-[12px] text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
            </label>
            <label>
              <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-1">Email (optional)</div>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                     className="w-full h-8 px-2 rounded-md border border-white/10 bg-white/5 text-[12px] text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
            </label>
          </div>
          <Button icon={<Save size={11} />} onClick={saveProfile}>{saved ? 'Saved' : 'Save'}</Button>
        </div>
      </Card>

      {/* Theme */}
      <Card>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))] flex items-center justify-center">
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-heading">Theme</div>
            <div className="text-[11px] text-meta">Match system lighting or pin to one mode.</div>
          </div>
          <div className="flex rounded-md border border-white/10 overflow-hidden">
            <button onClick={() => setTheme('dark')}
                    className={`px-3 h-8 text-[11px] font-semibold flex items-center gap-1 ${theme === 'dark' ? 'bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))]' : 'text-meta'}`}>
              <Moon size={10} /> Dark
            </button>
            <button onClick={() => setTheme('light')}
                    className={`px-3 h-8 text-[11px] font-semibold flex items-center gap-1 ${theme === 'light' ? 'bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))]' : 'text-meta'}`}>
              <Sun size={10} /> Light
            </button>
          </div>
        </div>
      </Card>

      {/* Shortcuts */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Keyboard size={13} className="text-[rgb(var(--c-primary-2))]" />
          <span className="text-[12px] font-bold text-heading uppercase tracking-[0.18em]">Keyboard shortcuts</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {SHORTCUTS.map(([k, desc]) => (
            <div key={k} className="flex items-center gap-2 text-[11px]">
              <kbd>{k}</kbd>
              <span className="text-meta">{desc}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
