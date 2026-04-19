import { useEffect, useState } from 'react'
import { Sparkles, Bot, Cpu, Brain, Loader2, Check, KeyRound } from 'lucide-react'
import clsx from 'clsx'
import { kcGet, kcSet, KC_NS } from '@/lib/keychain'
import { isDesktop } from '@/lib/ipc'
import { Card, Button, Chip } from '@/components/ui'

interface Provider {
  id:    string
  name:  string
  type:  'claude' | 'openai' | 'gemini' | 'ollama' | 'xai' | 'mistral'
  icon:  typeof Sparkles
  hint:  string
  blurb: string
}

const PROVIDERS: Provider[] = [
  { id: 'claude',  name: 'Claude (Anthropic)', type: 'claude',  icon: Sparkles, hint: 'sk-ant-…',                       blurb: 'Best for code, ops, long tool loops, MCP.' },
  { id: 'openai',  name: 'OpenAI / GPT',       type: 'openai',  icon: Bot,      hint: 'sk-…',                            blurb: 'General-purpose, structured output.' },
  { id: 'gemini',  name: 'Gemini (Google)',    type: 'gemini',  icon: Brain,    hint: 'AI Studio key',                   blurb: 'Long context, deep research, multimodal.' },
  { id: 'ollama',  name: 'Ollama (local)',     type: 'ollama',  icon: Cpu,      hint: 'http://localhost:11434',          blurb: 'Run models on your machine; no cloud.' },
  { id: 'xai',     name: 'xAI / Grok',         type: 'xai',     icon: Sparkles, hint: 'xai-…',                           blurb: 'Top SWE-bench coding throughput.' },
  { id: 'mistral', name: 'Mistral',            type: 'mistral', icon: Bot,      hint: 'mistral-…',                       blurb: 'Cost-efficient European alternative.' },
]

export function ProvidersTab() {
  return (
    <div className="max-w-3xl">
      <h2 className="text-[18px] font-bold text-heading mb-1">Providers</h2>
      <p className="text-[12px] text-meta mb-5">
        One row per AI provider. Secrets go straight to the OS keychain — never disk, never logs.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map(p => <Row key={p.id} provider={p} />)}
      </div>
    </div>
  )
}

function Row({ provider }: { provider: Provider }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const Icon = provider.icon

  useEffect(() => {
    if (!isDesktop()) { setHasKey(false); return }
    kcGet(KC_NS.providers, provider.id).then(v => setHasKey(!!v && v.length > 0)).catch(() => setHasKey(false))
  }, [provider.id])

  async function save() {
    if (!value) return
    setSaving(true)
    try { await kcSet(KC_NS.providers, provider.id, value); setHasKey(true); setEditing(false); setValue('') }
    finally { setSaving(false) }
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))] flex items-center justify-center flex-shrink-0">
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-heading">{provider.name}</span>
            {hasKey && <Chip tone="success" icon={<Check size={9} />}>connected</Chip>}
          </div>
          <div className="text-[11px] text-meta mt-0.5 leading-relaxed">{provider.blurb}</div>
          <div className="text-[10px] text-meta font-mono mt-1">{provider.hint}</div>
        </div>
        <Button size="sm" variant={hasKey ? 'soft' : 'primary'} onClick={() => setEditing(v => !v)}>
          {hasKey ? 'Update' : 'Sign in'}
        </Button>
      </div>
      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <KeyRound size={12} className="text-meta flex-shrink-0" />
          <input type="password" value={value} onChange={e => setValue(e.target.value)}
                 placeholder={`${provider.name} API key`}
                 className="flex-1 h-8 px-2 rounded-md border border-white/10 bg-white/5 text-[12px] font-mono text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
          <Button size="sm" variant="primary" onClick={save} disabled={!value || saving}>
            {saving ? <Loader2 size={11} className="animate-spin" /> : 'Save'}
          </Button>
        </div>
      )}
    </Card>
  )
}
