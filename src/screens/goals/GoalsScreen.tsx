import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Target, Plus, Send, Loader2, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { runList, runStart } from '@/lib/api'
import { Card, Chip, Empty, TopBar, Button, StatusDot } from '@/components/ui'
import type { Run } from '@/types/domain'

export default function GoalsScreen() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState<string>(params.get('prefill') ?? '')
  const [submitting, setSubmitting] = useState(false)
  const isNew = params.get('new') === '1' || !!params.get('prefill')

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
      const { runId } = await runStart(g)
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
        actions={<Button icon={<Plus size={12} />} variant="primary" size="sm" onClick={() => setShowComposer(v => !v)}>New goal</Button>}
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
        {runs && runs.length > 0 && (
          <div className="space-y-2">
            {runs.map(r => <RunRow key={r.id} run={r} />)}
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
