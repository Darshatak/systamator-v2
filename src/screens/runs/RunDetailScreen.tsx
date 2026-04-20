// Run Observer — tabbed, read-only.
//
// This is where you watch a task unfold. Plan (step graph), Agent
// (per-agent timeline), Browser (URL visits + screenshots the browser
// agent produced), Code (git diff + fs_* activity), Logs (flattened
// output stream). All panels are strictly read-only; the only
// affordances are worktree open/remove (existing) and a back link.
//
// Data comes from one query (runGet) shared across tabs, so tab
// switches are instantaneous.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { runGet, runTick, skillDistillRun } from '@/lib/api'
import type { Step } from '@/types/domain'
import { Card, Chip, TopBar, StatusDot, Button } from '@/components/ui'
import {
  ChevronLeft, Clock, Bot, Wrench, Brain, GitFork, CheckCircle2, Loader2, XCircle,
  Layers, ExternalLink, Trash2, ListTree, Users, Globe, Code2, FileText,
  MousePointer2, Keyboard, Camera, Navigation, FileDiff,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { invoke, listen } from '@/lib/ipc'
import clsx from 'clsx'

const TICK_MS = 750

type Tab = 'plan' | 'agent' | 'browser' | 'code' | 'logs'

export default function RunDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [autorun, setAutorun] = useState(true)
  const [tab, setTab] = useState<Tab>('plan')
  const tickRef = useRef<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['run', id],
    queryFn: () => runGet(id!),
    refetchInterval: autorun ? TICK_MS : false,
    enabled: !!id,
  })

  useEffect(() => {
    if (!id || !autorun) return
    let cancelled = false
    async function loop() {
      while (!cancelled) {
        try {
          const r = await runTick(id!)
          qc.invalidateQueries({ queryKey: ['run', id] })
          if (r.runDone) {
            setAutorun(false)
            try { await skillDistillRun(id!) } catch { /* best-effort */ }
            break
          }
          if (r.status === 'idle' || r.status === 'awaiting_user') break
        } catch { break }
        await new Promise(r => (tickRef.current = window.setTimeout(r, 350)))
      }
    }
    void loop()
    return () => { cancelled = true; if (tickRef.current) window.clearTimeout(tickRef.current) }
  }, [id, autorun, qc])

  useEffect(() => {
    if (!id) return
    let unsubStep = () => {}; let unsubDone = () => {}
    listen<{ runId: string }>('step:updated', p => { if (p.runId === id) qc.invalidateQueries({ queryKey: ['run', id] }) }).then(u => unsubStep = u)
    listen<{ runId: string }>('run:done',     p => { if (p.runId === id) { qc.invalidateQueries({ queryKey: ['run', id] }); setAutorun(false) } }).then(u => unsubDone = u)
    return () => { unsubStep(); unsubDone() }
  }, [id, qc])

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

  const TABS: { id: Tab; label: string; icon: typeof ListTree; count?: number }[] = [
    { id: 'plan',    label: 'Plan',    icon: ListTree, count: total },
    { id: 'agent',   label: 'Agent',   icon: Users,    count: new Set(steps.map(s => s.agentId).filter(Boolean)).size },
    { id: 'browser', label: 'Browser', icon: Globe,    count: steps.filter(isBrowserStep).length },
    { id: 'code',    label: 'Code',    icon: Code2,    count: steps.filter(isCodeStep).length },
    { id: 'logs',    label: 'Logs',    icon: FileText, count: steps.filter(s => s.output != null).length },
  ]

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title={run.goal}
        subtitle={`Run ${run.id.slice(0, 8)} · ${run.taskType ?? 'goal'} · conductor: ${run.conductorId ?? '—'}`}
        actions={<>
          <Link to="/chat" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-meta hover:text-heading hover:bg-white/5 text-[12px]">
            <ChevronLeft size={12} /> Back
          </Link>
          <RunBadge status={run.status} />
        </>}
      />

      <div className="flex-1 overflow-y-auto px-7 py-6">
        <WorktreeStrip run={run} onChanged={() => qc.invalidateQueries({ queryKey: ['run', id] })} />

        <div className="grid grid-cols-3 gap-3 mb-5">
          <Card padding="sm"><div className="text-[9px] font-bold text-meta uppercase tracking-[0.18em]">Total steps</div><div className="text-[24px] font-bold text-heading mt-0.5 tabular-nums">{total}</div></Card>
          <Card padding="sm"><div className="text-[9px] font-bold text-meta uppercase tracking-[0.18em]">Completed</div><div className="text-[24px] font-bold text-heading mt-0.5 tabular-nums">{done}</div></Card>
          <Card padding="sm"><div className="text-[9px] font-bold text-meta uppercase tracking-[0.18em]">Failed</div><div className="text-[24px] font-bold text-heading mt-0.5 tabular-nums">{fail}</div></Card>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1 mb-4 border-b border-white/8">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 transition-colors',
                tab === t.id
                  ? 'border-[rgb(var(--c-primary))] text-heading font-semibold'
                  : 'border-transparent text-meta hover:text-heading',
              )}
            >
              <t.icon size={12} />
              {t.label}
              {typeof t.count === 'number' && t.count > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-meta tabular-nums">{t.count}</span>
              )}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-meta">read-only · observer</span>
        </div>

        {tab === 'plan'    && <PlanPanel steps={steps} />}
        {tab === 'agent'   && <AgentPanel steps={steps} conductorId={run.conductorId ?? null} />}
        {tab === 'browser' && <BrowserPanel steps={steps} />}
        {tab === 'code'    && <CodePanel steps={steps} worktreePath={(run.meta as any)?.worktree?.path} />}
        {tab === 'logs'    && <LogsPanel steps={steps} />}
      </div>
    </div>
  )
}

