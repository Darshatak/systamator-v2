import { useEffect, useState } from 'react'
import { Users, Loader2, Crown, Briefcase, User } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import type { AgentProfile } from '@/types/domain'
import clsx from 'clsx'

export default function AgentsScreen() {
  const [agents, setAgents] = useState<AgentProfile[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    invoke<AgentProfile[]>('agent_list', {}).then(setAgents).catch(() => setAgents([]))
  }, [])

  const sel = agents?.find(a => a.id === selected) ?? null

  return (
    <div className="h-full flex">
      <aside className="w-[320px] flex-shrink-0 border-r border-white/8 flex flex-col">
        <div className="px-4 py-3 border-b border-white/8 text-[12px] font-bold text-heading uppercase tracking-wider">Org</div>
        <div className="flex-1 overflow-y-auto p-2">
          {agents === null && <div className="text-meta text-[12px] flex items-center gap-2 p-2"><Loader2 size={12} className="animate-spin" /> loading…</div>}
          {agents && agents.length === 0 && <EmptyOrg />}
          {agents && agents.length > 0 && <Tree agents={agents} selected={selected} onSelect={setSelected} />}
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">
        {sel ? <AgentDetail agent={sel} /> : <Hint />}
      </main>
    </div>
  )
}

function EmptyOrg() {
  return (
    <div className="text-center px-4 py-10">
      <Users size={28} className="text-primary mx-auto mb-2" />
      <p className="text-[12px] text-meta mb-2">Default roster lands in M1.</p>
      <p className="text-[11px] text-meta">Connect Postgres + run migrations to see seeded agents.</p>
    </div>
  )
}

function Tree({ agents, selected, onSelect }: { agents: AgentProfile[]; selected: string | null; onSelect: (id: string) => void }) {
  const lead    = agents.find(a => a.tier === 'lead')
  const mgrs    = agents.filter(a => a.tier === 'manager')
  const ics     = agents.filter(a => a.tier === 'ic')

  return (
    <div className="space-y-1">
      {lead && <Row a={lead} icon={Crown} indent={0} active={selected === lead.id} onSelect={() => onSelect(lead.id)} />}
      {mgrs.map(m => (
        <div key={m.id}>
          <Row a={m} icon={Briefcase} indent={1} active={selected === m.id} onSelect={() => onSelect(m.id)} />
          {ics.filter(i => i.parentId === m.id).map(ic => (
            <Row key={ic.id} a={ic} icon={User} indent={2} active={selected === ic.id} onSelect={() => onSelect(ic.id)} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Row({ a, icon: Icon, indent, active, onSelect }: { a: AgentProfile; icon: typeof Crown; indent: number; active: boolean; onSelect: () => void }) {
  const score = a.stats.expertiseScore
  return (
    <button onClick={onSelect}
            style={{ paddingLeft: 8 + indent * 12 }}
            className={clsx('w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[12px]',
              active ? 'bg-primary/10 text-primary' : 'text-body hover:bg-white/5')}>
      <Icon size={11} className="flex-shrink-0" />
      <span className="flex-1 truncate font-mono">{a.id}</span>
      <span className="text-[9px] text-meta tabular-nums">{score.toFixed(2)}</span>
    </button>
  )
}

function AgentDetail({ agent }: { agent: AgentProfile }) {
  const s = agent.stats
  return (
    <div className="p-6 max-w-2xl">
      <div className="text-[10px] font-bold text-meta uppercase tracking-wider">{agent.tier}</div>
      <h1 className="text-2xl font-bold text-heading">{agent.id}</h1>
      <div className="text-[12px] text-meta mb-4">{agent.speciality}</div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Stat label="Expertise"    value={s.expertiseScore.toFixed(2)} />
        <Stat label="Runs"         value={String(s.runs)} />
        <Stat label="Wins / Losses" value={`${s.wins} / ${s.losses}`} />
        <Stat label="Tokens"       value={String(s.tokensSpent)} />
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-4">
        <div className="text-[10px] font-bold text-meta uppercase tracking-wider mb-2">System prompt</div>
        <pre className="text-[12px] text-body whitespace-pre-wrap font-mono">{agent.manifest.system}</pre>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-3">
      <div className="text-[9px] font-bold text-meta uppercase tracking-wider">{label}</div>
      <div className="text-[16px] font-bold text-heading mt-1">{value}</div>
    </div>
  )
}

function Hint() {
  return (
    <div className="h-full flex items-center justify-center text-[12px] text-meta">Pick an agent on the left.</div>
  )
}
