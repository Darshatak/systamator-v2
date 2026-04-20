// Custom agent builder — edit any .agent.json as JSON, save to DB.

import { useEffect, useState } from 'react'
import { Loader2, Save, Plus, Users } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { Card, Button, Chip } from '@/components/ui'
import type { AgentProfile } from '@/types/domain'

const EMPTY_IC = {
  id: 'ic-custom',
  tier: 'ic' as const,
  speciality: 'describe what this IC is best at',
  parentId: 'mgr-ops',
  manifest: {
    id: 'ic-custom',
    tier: 'ic',
    speciality: 'describe what this IC is best at',
    parentId: 'mgr-ops',
    system: 'System prompt goes here.',
    providerChain: [{ providerType: 'claude', model: 'claude-haiku-4-5-20251001', why: 'default' }],
    tools: [],
  },
  stats: {
    runs: 0, wins: 0, losses: 0, tokensSpent: 0, dollarsSpent: 0,
    avgWallMs: 0, expertiseScore: 0.5, lastActive: null,
  },
  active: true,
}

export function AgentsTab() {
  const [agents, setAgents] = useState<AgentProfile[] | null>(null)
  const [selected, setSelected] = useState<AgentProfile | null>(null)
  const [raw, setRaw] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function refresh() {
    try { setAgents(await invoke<AgentProfile[]>('agent_list', {})) }
    catch { setAgents([]) }
  }
  useEffect(() => { refresh() }, [])

  function selectAgent(a: AgentProfile) {
    setSelected(a); setRaw(JSON.stringify(a, null, 2)); setError(null); setOk(null)
  }
  function newAgent() {
    const blank = structuredClone(EMPTY_IC) as unknown as AgentProfile
    setSelected(blank); setRaw(JSON.stringify(blank, null, 2)); setError(null); setOk(null)
  }

  async function save() {
    setError(null); setOk(null); setSaving(true)
    try {
      const parsed = JSON.parse(raw) as AgentProfile
      if (!parsed.id || !parsed.tier || !parsed.speciality) throw new Error('id, tier, speciality required')
      await invoke('agent_save', { agent: parsed })
      setOk(`Saved ${parsed.id}`); await refresh()
    } catch (e) { setError(String((e as Error)?.message ?? e)) }
    finally { setSaving(false) }
  }

  return (
    <div className="max-w-5xl">
      <h2 className="text-[18px] font-bold text-heading mb-1">Agents</h2>
      <p className="text-[12px] text-meta mb-4">
        Fork an existing agent or author one from scratch. Manifest JSON is the source of truth — stats update automatically as runs complete.
      </p>

      <div className="grid grid-cols-[240px_1fr] gap-4">
        {/* Left: agent list */}
        <div className="space-y-1">
          <Button size="sm" variant="soft" icon={<Plus size={11} />} onClick={newAgent} className="w-full">New IC</Button>
          <div className="mt-2 space-y-0.5">
            {agents === null && <Loader2 size={12} className="animate-spin text-meta" />}
            {agents && agents.length === 0 && <div className="text-[11px] text-meta px-1">No agents yet. Migrations seed the defaults on boot.</div>}
            {agents?.map(a => (
              <button key={a.id} onClick={() => selectAgent(a)}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] font-mono ${selected?.id === a.id ? 'bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))]' : 'text-body hover:bg-white/5'}`}>
                <span className="flex items-center gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-meta">{a.tier}</span>
                  <span>{a.id}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: editor */}
        <Card>
          {!selected ? (
            <div className="text-center py-8">
              <Users size={24} className="text-[rgb(var(--c-primary-2))] mx-auto mb-2" />
              <div className="text-[12px] text-meta">Pick an agent on the left — or create a new IC.</div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Chip tone="primary">{selected.tier}</Chip>
                <span className="text-[12px] font-mono text-heading">{selected.id}</span>
                <span className="text-[11px] text-meta">— {selected.speciality}</span>
                <Button size="sm" variant="primary" onClick={save} disabled={saving} className="ml-auto"
                        icon={saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}>Save</Button>
              </div>
              <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={22} spellCheck={false}
                        className="w-full bg-white/[0.02] border border-white/10 rounded-md px-2 py-2 text-[11px] font-mono text-body outline-none focus:border-[rgb(var(--c-primary)/0.6)] leading-relaxed" />
              {error && <div className="mt-2 text-[11px] text-[rgb(var(--c-danger))]">{error}</div>}
              {ok    && <div className="mt-2 text-[11px] text-[rgb(var(--c-success))]">{ok}</div>}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
