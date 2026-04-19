// Live run view — fetches the run + steps, polls the orchestrator's
// run_tick to advance, renders the step graph as it executes.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { runGet, runTick } from '@/lib/api'
import type { Step } from '@/types/domain'
import { Card, Chip, TopBar, StatusDot } from '@/components/ui'
import { ChevronLeft, Clock, Bot, Wrench, Brain, GitFork, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import clsx from 'clsx'

const TICK_MS = 750

export default function RunDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [autorun, setAutorun] = useState(true)
  const tickRef = useRef<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['run', id],
    queryFn: () => runGet(id!),
    refetchInterval: autorun ? TICK_MS : false,
    enabled: !!id,
  })

  // Pump ticks while autorun is on and the run isn't done.
  useEffect(() => {
    if (!id || !autorun) return
    let cancelled = false
    async function loop() {
      while (!cancelled) {
        try {
          const r = await runTick(id!)
          qc.invalidateQueries({ queryKey: ['run', id] })
          if (r.runDone) { setAutorun(false); break }
          if (r.status === 'idle') break
        } catch { break }
        await new Promise(r => (tickRef.current = window.setTimeout(r, 350)))
      }
    }
    void loop()
    return () => { cancelled = true; if (tickRef.current) window.clearTimeout(tickRef.current) }
  }, [id, autorun, qc])

  if (isLoading || !data) {
    return (
      <div className="h-full flex flex-col">
        <TopBar title="Run" subtitle="Loading…" />
      </div>
    )
  }

  const [run, steps] = data
  const total = steps.length
  const done  = steps.filter(s => s.status === 'done').length
  const fail  = steps.filter(s => s.status === 'failed').length

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title={run.goal}
        subtitle={`Run ${run.id.slice(0, 8)} · ${run.taskType ?? 'goal'} · conductor: ${run.conductorId ?? '—'}`}
        actions={<>
          <Link to="/goals" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-meta hover:text-heading hover:bg-white/5 text-[12px]">
            <ChevronLeft size={12} /> Back
          </Link>
          <RunBadge status={run.status} />
        </>}
      />

      <div className="flex-1 overflow-y-auto px-7 py-6">
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card padding="sm"><div className="text-[9px] font-bold text-meta uppercase tracking-[0.18em]">Total steps</div><div className="text-[24px] font-bold text-heading mt-0.5 tabular-nums">{total}</div></Card>
          <Card padding="sm"><div className="text-[9px] font-bold text-meta uppercase tracking-[0.18em]">Completed</div><div className="text-[24px] font-bold text-heading mt-0.5 tabular-nums">{done}</div></Card>
          <Card padding="sm"><div className="text-[9px] font-bold text-meta uppercase tracking-[0.18em]">Failed</div><div className="text-[24px] font-bold text-heading mt-0.5 tabular-nums">{fail}</div></Card>
        </div>

        <Card>
          <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-3">Step graph</div>
          <ol className="space-y-2">
            {steps.map((s, i) => <StepRow key={s.id} step={s} index={i} />)}
          </ol>
        </Card>
      </div>
    </div>
  )
}

function StepRow({ step, index }: { step: Step; index: number }) {
  const Icon = step.kind === 'tool' ? Wrench : step.kind === 'llm' ? Brain : GitFork
  const status = step.status
  const stateIcon =
    status === 'running' ? <Loader2 size={11} className="animate-spin text-[rgb(var(--c-primary-2))]" /> :
    status === 'done'    ? <CheckCircle2 size={11} className="text-[rgb(var(--c-success))]" /> :
    status === 'failed'  ? <XCircle size={11} className="text-[rgb(var(--c-danger))]" /> :
                            <span className="w-2.5 h-2.5 rounded-full border border-meta/40" />
  const dur = useMemo(() => {
    if (!step.startedAt || !step.finishedAt) return null
    const ms = new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime()
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
  }, [step.startedAt, step.finishedAt])

  return (
    <li className={clsx(
      'flex items-start gap-3 p-3 rounded-xl border',
      status === 'running' ? 'border-[rgb(var(--c-primary)/0.4)] bg-[rgb(var(--c-primary)/0.06)]' : 'border-white/8'
    )}>
      <div className="flex flex-col items-center">
        <span className="w-6 h-6 rounded-md bg-white/5 text-meta text-[10px] font-bold flex items-center justify-center">{index + 1}</span>
        {stateIcon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon size={12} className="text-[rgb(var(--c-primary-2))]" />
          <span className="text-[12px] font-semibold text-heading">{step.label}</span>
          <Chip>{step.kind}</Chip>
          {step.agentId && <Chip tone="primary">{step.agentId}</Chip>}
          {dur && <span className="ml-auto text-[10px] text-meta tabular-nums flex items-center gap-1"><Clock size={9} /> {dur}</span>}
        </div>
        <pre className="mt-2 text-[10px] text-meta font-mono whitespace-pre-wrap leading-relaxed">{JSON.stringify(step.input, null, 2)}</pre>
        {step.output != null && (
          <pre className="mt-2 text-[10px] text-body bg-white/[0.03] rounded-md p-2 font-mono whitespace-pre-wrap leading-relaxed border border-white/5">
            {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
          </pre>
        )}
      </div>
    </li>
  )
}

function RunBadge({ status }: { status: string }) {
  const tone = status === 'done' ? 'success' : status === 'failed' ? 'danger' : status === 'running' ? 'primary' : 'default'
  return <Chip tone={tone as any} icon={<StatusDot status={status === 'running' ? 'running' : status === 'done' ? 'success' : status === 'failed' ? 'error' : 'idle'} size={6} />}>{status}</Chip>
}
