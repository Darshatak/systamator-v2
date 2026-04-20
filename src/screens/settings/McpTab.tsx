// MCP servers settings tab.
//
// Two parts:
//  1. Featured catalog — one-click install for the projects we trust enough
//     to ship as defaults: OpenSpace (M2 skills), Playwright (M3 browser),
//     Obsidian (M3 notes), Graphify (M3 code/doc graph), plus the official
//     servers (GitHub / Postgres / Filesystem / Fetch / Memory).
//  2. Registered list — every MCP server the user has saved, with trust
//     toggle and tool count.

import { useEffect, useState } from 'react'
import { Plug, Loader2, Check, Power, PowerOff, Trash2, Plus, Sparkles, Globe, Brain, GitBranch, Hash, FolderOpen, Database } from 'lucide-react'
import clsx from 'clsx'
import { invoke } from '@/lib/ipc'
import { toast } from '@/lib/toast'
import { Card, Chip, Button } from '@/components/ui'

interface McpServerSpec { name: string; command: string; args: string[]; env?: Record<string, string>; description: string; trusted: boolean }
interface McpServerStatus { name: string; command: string; running: boolean; trusted: boolean }
interface ConnectorSuggestion { spec: McpServerSpec; confidence: number; rationale: string; needsReview: boolean }

interface Featured {
  id:    string
  utter: string                // /connect <utter>
  title: string
  blurb: string
  icon:  typeof Sparkles
  badge: string                // milestone tag
}

const FEATURED: Featured[] = [
  { id: 'openspace',  utter: 'openspace',  title: 'OpenSpace',  badge: 'M2 · skills',   icon: Sparkles,    blurb: 'Self-evolving skill engine. 46% token reduction.' },
  { id: 'playwright', utter: 'playwright', title: 'Playwright', badge: 'M3 · browser',  icon: Globe,       blurb: 'Browser automation — click, type, screenshot, extract.' },
  { id: 'obsidian',   utter: 'obsidian',   title: 'Obsidian',   badge: 'M3 · notes',    icon: Brain,       blurb: 'Read & write your Obsidian vault as agent memory.' },
  { id: 'github',     utter: 'github',     title: 'GitHub',     badge: 'official',      icon: GitBranch,   blurb: 'Repos, issues, PRs, actions.' },
  { id: 'postgres',   utter: 'postgres',   title: 'Postgres',   badge: 'official',      icon: Database,    blurb: 'Read-only Postgres introspection + queries.' },
  { id: 'filesystem', utter: 'filesystem', title: 'Filesystem', badge: 'official',      icon: FolderOpen,  blurb: 'Local filesystem read/write.' },
  { id: 'fetch',      utter: 'fetch',      title: 'Fetch',      badge: 'official',      icon: Globe,       blurb: 'Generic HTTP fetch.' },
  { id: 'memory',     utter: 'memory',     title: 'Memory',     badge: 'official',      icon: Hash,        blurb: 'Persistent k/v scratchpad for the agent.' },
]

