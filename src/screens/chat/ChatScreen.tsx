// /chat — primary command center. Replaces /goals as the task-creation
// surface. Left: recent tasks (read-only list that doubles as history +
// quick jump into the Run Observer). Right: composer + quick-start
// chips. Send → runStart → navigate to /runs/:id.
//
// The 4 demoted sections (Goals / Browser / Code / Agents) do not live
// here — they live as tabs inside the Run Observer. This page is
// conversational and infra-aware, nothing else.

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Send, Loader2, CornerDownLeft, Sparkles, ChevronRight, Server as ServerIcon } from 'lucide-react'
import { runList, runStart } from '@/lib/api'
import { invoke } from '@/lib/ipc'
import { toast } from '@/lib/toast'
import { Card, Chip, StatusDot, TopBar, Button } from '@/components/ui'
import type { Run } from '@/types/domain'
import clsx from 'clsx'

const QUICK_STARTS = [
  { icon: ServerIcon, text: 'Check disk usage on every server' },
  { icon: Sparkles,   text: 'Summarise the last 5 PRs merged into main' },
  { icon: ServerIcon, text: 'Restart nginx on prod-1' },
  { icon: Sparkles,   text: 'Draft a blog post about last week\'s deploy' },
] as const

export default function ChatScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [draft, setDraft] = useState(params.get('prefill') ?? '')
  const [repoPath, setRepoPath] = useState('')
  const [repos, setRepos] = useState<Array<{ name: string; path: string }>>([])
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    invoke<Array<{ name: string; meta: { path?: string } }>>('resource_list', { kind: 'repo' })
      .then(rs => setRepos(rs.map(r => ({ name: r.name, path: r.meta?.path ?? '' })).filter(r => r.path)))
      .catch(() => {})
  }, [])

  useEffect(() => { textareaRef.current?.focus() }, [])

  const { data: runs } = useQuery({
    queryKey: ['runs'],
    queryFn: () => runList(30),
    refetchInterval: 3000,
  })

  async function send() {
    const g = draft.trim()
    if (!g || submitting) return
    setSubmitting(true)
    try {
      const { runId } = await runStart(g, repoPath.trim() || undefined)
      setDraft('')
      navigate(`/runs/${runId}`)
    } catch (e) {
      toast.error('Failed to start task', String((e as Error)?.message ?? e))
    } finally { setSubmitting(false) }
  }

  const active = runs?.filter(r => r.status === 'running' || r.status === 'awaiting_user') ?? []
  const recent = runs?.filter(r => r.status !== 'running' && r.status !== 'awaiting_user').slice(0, 20) ?? []

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title="Chat"
        subtitle="Describe what you want done — the agents pick it up, plan, and report back."
      />

      <div className="flex-1 min-h-0 grid grid-cols-[280px_1fr]">
        {/* ── History rail ─────────────────────────────────────── */}
        <aside className="border-r border-white/8 overflow-y-auto p-4 space-y-4">
          {active.length > 0 && (
            <section>
              <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-2">Active · {active.length}</div>
              <div className="space-y-1.5">
                {active.map(r => <RunLink key={r.id} run={r} />)}
              </div>
            </section>
          )}
          <section>
            <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-2">Recent</div>
            <div className="space-y-1.5">
              {recent.length === 0 && <div className="text-[11px] text-meta px-2">No history yet.</div>}
              {recent.map(r => <RunLink key={r.id} run={r} />)}
            </div>
          </section>
        </aside>

        {/* ── Composer + quick starts ─────────────────────────── */}
        <section className="flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-[720px] mx-auto">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={14} className="text-[rgb(var(--c-primary-2))]" />
                <span className="text-[11px] font-bold text-meta uppercase tracking-[0.18em]">New task</span>
              </div>
              <Card className="ring-glow" padding="sm">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
                    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); send() }
                  }}
                  rows={4}
                  placeholder="Describe the task. The planner will break it into steps; agents will bid for each step."
                  className="w-full bg-transparent text-[14px] text-heading placeholder:text-meta outline-none resize-none leading-relaxed px-1 py-1"
                />
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/8 flex-wrap">
                  <span className="text-[10px] text-meta">Repo (optional, creates a worktree):</span>
                  <select value={repoPath} onChange={e => setRepoPath(e.target.value)}
                          className="h-7 px-2 rounded-md border border-white/10 bg-white/5 text-[11px] font-mono text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]">
                    <option value="">— none —</option>
                    {repos.map(r => <option key={r.name} value={r.path}>{r.name}</option>)}
                  </select>
                  <input value={repoPath} onChange={e => setRepoPath(e.target.value)} placeholder="or /path/to/repo"
                         className="h-7 flex-1 min-w-[180px] px-2 rounded-md border border-white/10 bg-white/5 text-[11px] font-mono text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
                  <span className="text-[10px] text-meta flex items-center gap-1 ml-auto">
                    <kbd>⌘</kbd><kbd><CornerDownLeft size={9} /></kbd> send
                  </span>
                  <Button onClick={send} disabled={!draft.trim() || submitting}
                          icon={submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}>
                    Send
                  </Button>
                </div>
              </Card>

              {/* Quick starts */}
              <div className="mt-6">
                <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-2">Quick starts</div>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_STARTS.map(q => (
                    <button
                      key={q.text}
                      onClick={() => { setDraft(q.text); textareaRef.current?.focus() }}
                      className="flex items-center gap-2 text-left px-3 py-2 rounded-xl border border-white/8 hover:border-white/20 hover:bg-white/5 transition-colors"
                    >
                      <q.icon size={12} className="text-[rgb(var(--c-primary-2))] flex-shrink-0" />
                      <span className="text-[12px] text-body">{q.text}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Primer */}
              <div className="mt-6 text-[11px] text-meta leading-relaxed">
                <p>The Run Observer (opens automatically) shows every step the agents take — which tool, which agent, the browser screenshots, the code diff. You only <b>watch</b> the observer; you don't drive it.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function RunLink({ run }: { run: Run }) {
  const status = run.status === 'running' ? 'running' :
                 run.status === 'done'    ? 'success' :
                 run.status === 'failed'  ? 'error'   : 'idle'
  return (
    <Link to={`/runs/${run.id}`}
          className={clsx('block px-2.5 py-1.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/8 transition-colors group')}>
      <div className="flex items-center gap-2">
        <StatusDot status={status} size={6} />
        <span className="text-[12px] text-heading truncate flex-1">{run.goal}</span>
        <ChevronRight size={11} className="text-meta opacity-0 group-hover:opacity-100" />
      </div>
      <div className="flex items-center gap-2 mt-0.5 ml-4">
        <Chip tone="default">{run.status}</Chip>
        <span className="text-[9px] text-meta tabular-nums">{new Date(run.startedAt).toLocaleTimeString()}</span>
      </div>
    </Link>
  )
}
