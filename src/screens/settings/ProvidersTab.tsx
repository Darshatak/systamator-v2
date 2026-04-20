// Providers — both API-key signin and CLI signin in one place.

import { useEffect, useState } from 'react'
import { Sparkles, Bot, Cpu, Brain, Loader2, Check, KeyRound, Terminal, ExternalLink, Globe } from 'lucide-react'
import { kcGet, kcSet, KC_NS } from '@/lib/keychain'
import { isDesktop, listen } from '@/lib/ipc'
import { cliDetect, cliLoginOpen, type CliDetectResult, type CliInfo } from '@/lib/api'
import { Card, Button, Chip } from '@/components/ui'

interface Provider {
  id:    string
  name:  string
  type:  'claude' | 'openai' | 'gemini' | 'ollama' | 'xai' | 'mistral'
  cliKey:'claude' | 'codex' | 'gemini' | 'opencode' | null
  icon:  typeof Sparkles
  hint:  string
  blurb: string
}

const PROVIDERS: Provider[] = [
  { id: 'claude',  name: 'Claude (Anthropic)', type: 'claude',  cliKey: 'claude',   icon: Sparkles, hint: 'sk-ant-…',                blurb: 'Best for code, ops, long tool loops, MCP.' },
  { id: 'openai',  name: 'OpenAI / GPT',       type: 'openai',  cliKey: 'codex',    icon: Bot,      hint: 'sk-… or codex CLI',       blurb: 'General-purpose; sign in via OpenAI Codex CLI.' },
  { id: 'gemini',  name: 'Gemini (Google)',    type: 'gemini',  cliKey: 'gemini',   icon: Brain,    hint: 'AI Studio key or CLI',    blurb: 'Long context, deep research, multimodal.' },
  { id: 'ollama',  name: 'Ollama (local)',     type: 'ollama',  cliKey: null,       icon: Cpu,      hint: 'http://localhost:11434',  blurb: 'Run models on your machine; no cloud.' },
  { id: 'xai',     name: 'xAI / Grok',         type: 'xai',     cliKey: null,       icon: Sparkles, hint: 'xai-…',                   blurb: 'Top SWE-bench coding throughput.' },
  { id: 'mistral', name: 'Mistral',            type: 'mistral', cliKey: null,       icon: Bot,      hint: 'mistral-…',               blurb: 'Cost-efficient European alternative.' },
]

export function ProvidersTab() {
  const [cli, setCli] = useState<CliDetectResult | null>(null)
  useEffect(() => { if (isDesktop()) cliDetect().then(setCli).catch(() => setCli(null)) }, [])

  return (
    <div className="max-w-3xl">
      <h2 className="text-[18px] font-bold text-heading mb-1">Providers</h2>
      <p className="text-[12px] text-meta mb-5">
        Two paths per provider: <strong>API key</strong> (stored in OS keychain) or <strong>CLI sign-in</strong> (uses the provider's official command-line OAuth).
      </p>
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map(p => <Row key={p.id} provider={p} cli={cli} />)}
      </div>
    </div>
  )
}

function Row({ provider, cli }: { provider: Provider; cli: CliDetectResult | null }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [openingCli, setOpeningCli] = useState(false)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [authLine, setAuthLine] = useState<string | null>(null)
  const Icon = provider.icon
  const cliInfo: CliInfo | null = provider.cliKey && cli ? cli[provider.cliKey] : null

  // Listen for CLI login output so we can surface the auth URL in case
  // the CLI's own browser-launch fails (common in sandboxed dev builds).
  useEffect(() => {
    if (!provider.cliKey || !isDesktop()) return
    let off1 = () => {}, off2 = () => {}
    listen<{ provider: string; line: string; url: string | null }>('cli:login-line', p => {
      if (p.provider !== provider.cliKey) return
      if (p.url) setAuthUrl(p.url)
      setAuthLine(p.line)
    }).then(u => off1 = u)
    listen<{ provider: string; exitCode: number }>('cli:login-done', p => {
      if (p.provider !== provider.cliKey) return
      setOpeningCli(false)
      setAuthLine(p.exitCode === 0 ? 'Signed in.' : `Exited (${p.exitCode})`)
      if (p.exitCode === 0) setAuthUrl(null)
    }).then(u => off2 = u)
    return () => { off1(); off2() }
  }, [provider.cliKey])

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

  async function openCliLogin() {
    if (!provider.cliKey) return
    setOpeningCli(true); setAuthUrl(null); setAuthLine('Launching…')
    try { await cliLoginOpen(provider.cliKey) }
    catch (e) { setAuthLine(String((e as Error)?.message ?? e)); setOpeningCli(false) }
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))] flex items-center justify-center flex-shrink-0">
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-heading">{provider.name}</span>
            {hasKey && <Chip tone="success" icon={<Check size={9} />}>API key</Chip>}
            {cliInfo?.installed && <Chip tone="info" icon={<Terminal size={9} />}>{`CLI ${cliInfo.version ?? 'detected'}`}</Chip>}
          </div>
          <div className="text-[11px] text-meta mt-0.5 leading-relaxed">{provider.blurb}</div>
          <div className="text-[10px] text-meta font-mono mt-1">{provider.hint}</div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Button size="sm" variant={hasKey ? 'soft' : 'primary'} onClick={() => setEditing(v => !v)}>
            {hasKey ? 'Update' : 'Sign in'}
          </Button>
          {provider.cliKey && (
            <Button size="sm" variant="ghost" onClick={openCliLogin} disabled={openingCli}
                    icon={openingCli ? <Loader2 size={11} className="animate-spin" /> : <Terminal size={11} />}>
              {cliInfo?.installed ? 'CLI login' : 'Install CLI'}
            </Button>
          )}
        </div>
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

      {provider.cliKey && cliInfo && !cliInfo.installed && (
        <div className="mt-3 text-[11px] text-meta border-t border-white/8 pt-3 flex items-start gap-2">
          <ExternalLink size={11} className="mt-0.5 flex-shrink-0" />
          <span>{cliInfo.loginHint ?? `Install the ${provider.cliKey} CLI to enable OAuth sign-in.`}</span>
        </div>
      )}

      {(authLine || authUrl) && (
        <div className="mt-3 border-t border-white/8 pt-3">
          <div className="flex items-center gap-2 text-[11px]">
            <Globe size={11} className="text-[rgb(var(--c-primary-2))]" />
            <span className="text-meta font-mono truncate flex-1">{authLine}</span>
          </div>
          {authUrl && (
            <a href={authUrl} target="_blank" rel="noreferrer"
               className="mt-2 flex items-center gap-2 text-[10px] text-[rgb(var(--c-primary-2))] hover:underline font-mono break-all">
              <ExternalLink size={10} /> {authUrl}
            </a>
          )}
        </div>
      )}
    </Card>
  )
}
