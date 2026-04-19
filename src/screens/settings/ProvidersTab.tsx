// Unified /login. One row per provider, one button. Secrets go straight
// into the OS keychain (see KC_NS.providers).

import { useEffect, useState } from 'react'
import { Sparkles, Bot, Cpu, Brain, Loader2, Check, KeyRound } from 'lucide-react'
import clsx from 'clsx'
import { kcGet, kcSet, KC_NS } from '@/lib/keychain'
import { isDesktop } from '@/lib/ipc'

interface Provider {
  id:    string
  name:  string
  type:  'claude' | 'openai' | 'gemini' | 'ollama' | 'xai' | 'mistral'
  icon:  typeof Sparkles
  hint:  string
}

const PROVIDERS: Provider[] = [
  { id: 'claude',  name: 'Claude (Anthropic)', type: 'claude',  icon: Sparkles, hint: 'API key (sk-ant-…) — OAuth flow lands in M1' },
  { id: 'openai',  name: 'OpenAI / GPT',       type: 'openai',  icon: Bot,      hint: 'API key (sk-…)' },
  { id: 'gemini',  name: 'Gemini (Google)',    type: 'gemini',  icon: Brain,    hint: 'API key — Studio key works' },
  { id: 'ollama',  name: 'Ollama (local)',     type: 'ollama',  icon: Cpu,      hint: 'No key — base URL only (default localhost:11434)' },
  { id: 'xai',     name: 'xAI / Grok',         type: 'xai',     icon: Sparkles, hint: 'API key' },
  { id: 'mistral', name: 'Mistral',            type: 'mistral', icon: Bot,      hint: 'API key' },
]

export function ProvidersTab() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-[15px] font-semibold text-heading mb-1">Providers</h2>
      <p className="text-[12px] text-meta mb-4">
        One row per AI provider. Secrets go to the OS keychain — never disk, never logs.
      </p>
      <div className="space-y-2">
        {PROVIDERS.map(p => <Row key={p.id} provider={p} />)}
      </div>
    </div>
  )
}

function Row({ provider }: { provider: Provider }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState('')
  const [hasKey, setHasKey]   = useState<boolean | null>(null)
  const [saving, setSaving]   = useState(false)

  const Icon = provider.icon

  useEffect(() => {
    if (!isDesktop()) { setHasKey(false); return }
    kcGet(KC_NS.providers, provider.id).then(v => setHasKey(!!v && v.length > 0)).catch(() => setHasKey(false))
  }, [provider.id])

  async function save() {
    if (!value) return
    setSaving(true)
    try {
      await kcSet(KC_NS.providers, provider.id, value)
      setHasKey(true); setEditing(false); setValue('')
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Icon size={14} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-heading">{provider.name}</span>
            {hasKey && <Check size={12} className="text-success" />}
          </div>
          <div className="text-[11px] text-meta truncate">{provider.hint}</div>
        </div>
        <button onClick={() => setEditing(v => !v)}
                className={clsx('px-2.5 py-1 rounded-md text-[11px] font-semibold',
                  hasKey ? 'border border-white/10 text-body hover:bg-white/5' : 'bg-primary text-white')}>
          {hasKey ? 'Update' : 'Sign in'}
        </button>
      </div>

      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <KeyRound size={12} className="text-meta" />
          <input type="password"
                 value={value}
                 onChange={e => setValue(e.target.value)}
                 placeholder={`${provider.name} API key`}
                 className="flex-1 px-2 py-1.5 rounded border border-white/10 bg-transparent text-[12px] font-mono outline-none focus:border-primary" />
          <button onClick={save} disabled={!value || saving}
                  className="px-3 py-1.5 rounded-md bg-primary text-white text-[11px] font-semibold disabled:opacity-50">
            {saving ? <Loader2 size={11} className="animate-spin" /> : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
