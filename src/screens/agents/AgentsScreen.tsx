import { useEffect, useState } from 'react'
import { Users, Loader2, Crown, Briefcase, User } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import type { AgentProfile } from '@/types/domain'
import clsx from 'clsx'
import { Card, Chip, Empty, TopBar } from '@/components/ui'

export default function AgentsScreen() {
  const [agents, setAgents] = useState<AgentProfile[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => { invoke<AgentProfile[]>('agent_list', {}).then(setAgents).catch(() => setAgents([])) }, [])
  const sel = agents?.find(a => a.id === selected) ?? null

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title="Agents"
        subtitle="Team Lead → Managers → ICs. Performance-ranked delegation. Promote / retire / hire via retros (M3)."
      />

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[320px] flex-shrink-0 border-r border-white/8 flex flex-col">
          <div className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-meta">Org tree</div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {agents === null && <div className="text-meta text-[12px] flex items-center gap-2 px-2 py-3"><Loader2 size={12} className="animate-spin" /> loading…</div>}
            {agents && agents.length === 0 && <EmptyOrg />}
            {agents && agents.length > 0 && <Tree agents={agents} selected={selected} onSelect={setSelected} />}
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto px-7 py-6">
          {sel ? <AgentDetail agent={sel} /> : <Hint />}
        </main>
      </div>
    </div>
  )
}

function EmptyOrg() {
  return (
    <div className="px-3 py-4">
      <Empty
        icon={<Users size={18} />}
        title="No agents seeded"
        hint="Connect Postgres + run migrations. Default roster (Conductor → 8 Managers → ICs) seeds in M1."
      />
    </div>
  )
}

function Tree({ agents, selected, onSelect }: { agents: AgentProfile[]; selected: string | null; onSelect: (id: string) => void }) {
  const lead = agents.find(a => a.tier === 'lead')
  const mgrs = agents.filter(a => a.tier === 'manager')
  const ics  = agents.filter(a => a.tier === 'ic')

  return (
    <div className="space-y-0.5">
      {lead && <Row a={lead} icon={Crown}     indent={0} active={selected === lead.id} onSelect={() => onSelect(lead.id)} />}
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
  const pct = Math.round(score * 100)
  return (
    <button onClick={onSelect}
            style={{ paddingLeft: 8 + indent * 14 }}
            className={clsx('w-full flex items-center gap-2 pr-2 py-1.5 rounded-lg text-left text-[12px] transition-colors',
              active ? 'bg-[rgb(var(--c-primary)/0.16)] text-[rgb(var(--c-primary-2))]' : 'text-body hover:bg-white/5')}>
      <Icon size={11} className="flex-shrink-0" />
      <span className="flex-1 truncate font-mono text-[11px]">{a.id}</span>
      <span className="w-12 text-right text-[9px] text-meta tabular-nums">{pct}%</span>
      <div className="w-10 h-1 rounded-full bg-white/8 overflow-hidden">
        <div className="h-full gradient-primary" style={{ width: `${pct}%` }} />
      </div>
    </button>
  )
}

function AgentDetail({ agent }: { agent: AgentProfile }) {
  const s = agent.stats
  return (
    <div className="max-w-3xl">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-14 h-14 rounded-2xl gradient-primary text-white flex items-center justify-center text-[18px] font-bold shadow-lg">
          {agent.id.slice(-2).toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Chip tone="primary">{agent.tier}</Chip>
            <Chip>{agent.speciality}</Chip>
            {agent.active ? <Chip tone="success">active</Chip> : <Chip tone="danger">retired</Chip>}
          </div>
          <h1 className="text-[24px] font-bold text-heading mt-2">{agent.id}</h1>
          {agent.parentId && <div className="text-[11px] text-meta">reports to <span className="font-mono">{agent.parentId}</span></div>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <Stat label="Expertise"       value={s.expertiseScore.toFixed(2)} />
        <Stat label="Runs"            value={String(s.runs)} />
        <Stat label="Win / loss"      value={`${s.wins} / ${s.losses}`} />
        <Stat label="Tokens spent"    value={String(s.tokensSpent)} />
      </div>

      <Card className="mb-4">
        <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-2">System prompt</div>
        <pre className="text-[12px] text-body whitespace-pre-wrap font-mono leading-relaxed">{agent.manifest.system}</pre>
      </Card>

      <Card>
        <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-2">Provider chain</div>
        <ol className="space-y-2">
          {agent.manifest.providerChain.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-[12px]">
              <span className="w-5 h-5 rounded-full bg-white/8 text-meta text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
              <span className="font-mono">{c.providerType}/{c.model}</span>
              <span className="text-meta">— {c.why}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="sm">
      <div className="text-[9px] font-bold text-meta uppercase tracking-[0.18em]">{label}</div>
      <div className="text-[20px] font-bold text-heading mt-1 tabular-nums">{value}</div>
    </Card>
  )
}

function Hint() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 rounded-2xl gradient-primary mx-auto flex items-center justify-center text-white shadow-xl mb-4">
          <Users size={20} />
        </div>
        <div className="text-[15px] font-semibold text-heading">Pick an agent</div>
        <div className="text-[12px] text-meta mt-1">Tap any node on the left to see its prompt, provider chain, and live stats.</div>
      </div>
    </div>
  )
}
