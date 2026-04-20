import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Target, Plus, Send, Loader2, ChevronRight, LayoutList, Columns3 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { runList, runStart } from '@/lib/api'
import { invoke } from '@/lib/ipc'
import { Card, Chip, Empty, TopBar, Button, StatusDot } from '@/components/ui'
import type { Run } from '@/types/domain'
import clsx from 'clsx'

const LANES: { id: Run['status']; label: string; tone: 'default'|'primary'|'warn'|'success'|'danger' }[] = [
  { id: 'running',        label: 'Running',        tone: 'primary' },
  { id: 'awaiting_user',  label: 'Awaiting you',   tone: 'warn' },
  { id: 'done',           label: 'Done',           tone: 'success' },
  { id: 'failed',         label: 'Failed',         tone: 'danger' },
  { id: 'aborted',        label: 'Aborted',        tone: 'default' },
]

export default function GoalsScreen() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState<string>(params.get('prefill') ?? '')
  const [submitting, setSubmitting] = useState(false)
  const isNew = params.get('new') === '1' || !!params.get('prefill')
  const [view, setView] = useState<'list' | 'kanban'>(() => (localStorage.getItem('goals.view') as 'list' | 'kanban') ?? 'list')
  const [repoPath, setRepoPath] = useState<string>('')
  const [repos, setRepos] = useState<Array<{ name: string; path: string }>>([])
  useEffect(() => {
    invoke<Array<{ name: string; meta: { path?: string } }>>('resource_list', { kind: 'repo' })
      .then(rs => setRepos(rs.map(r => ({ name: r.name, path: r.meta?.path ?? '' })).filter(r => r.path)))
      .catch(() => {})
  }, [])

  const { data: runs, isLoading } = useQuery({
    queryKey: ['runs'],
    queryFn: () => runList(50),
    refetchInterval: 3000,
  })

  // Auto-focus draft when arriving with ?new=1 or ?prefill
  const [showComposer, setShowComposer] = useState(isNew)

  useEffect(() => {
    if (params.get('new') === '1' || params.get('prefill')) setShowComposer(true)
  }, [params])

  async function submit() {
    const g = draft.trim()
    if (!g || submitting) return
    setSubmitting(true)
    try {
      const { runId } = await runStart(g, repoPath.trim() || undefined)
      setDraft('')
      setParams({}, { replace: true })
      navigate(`/goals/${runId}`)
    } catch (e) {
      alert(`Failed to start run: ${String((e as Error)?.message ?? e)}`)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title="Goals"
        subtitle="Hand the team work. Each goal becomes a run with a plan + step graph."
        actions={<>
          <div className="flex items-center rounded-md border border-white/10 overflow-hidden">
            <button onClick={() => { setView('list'); localStorage.setItem('goals.view', 'list') }}
                    className={clsx('px-2 py-1 text-[11px] flex items-center gap-1',
                      view === 'list' ? 'bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))]' : 'text-meta')}>
              <LayoutList size={11} /> list
            </button>
            <button onClick={() => { setView('kanban'); localStorage.setItem('goals.view', 'kanban') }}
                    className={clsx('px-2 py-1 text-[11px] flex items-center gap-1',
                      view === 'kanban' ? 'bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))]' : 'text-meta')}>
              <Columns3 size={11} /> kanban
            </button>
          </div>
          <Button icon={<Plus size={12} />} variant="primary" size="sm" onClick={() => setShowComposer(v => !v)}>New goal</Button>
        </>}
      />

      {showComposer && (
        <div className="px-7 pt-5">
          <Card padding="sm" className="ring-glow">
            <div className="flex items-end gap-2">
              <textarea
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
                rows={2}
                placeholder="Describe the goal in one sentence — Conductor will plan, route, and track."
                className="flex-1 bg-transparent text-[14px] text-heading placeholder:text-meta outline-none resize-none px-3 py-2 leading-relaxed"
              />
              <Button onClick={submit} disabled={!draft.trim() || submitting}
                      icon={submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}>
                Run
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-2 px-1 text-[11px]">
              <span className="text-meta">Optional repo (auto-creates a worktree):</span>
              <select value={repoPath} onChange={e => setRepoPath(e.target.value)}
                      className="h-7 px-2 rounded-md border border-white/10 bg-white/5 text-[11px] font-mono text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]">
                <option value="">— none —</option>
                {repos.map(r => <option key={r.name} value={r.path}>{r.name}</option>)}
              </select>
              <input value={repoPath} onChange={e => setRepoPath(e.target.value)} placeholder="or /path/to/repo"
                     className="h-7 flex-1 px-2 rounded-md border border-white/10 bg-white/5 text-[11px] font-mono text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
            </div>
          </Card>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-7 py-5">
        {isLoading && (
          <div className="text-meta text-[12px] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> loading…</div>
        )}
        {runs && runs.length === 0 && !showComposer && (
          <Empty
            icon={<Target size={20} />}
            title="No goals yet"
            hint="Open the palette (⌘K) and describe what you want done — Conductor picks it up from there."
            action={<Button icon={<Plus size={12} />} variant="soft" size="sm" onClick={() => setShowComposer(true)}>New goal</Button>}
          />
        )}
        {runs && runs.length > 0 && view === 'list' && (
          <div className="space-y-2">
            {runs.map(r => <RunRow key={r.id} run={r} />)}
          </div>
        )}

        {runs && runs.length > 0 && view === 'kanban' && (
          <div className="grid grid-cols-5 gap-3">
            {LANES.map(lane => {
              const runsInLane = runs.filter(r => r.status === lane.id)
              return (
                <div key={lane.id} className="min-w-0">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Chip tone={lane.tone}>{lane.label}</Chip>
                    <span className="text-[10px] text-meta tabular-nums">{runsInLane.length}</span>
                  </div>
                  <div className="space-y-2">
                    {runsInLane.map(r => (
                      <Link key={r.id} to={`/goals/${r.id}`} className="block">
                        <Card padding="sm" className="lift">
                          <div className="text-[11px] font-semibold text-heading line-clamp-3 leading-snug">{r.goal}</div>
                          <div className="text-[9px] text-meta mt-1">{new Date(r.startedAt).toLocaleTimeString()} · {r.taskType ?? 'goal'}</div>
                        </Card>
                      </Link>
                    ))}
                    {runsInLane.length === 0 && <div className="text-[10px] text-meta px-1">—</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function RunRow({ run }: { run: Run }) {
  const tone = run.status === 'done' ? 'success' : run.status === 'failed' ? 'danger' : run.status === 'running' ? 'primary' : 'default'
  return (
    <Link to={`/goals/${run.id}`} className="block">
      <Card className="lift hover:bg-[rgb(var(--c-surface-2)/0.6)]">
        <div className="flex items-start gap-3">
          <StatusDot status={run.status === 'running' ? 'running' : run.status === 'done' ? 'success' : run.status === 'failed' ? 'error' : 'idle'} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-heading truncate">{run.goal}</div>
            <div className="text-[10px] text-meta mt-0.5">
              {new Date(run.startedAt).toLocaleString()} · {run.taskType ?? 'goal'} · {run.id.slice(0, 8)}
            </div>
          </div>
          <Chip tone={tone as any}>{run.status}</Chip>
          <ChevronRight size={14} className="text-meta" />
        </div>
      </Card>
    </Link>
  )
}
