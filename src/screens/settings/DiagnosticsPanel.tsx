// Diagnostics — live system snapshot, shown inside Advanced tab.
//
// Polls the Rust backend every 3 seconds so you can watch state move.
// Everything is read-only; action buttons (flush cache, reconnect DB,
// drop SSH sessions) land with the next diagnostics pass.

import { useEffect, useState } from 'react'
import { Database, Server, Plug, Activity, RefreshCw, Trash2, Zap, PowerOff } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { Card, Chip, Button } from '@/components/ui'

interface CacheStats { total: number; active: number; expired: number }
interface DbStatus   { connected: boolean; message: string }
interface McpStatus  { name: string; command: string; running: boolean; trusted: boolean }
interface SshPool    { sessionId: string; leases: number; alive: boolean; idleSecs: number }
interface Run        { id: string; goal: string; status: string; cost: { tokens: number; dollars: number; wallMs: number } }

export function DiagnosticsPanel() {
  const [cache,    setCache]    = useState<CacheStats | null>(null)
  const [db,       setDb]       = useState<DbStatus | null>(null)
  const [mcp,      setMcp]      = useState<McpStatus[] | null>(null)
  const [ssh,      setSsh]      = useState<SshPool[] | null>(null)
  const [runs,     setRuns]     = useState<Run[] | null>(null)

  async function refresh() {
    const [c, d, m, s, r] = await Promise.all([
      invoke<CacheStats>('cache_stats', {}).catch(() => null),
      invoke<DbStatus>('db_status', {}).catch(() => null),
      invoke<McpStatus[]>('mcp_server_status', {}).catch(() => null),
      invoke<SshPool[]>('ssh_pool_status', {}).catch(() => null),
      invoke<Run[]>('run_list', { limit: 20 }).catch(() => null),
    ])
    if (c) setCache(c); if (d) setDb(d); if (m) setMcp(m); if (s) setSsh(s); if (r) setRuns(r)
  }
  useEffect(() => { refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t) }, [])

  const [pending, setPending] = useState<string | null>(null)
  const [toast, setToast]     = useState<string | null>(null)

  async function flushCache() {
    setPending('cache'); setToast(null)
    try { const n = await invoke<number>('cache_flush', {}); setToast(`Flushed ${n} cache entries`) }
    catch (e) { setToast(`Cache flush failed: ${String((e as Error)?.message ?? e)}`) }
    finally { setPending(null); refresh() }
  }
  async function reconnectDb() {
    setPending('db'); setToast(null)
    try { const s = await invoke<DbStatus>('db_reconnect', {}); setToast(s.message) }
    catch (e) { setToast(`DB reconnect failed: ${String((e as Error)?.message ?? e)}`) }
    finally { setPending(null); refresh() }
  }
  async function dropSsh() {
    if (!confirm('Force-close every SSH session?')) return
    setPending('ssh'); setToast(null)
    try { const n = await invoke<number>('ssh_pool_drop_all', {}); setToast(`Dropped ${n} SSH sessions`) }
    catch (e) { setToast(`SSH drop failed: ${String((e as Error)?.message ?? e)}`) }
    finally { setPending(null); refresh() }
  }

  const costSummary = runs?.reduce(
    (acc, r) => ({
      tokens: acc.tokens + (r.cost?.tokens ?? 0),
      dollars: acc.dollars + (r.cost?.dollars ?? 0),
      runs: acc.runs + 1,
    }),
    { tokens: 0, dollars: 0, runs: 0 }
  ) ?? { tokens: 0, dollars: 0, runs: 0 }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Activity size={14} className="text-[rgb(var(--c-primary-2))]" />
        <span className="text-[12px] font-bold text-heading uppercase tracking-[0.18em]">Diagnostics</span>
        <span className="ml-auto text-[10px] text-meta flex items-center gap-1"><RefreshCw size={9} /> live · 3 s</span>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Button size="sm" variant="soft" icon={<Zap size={11} />}      onClick={flushCache}  disabled={!!pending}>Flush cache</Button>
        <Button size="sm" variant="soft" icon={<RefreshCw size={11} />} onClick={reconnectDb} disabled={!!pending}>Reconnect DB</Button>
        <Button size="sm" variant="danger" icon={<PowerOff size={11} />} onClick={dropSsh}     disabled={!!pending}>Drop SSH sessions</Button>
        {toast && <span className="text-[11px] text-meta">{toast}</span>}
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat icon={Database} label="Postgres" value={db?.connected ? 'connected' : 'offline'} tone={db?.connected ? 'success' : 'danger'} hint={db?.message ?? ''} />
        <Stat icon={Plug}     label="MCP servers"  value={`${mcp?.filter(m => m.running).length ?? 0}/${mcp?.length ?? 0}`} hint="running / registered" />
        <Stat icon={Server}   label="SSH sessions" value={String(ssh?.length ?? 0)} hint={`${ssh?.filter(s => s.alive).length ?? 0} alive`} />
        <Stat icon={Activity} label="Cache"        value={String(cache?.active ?? 0)} hint={`${cache?.total ?? 0} keys · ${cache?.expired ?? 0} expired`} />
      </div>

      {/* Recent run cost */}
      <div className="mt-4 border-t border-white/8 pt-3">
        <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-2">Recent run cost · last {costSummary.runs}</div>
        <div className="flex items-center gap-3 text-[12px]">
          <Chip tone="primary">{costSummary.tokens.toLocaleString()} tokens</Chip>
          <Chip tone="info">${costSummary.dollars.toFixed(3)}</Chip>
        </div>
        {runs && runs.length > 0 && (
          <div className="mt-3 space-y-1 max-h-[220px] overflow-y-auto">
            {runs.slice(0, 10).map(r => (
              <div key={r.id} className="flex items-center gap-2 text-[11px] px-2 py-1 rounded-md bg-white/[0.02]">
                <span className={`w-1.5 h-1.5 rounded-full ${r.status === 'done' ? 'bg-[rgb(var(--c-success))]' : r.status === 'failed' ? 'bg-[rgb(var(--c-danger))]' : r.status === 'running' ? 'bg-[rgb(var(--c-primary))] dot-running' : 'bg-meta/40'}`} />
                <span className="flex-1 truncate text-body">{r.goal}</span>
                <span className="text-[9px] text-meta tabular-nums">{r.cost?.tokens ?? 0} tok</span>
                <span className="text-[9px] text-meta tabular-nums">${(r.cost?.dollars ?? 0).toFixed(3)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function Stat({ icon: Icon, label, value, hint, tone = 'primary' }: {
  icon: typeof Database; label: string; value: string; hint?: string;
  tone?: 'primary' | 'success' | 'danger' | 'info'
}) {
  const toneCls = {
    primary: 'bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))]',
    success: 'bg-[rgb(var(--c-success)/0.14)] text-[rgb(var(--c-success))]',
    danger:  'bg-[rgb(var(--c-danger)/0.14)]  text-[rgb(var(--c-danger))]',
    info:    'bg-[rgb(var(--c-info)/0.14)]    text-[rgb(var(--c-info))]',
  }[tone]
  return (
    <div className="rounded-xl border border-white/8 p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-7 h-7 rounded-lg ${toneCls} flex items-center justify-center`}><Icon size={12} /></div>
        <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em]">{label}</div>
      </div>
      <div className="text-[17px] font-bold text-heading tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-meta mt-0.5 truncate">{hint}</div>}
    </div>
  )
}