export function McpTab() {
  const [statuses, setStatuses] = useState<McpServerStatus[] | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)

  async function refresh() {
    try { setStatuses(await invoke<McpServerStatus[]>('mcp_server_status', {})) }
    catch { setStatuses([]) }
  }
  useEffect(() => { void refresh() }, [])

  async function quickInstall(f: Featured) {
    setInstalling(f.id)
    try {
      const sug = await invoke<ConnectorSuggestion | null>('connector_resolve', { utterance: f.utter })
      if (!sug) throw new Error(`couldn't resolve "${f.utter}"`)
      await invoke('mcp_save_server', { spec: sug.spec })
      await invoke('mcp_set_trusted', { name: sug.spec.name, trusted: true })
      try { await invoke('mcp_start', { name: sug.spec.name }) } catch { /* no-op */ }
      await refresh()
    } catch (e) {
      toast.error('Install failed', String((e as Error)?.message ?? e))
    } finally {
      setInstalling(null)
    }
  }

  async function toggleTrust(name: string, trusted: boolean) {
    await invoke('mcp_set_trusted', { name, trusted: !trusted }); await refresh()
  }
  async function start(name: string) { await invoke('mcp_start', { name }); await refresh() }
  async function stop(name: string)  { await invoke('mcp_stop',  { name }); await refresh() }
  async function remove(name: string){
    if (!confirm(`Remove MCP "${name}"?`)) return
    await invoke('mcp_remove_server', { name }); await refresh()
  }

  const installedNames = new Set(statuses?.map(s => s.name) ?? [])

  return (
    <div className="max-w-3xl">
      {/* Featured */}
      <h2 className="text-[18px] font-bold text-heading mb-1">Featured MCP servers</h2>
      <p className="text-[12px] text-meta mb-4">
        One-click install for the agents we trust enough to ship as defaults. Each gets saved + trusted + started; you can revoke anytime below.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-8">
        {FEATURED.map(f => {
          const installed = installedNames.has(f.id)
          const Icon = f.icon
          return (
            <Card key={f.id}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))] flex items-center justify-center flex-shrink-0">
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-heading">{f.title}</span>
                    <Chip>{f.badge}</Chip>
                    {installed && <Chip tone="success" icon={<Check size={9} />}>installed</Chip>}
                  </div>
                  <div className="text-[11px] text-meta mt-1 leading-relaxed">{f.blurb}</div>
                </div>
                <Button size="sm" variant={installed ? 'soft' : 'primary'}
                        disabled={installed || installing === f.id}
                        onClick={() => quickInstall(f)}>
                  {installing === f.id ? <Loader2 size={11} className="animate-spin" /> : installed ? 'Installed' : 'Install'}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Registered */}
      <h2 className="text-[15px] font-bold text-heading mb-1">Registered ({statuses?.length ?? 0})</h2>
      <p className="text-[12px] text-meta mb-3">All MCP servers Systamator knows about. Untrusted servers won't spawn.</p>
      {statuses === null && <Loader2 size={12} className="animate-spin text-meta" />}
      {statuses && statuses.length === 0 && (
        <Card>
          <div className="text-center py-4 text-[12px] text-meta">
            <Plug size={18} className="mx-auto mb-2 text-[rgb(var(--c-primary-2))]" />
            None yet — install one above, or run <code className="bg-white/5 rounded px-1 font-mono">/connect &lt;name&gt;</code> in the palette.
          </div>
        </Card>
      )}
      {statuses && statuses.length > 0 && (
        <div className="space-y-2">
          {statuses.map(s => (
            <Card key={s.name}>
              <div className="flex items-center gap-3">
                <span className={clsx('w-2 h-2 rounded-full',
                  s.running && s.trusted ? 'bg-[rgb(var(--c-success))] dot-running' : s.trusted ? 'bg-[rgb(var(--c-warn))]' : 'bg-meta/40')} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-heading">{s.name}</div>
                  <div className="text-[10px] text-meta font-mono truncate">{s.command}</div>
                </div>
                <button onClick={() => toggleTrust(s.name, s.trusted)} title={s.trusted ? 'Trusted' : 'Untrusted'}
                        className={clsx('px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border',
                          s.trusted ? 'bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))] border-[rgb(var(--c-primary)/0.3)]' : 'text-meta border-white/10')}>
                  {s.trusted ? 'trusted' : 'untrusted'}
                </button>
                {s.running
                  ? <button title="Stop" onClick={() => stop(s.name)} className="p-1.5 rounded-md text-meta hover:text-heading hover:bg-white/5"><PowerOff size={12} /></button>
                  : <button title="Start" onClick={() => start(s.name)} disabled={!s.trusted} className="p-1.5 rounded-md text-[rgb(var(--c-success))] hover:bg-white/5 disabled:opacity-40"><Power size={12} /></button>}
                <button title="Remove" onClick={() => remove(s.name)} className="p-1.5 rounded-md text-[rgb(var(--c-danger))] hover:bg-[rgb(var(--c-danger)/0.1)]"><Trash2 size={12} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
