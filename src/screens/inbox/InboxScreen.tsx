import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@/lib/ipc'
import type { Step, Run } from '@/types/domain'
import { Card, Chip, Empty, TopBar, Button } from '@/components/ui'
import { Inbox as InboxIcon, AlertTriangle, Check, ChevronRight, Loader2 } from 'lucide-react'

interface PendingStep extends Step { runGoal: string }

async function fetchPending(): Promise<PendingStep[]> {
  const runs = await invoke<Run[]>('run_list', { limit: 50 })
  const out: PendingStep[] = []
  for (const r of runs.filter(r => r.status === 'awaiting_user' || r.status === 'running')) {
    const [, steps] = await invoke<[Run, Step[]]>('run_get', { runId: r.id })
    for (const s of steps.filter(s => s.status === 'awaiting_user')) {
      out.push({ ...s, runGoal: r.goal })
    }
  }
  return out
}

export default function InboxScreen() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['inbox'],
    queryFn:  fetchPending,
    refetchInterval: 2000,
  })

  async function approve(stepId: string) {
    await invoke('step_approve', { stepId })
    qc.invalidateQueries({ queryKey: ['inbox'] })
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title="Inbox"
        subtitle="The only place the agent ever interrupts you. Approvals, ambiguity, escalations."
      />
      <div className="flex-1 overflow-y-auto px-7 py-6">
        {isLoading && <div className="text-meta text-[12px] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> loading…</div>}
        {data && data.length === 0 && (
          <Empty icon={<InboxIcon size={20} />} title="Empty inbox" hint="Approval cards land here when the agent hits a destructive verb (rm, drop, shutdown, …) or asks for clarification." />
        )}
        {data && data.length > 0 && (
          <div className="space-y-3">
            {data.map(s => (
              <Card key={s.id}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[rgb(var(--c-warn)/0.14)] text-[rgb(var(--c-warn))] flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Chip tone="warn">approval</Chip>
                      <Chip>{s.kind}</Chip>
                      {s.agentId && <Chip tone="primary">{s.agentId}</Chip>}
                    </div>
                    <div className="text-[13px] font-semibold text-heading">{s.label}</div>
                    <div className="text-[11px] text-meta mt-0.5">For goal · <Link to={`/goals/${s.runId}`} className="hover:text-heading underline-offset-2 hover:underline">{s.runGoal}</Link></div>
                    <pre className="mt-2 text-[10px] text-body bg-white/[0.03] rounded-md p-2 font-mono whitespace-pre-wrap leading-relaxed border border-white/5">
                      {JSON.stringify(s.input, null, 2)}
                    </pre>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button size="sm" variant="primary" icon={<Check size={11} />} onClick={() => approve(s.id)}>Approve</Button>
                    <Link to={`/goals/${s.runId}`} className="inline-flex items-center justify-center gap-1 px-2.5 h-7 rounded-md text-meta hover:text-heading hover:bg-white/5 text-[11px]">
                      Open <ChevronRight size={11} />
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