// ── Tab: Plan ─────────────────────────────────────────────────────────

function PlanPanel({ steps }: { steps: Step[] }) {
  return (
    <Card>
      <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-3">Step graph</div>
      <ol className="space-y-2">
        {steps.map((s, i) => <StepRow key={s.id} step={s} index={i} />)}
      </ol>
    </Card>
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
  const dur = useMemo(() => stepDuration(step), [step.startedAt, step.finishedAt])

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

// ── Tab: Agent ────────────────────────────────────────────────────────

function AgentPanel({ steps, conductorId }: { steps: Step[]; conductorId: string | null }) {
  // Group steps by agentId. Unassigned/system steps fall under "—".
  const byAgent = useMemo(() => {
    const m = new Map<string, Step[]>()
    for (const s of steps) {
      const k = s.agentId ?? '—'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [steps])

  if (byAgent.length === 0) {
    return <Card><div className="text-[12px] text-meta">No agent activity yet.</div></Card>
  }

  return (
    <div className="space-y-3">
      <Card padding="sm">
        <div className="flex items-center gap-2 text-[11px]">
          <Bot size={12} className="text-[rgb(var(--c-primary-2))]" />
          <span className="text-meta">Conductor:</span>
          <Chip tone="primary">{conductorId ?? '—'}</Chip>
          <span className="text-meta ml-3">Participating agents: <b className="text-heading">{byAgent.length}</b></span>
        </div>
      </Card>

      {byAgent.map(([agentId, agentSteps]) => {
        const wallMs = agentSteps.reduce((a, s) => a + (s.cost?.wallMs ?? 0), 0)
        const tokens = agentSteps.reduce((a, s) => a + (s.cost?.tokens ?? 0), 0)
        const dollars = agentSteps.reduce((a, s) => a + (s.cost?.dollars ?? 0), 0)
        const done   = agentSteps.filter(s => s.status === 'done').length
        const failed = agentSteps.filter(s => s.status === 'failed').length
        return (
          <Card key={agentId}>
            <div className="flex items-center gap-2 mb-3">
              <Users size={13} className="text-[rgb(var(--c-primary-2))]" />
              <span className="text-[13px] font-semibold text-heading">{agentId}</span>
              <Chip>{agentSteps.length} steps</Chip>
              <Chip tone="success">{done} done</Chip>
              {failed > 0 && <Chip tone="danger">{failed} failed</Chip>}
              <span className="ml-auto text-[10px] text-meta tabular-nums">
                {tokens.toLocaleString()} tok · ${dollars.toFixed(3)} · {Math.round(wallMs)}ms
              </span>
            </div>
            {/* Horizontal step band */}
            <div className="flex gap-0.5 mb-2">
              {agentSteps.map(s => (
                <div key={s.id}
                     title={`${s.label} — ${s.status}`}
                     className={clsx('h-1.5 flex-1 rounded-sm',
                       s.status === 'done'    ? 'bg-[rgb(var(--c-success))]' :
                       s.status === 'failed'  ? 'bg-[rgb(var(--c-danger))]'  :
                       s.status === 'running' ? 'bg-[rgb(var(--c-primary))] dot-running' :
                       'bg-white/10')} />
              ))}
            </div>
            <div className="space-y-1">
              {agentSteps.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-center gap-2 text-[11px]">
                  <span className={clsx('w-1.5 h-1.5 rounded-full',
                    s.status === 'done' ? 'bg-[rgb(var(--c-success))]' :
                    s.status === 'failed' ? 'bg-[rgb(var(--c-danger))]' :
                    s.status === 'running' ? 'bg-[rgb(var(--c-primary))]' : 'bg-meta/40')} />
                  <span className="text-body truncate flex-1">{s.label}</span>
                  <span className="text-[9px] text-meta tabular-nums">{stepDuration(s) ?? '—'}</span>
                </div>
              ))}
              {agentSteps.length > 5 && <div className="text-[10px] text-meta mt-1">+ {agentSteps.length - 5} more</div>}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── Tab: Browser ──────────────────────────────────────────────────────

function isBrowserStep(s: Step): boolean {
  const tool = (s.input as any)?.tool
  if (typeof tool === 'string' && tool.startsWith('browser_')) return true
  return s.agentId === 'browser-ic' || s.agentId?.startsWith('browser') === true
}

function BrowserPanel({ steps }: { steps: Step[] }) {
  const events = steps.filter(isBrowserStep)
  if (events.length === 0) {
    return <Card><div className="text-[12px] text-meta">The browser agent hasn't touched this run yet.</div></Card>
  }

  return (
    <Card>
      <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-3">Browser timeline · {events.length}</div>
      <ol className="space-y-2">
        {events.map(s => <BrowserEvent key={s.id} step={s} />)}
      </ol>
    </Card>
  )
}

function BrowserEvent({ step }: { step: Step }) {
  const tool = (step.input as any)?.tool as string | undefined
  const Icon =
    tool === 'browser_navigate' || tool === 'browser_open' ? Navigation :
    tool === 'browser_click'     ? MousePointer2 :
    tool === 'browser_type'      ? Keyboard :
    tool === 'browser_screenshot'? Camera :
    Globe

  const url = (step.input as any)?.url as string | undefined
  const selector = (step.input as any)?.selector as string | undefined
  const output = step.output as any

  // Render screenshot inline if output has base64 or a resolvable path.
  const screenshot = tool === 'browser_screenshot' ? extractScreenshot(output) : null

  return (
    <li className="flex items-start gap-3 p-3 rounded-xl border border-white/8">
      <Icon size={13} className="text-[rgb(var(--c-primary-2))] mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold text-heading">{step.label}</span>
          {tool && <Chip>{tool.replace('browser_', '')}</Chip>}
          {step.status === 'running' && <Loader2 size={11} className="animate-spin text-[rgb(var(--c-primary-2))]" />}
          {step.status === 'failed'  && <Chip tone="danger">failed</Chip>}
          <span className="ml-auto text-[9px] text-meta tabular-nums">{stepDuration(step) ?? ''}</span>
        </div>
        {url && <div className="text-[11px] font-mono text-[rgb(var(--c-primary-2))] mt-1 truncate">{url}</div>}
        {selector && <div className="text-[11px] font-mono text-meta mt-1 truncate">{selector}</div>}
        {screenshot && (
          <div className="mt-2">
            {screenshot.kind === 'data'
              ? <img src={screenshot.src} alt="screenshot" className="max-w-full rounded-md border border-white/10" />
              : <div className="text-[10px] font-mono text-meta">{screenshot.src}</div>}
          </div>
        )}
      </div>
    </li>
  )
}

function extractScreenshot(output: unknown): { kind: 'data' | 'path'; src: string } | null {
  if (!output) return null
  if (typeof output === 'string') {
    if (output.startsWith('data:image/')) return { kind: 'data', src: output }
    if (/\.(png|jpg|jpeg|webp)$/i.test(output)) return { kind: 'path', src: output }
  }
  if (typeof output === 'object') {
    const o = output as any
    if (typeof o.base64 === 'string') return { kind: 'data', src: `data:image/png;base64,${o.base64}` }
    if (typeof o.dataUrl === 'string') return { kind: 'data', src: o.dataUrl }
    if (typeof o.path === 'string')   return { kind: 'path', src: o.path }
  }
  return null
}

// ── Tab: Code ─────────────────────────────────────────────────────────

function isCodeStep(s: Step): boolean {
  const tool = (s.input as any)?.tool
  if (typeof tool !== 'string') return false
  return tool.startsWith('fs_') || tool === 'run_shell' || tool.startsWith('git_')
}

function CodePanel({ steps, worktreePath }: { steps: Step[]; worktreePath: string | undefined }) {
  const events = steps.filter(isCodeStep)
  const [diff, setDiff] = useState<string | null>(null)
  const [diffErr, setDiffErr] = useState<string | null>(null)

  useEffect(() => {
    if (!worktreePath) return
    invoke<string>('git_diff', { cwd: worktreePath })
      .then(setDiff)
      .catch(e => setDiffErr(String((e as Error)?.message ?? e)))
  }, [worktreePath])

  return (
    <div className="space-y-3">
      {worktreePath && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <FileDiff size={13} className="text-[rgb(var(--c-primary-2))]" />
            <span className="text-[10px] font-bold text-meta uppercase tracking-[0.18em]">Worktree diff</span>
            <span className="text-[10px] text-meta font-mono truncate">{worktreePath}</span>
          </div>
          {diffErr && <div className="text-[11px] text-[rgb(var(--c-danger))] font-mono">{diffErr}</div>}
          {!diffErr && diff === null && <div className="text-[11px] text-meta flex items-center gap-2"><Loader2 size={11} className="animate-spin" /> loading diff…</div>}
          {!diffErr && diff !== null && diff.trim() === '' && <div className="text-[11px] text-meta">No pending changes.</div>}
          {!diffErr && diff && diff.trim() !== '' && (
            <pre className="text-[11px] font-mono leading-relaxed whitespace-pre max-h-[320px] overflow-auto">
              {diff.split('\n').map((line, i) => (
                <div key={i} className={
                  line.startsWith('+') && !line.startsWith('+++') ? 'text-[rgb(var(--c-success))]' :
                  line.startsWith('-') && !line.startsWith('---') ? 'text-[rgb(var(--c-danger))]' :
                  line.startsWith('@@') ? 'text-[rgb(var(--c-primary-2))]' :
                  line.startsWith('diff ') || line.startsWith('+++') || line.startsWith('---') ? 'text-heading font-semibold' :
                  'text-meta'
                }>{line || ' '}</div>
              ))}
            </pre>
          )}
        </Card>
      )}

      <Card>
        <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-3">Code activity · {events.length}</div>
        {events.length === 0
          ? <div className="text-[12px] text-meta">No code-agent steps yet.</div>
          : <ul className="space-y-1.5">
              {events.map(s => <CodeEvent key={s.id} step={s} />)}
            </ul>}
      </Card>
    </div>
  )
}

function CodeEvent({ step }: { step: Step }) {
  const tool = (step.input as any)?.tool as string | undefined
  const path = (step.input as any)?.path as string | undefined
  const cmd  = (step.input as any)?.cmd  as string | undefined
  const tone =
    tool?.startsWith('fs_write') ? 'warn' :
    tool?.startsWith('fs_read')  ? 'default' :
    tool === 'run_shell'         ? 'primary' :
    'info'
  return (
    <li className="flex items-center gap-2 text-[11px] py-1">
      <Chip tone={tone as any}>{tool ?? step.kind}</Chip>
      <span className="font-mono text-body truncate flex-1">{path ?? cmd ?? step.label}</span>
      <StepStateIcon status={step.status} />
      <span className="text-[9px] text-meta tabular-nums">{stepDuration(step) ?? ''}</span>
    </li>
  )
}

// ── Tab: Logs ─────────────────────────────────────────────────────────

function LogsPanel({ steps }: { steps: Step[] }) {
  const rows = steps.filter(s => s.output != null)
  if (rows.length === 0) {
    return <Card><div className="text-[12px] text-meta">No output yet.</div></Card>
  }
  return (
    <Card>
      <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-3">Output stream · {rows.length}</div>
      <div className="space-y-2 max-h-[640px] overflow-y-auto">
        {rows.map(s => (
          <div key={s.id} className="border-l-2 border-white/10 pl-3">
            <div className="flex items-center gap-2 text-[10px] text-meta">
              <span className="tabular-nums">{s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : ''}</span>
              <span className="font-mono">{s.label}</span>
              {s.agentId && <Chip tone="primary">{s.agentId}</Chip>}
            </div>
            <pre className="text-[11px] font-mono whitespace-pre-wrap text-body leading-relaxed mt-1">
              {typeof s.output === 'string' ? s.output : JSON.stringify(s.output, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Shared helpers ─────────────────────────────────────────────────────

function stepDuration(step: Step): string | null {
  if (!step.startedAt || !step.finishedAt) return null
  const ms = new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function StepStateIcon({ status }: { status: Step['status'] }) {
  if (status === 'running') return <Loader2 size={10} className="animate-spin text-[rgb(var(--c-primary-2))]" />
  if (status === 'done')    return <CheckCircle2 size={10} className="text-[rgb(var(--c-success))]" />
  if (status === 'failed')  return <XCircle size={10} className="text-[rgb(var(--c-danger))]" />
  return <span className="w-2 h-2 rounded-full border border-meta/40" />
}

// ── Worktree strip (unchanged behaviour, still the only non-readonly
// control on this page — open/remove) ─────────────────────────────────

function WorktreeStrip({ run, onChanged }: { run: { id: string; status: string; meta: Record<string, unknown> }; onChanged: () => void }) {
  const wt = (run.meta as { worktree?: { path: string; branch: string; repo: string } }).worktree
  if (!wt) return null
  const [busy, setBusy] = useState(false)

  async function openInCode() {
    localStorage.setItem('systamator.code.workspace', wt!.path)
    window.location.href = '/code'
  }
  async function remove() {
    if (!confirm('Remove this worktree and its branch?')) return
    setBusy(true)
    try { await invoke('worktree_remove', { runId: run.id, repoPath: wt!.repo }); onChanged() }
    catch (e) { toast.error('worktree_remove failed', String((e as Error)?.message ?? e)) }
    finally { setBusy(false) }
  }

  return (
    <Card padding="sm" className="mb-4">
      <div className="flex items-center gap-3">
        <Layers size={13} className="text-[rgb(var(--c-primary-2))]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-heading uppercase tracking-[0.18em]">Worktree</span>
            <Chip tone="primary">{wt.branch.replace('systamator/', '')}</Chip>
          </div>
          <div className="text-[11px] font-mono text-meta truncate mt-0.5">{wt.path}</div>
        </div>
        <Button size="sm" variant="soft" icon={<ExternalLink size={11} />} onClick={openInCode}>Open in Code</Button>
        <Button size="sm" variant="danger" icon={<Trash2 size={11} />} onClick={remove} disabled={busy}>
          {busy ? <Loader2 size={11} className="animate-spin" /> : 'Remove'}
        </Button>
      </div>
    </Card>
  )
}

function RunBadge({ status }: { status: string }) {
  const tone = status === 'done' ? 'success' : status === 'failed' ? 'danger' : status === 'running' ? 'primary' : 'default'
  return <Chip tone={tone as any} icon={<StatusDot status={status === 'running' ? 'running' : status === 'done' ? 'success' : status === 'failed' ? 'error' : 'idle'} size={6} />}>{status}</Chip>
}
