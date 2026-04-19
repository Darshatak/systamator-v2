import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command, Inbox, Activity, Sparkles, Server, ArrowRight, Send, Zap, Brain, Users } from 'lucide-react'
import { Card, Chip } from '@/components/ui'

export default function HomeScreen({ onPalette }: { onPalette: () => void }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')

  function submit() {
    const g = draft.trim()
    if (!g) return
    navigate('/goals?new=1&prefill=' + encodeURIComponent(g))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-12 space-y-10">

        {/* Hero */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[rgb(var(--c-primary-2))]">M0 · Foundation</span>
            <Chip tone="success" icon={<span className="w-1.5 h-1.5 rounded-full bg-current" />}>online</Chip>
          </div>
          <h1 className="text-[40px] font-bold text-heading leading-tight tracking-tight">
            Your <span className="gradient-text">control room</span>.
          </h1>
          <p className="text-[15px] text-meta mt-3 max-w-xl leading-relaxed">
            Hand the team a goal — Conductor decomposes, your agents execute, Critic checks, Skills accumulate.
            Six screens. One palette. Zero chat-app cosplay.
          </p>

          {/* Goal composer */}
          <Card className="mt-7 p-2 ring-glow">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
                rows={2}
                placeholder="What should the team do?  e.g.  Find the 10 largest files on Mac mini, archive ones older than a year to NAS, send me the plan first."
                className="flex-1 bg-transparent text-[14px] text-heading placeholder:text-meta outline-none resize-none px-3 py-2.5 leading-relaxed"
              />
              <button onClick={submit} disabled={!draft.trim()}
                className="h-10 px-4 rounded-xl gradient-primary text-white text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 shadow-lg">
                <Send size={12} /> Run
              </button>
            </div>
            <div className="flex items-center justify-between px-2 pt-2 border-t border-white/8 mt-1">
              <div className="flex items-center gap-2">
                <button onClick={onPalette} className="text-[11px] text-meta hover:text-heading inline-flex items-center gap-1.5">
                  <Command size={11} /> Palette · <kbd>⌘K</kbd>
                </button>
              </div>
              <span className="text-[11px] text-meta">Conductor will plan, then route to specialists</span>
            </div>
          </Card>
        </section>

        {/* Quick stats */}
        <section className="grid grid-cols-4 gap-4">
          <StatCard icon={Activity} label="Active runs"     value="0" hint="Pause / resume from Goals" tone="primary" onClick={() => navigate('/goals')} />
          <StatCard icon={Inbox}    label="Inbox"           value="0" hint="Approvals · escalations"   tone="warn" />
          <StatCard icon={Sparkles} label="Skills learned"  value="0" hint="Auto-distilled per run"   tone="success" onClick={() => navigate('/skills')} />
          <StatCard icon={Server}   label="Fleet resources" value="0" hint="SSH · Docker · DB · Repos" tone="info" onClick={() => navigate('/fleet')} />
        </section>

        {/* Team + recent */}
        <section className="grid grid-cols-2 gap-4">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-[rgb(var(--c-primary-2))]" />
              <h3 className="text-[13px] font-bold text-heading uppercase tracking-wider">Your team</h3>
              <button onClick={() => navigate('/agents')} className="ml-auto text-[11px] text-meta hover:text-heading inline-flex items-center gap-1">
                Open <ArrowRight size={11} />
              </button>
            </div>
            <ul className="space-y-2">
              {[
                { id: 'lead-conductor', name: 'Conductor',  role: 'Team Lead',     model: 'claude/sonnet' },
                { id: 'mgr-ops',        name: 'Ironsmith',  role: 'Ops Manager',   model: 'claude/sonnet' },
                { id: 'ic-ssh',         name: 'IC-SSH',     role: 'Specialist',    model: 'claude/haiku'  },
              ].map(a => (
                <li key={a.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-[rgb(var(--c-primary)/0.16)] text-[rgb(var(--c-primary-2))] flex items-center justify-center text-[11px] font-bold">
                    {a.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-heading">{a.name}</div>
                    <div className="text-[10px] text-meta">{a.role} · {a.model}</div>
                  </div>
                  <Chip tone="default">idle</Chip>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-[rgb(var(--c-primary-2))]" />
              <h3 className="text-[13px] font-bold text-heading uppercase tracking-wider">How it flows</h3>
            </div>
            <ol className="space-y-2.5 text-[12px] text-body">
              {[
                ['1', 'You give a goal',           'One sentence is enough. Conductor reads.'],
                ['2', 'Conductor decomposes',      'Subtasks tagged by specialty.'],
                ['3', 'Managers bid',              'Whoever fits the skill best wins.'],
                ['4', 'PAUN steps execute',       'Plan → Analyse → Apply → Unify → Next.'],
                ['5', 'Critic verifies',           'Pass/fail · retry hints · Inbox if stuck.'],
                ['6', 'Skill is distilled',        'Next similar goal runs faster.'],
              ].map(([n, h, sub]) => (
                <li key={n} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full gradient-primary text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                  <div>
                    <div className="font-semibold text-heading">{h}</div>
                    <div className="text-[11px] text-meta">{sub}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </section>

      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, hint, tone = 'primary', onClick }: {
  icon: typeof Activity; label: string; value: string; hint: string;
  tone?: 'primary' | 'success' | 'warn' | 'info'; onClick?: () => void
}) {
  const toneCls = {
    primary: 'text-[rgb(var(--c-primary-2))] bg-[rgb(var(--c-primary)/0.14)]',
    success: 'text-[rgb(var(--c-success))]   bg-[rgb(var(--c-success)/0.14)]',
    warn:    'text-[rgb(var(--c-warn))]      bg-[rgb(var(--c-warn)/0.14)]',
    info:    'text-[rgb(var(--c-info))]      bg-[rgb(var(--c-info)/0.14)]',
  }[tone]
  return (
    <Card onClick={onClick}>
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${toneCls}`}>
          <Icon size={15} />
        </div>
        <span className="text-[28px] font-bold text-heading leading-none tabular-nums">{value}</span>
      </div>
      <div className="text-[12px] font-semibold text-heading">{label}</div>
      <div className="text-[10px] text-meta mt-0.5">{hint}</div>
    </Card>
  )
}
