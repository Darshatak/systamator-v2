// Browser screen — launches and controls a second Tauri webview that the
// Browser agent (or the user directly) can drive. The window itself is a
// separate OS window; this screen is the control panel.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Send, Square, ArrowRight, RefreshCw, Loader2, Link2, Terminal } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { Card, Chip, TopBar, Button, Empty } from '@/components/ui'

const QUICK_LINKS = [
  'https://github.com',
  'https://news.ycombinator.com',
  'https://duckduckgo.com',
  'https://www.google.com',
  'https://wikipedia.org',
]

export default function BrowserScreen() {
  const [url, setUrl]         = useState('')
  const [currentUrl, setCur]  = useState<string | null>(null)
  const [busy, setBusy]       = useState(false)
  const [js, setJs]           = useState('document.title')
  const [jsOut, setJsOut]     = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => { pollUrl() }, [])
  useEffect(() => {
    const t = setInterval(pollUrl, 2000)
    return () => clearInterval(t)
  }, [])

  async function pollUrl() {
    try { setCur(await invoke<string | null>('browser_get_url', {})) }
    catch { /* no-op */ }
  }

  async function open() {
    if (!url.trim()) return
    setBusy(true)
    try {
      await invoke('browser_open', { url: url.trim() })
      await pollUrl()
    } catch (e) { alert(`Browser open failed: ${String((e as Error)?.message ?? e)}`) }
    finally { setBusy(false) }
  }

  async function close() {
    setBusy(true)
    try { await invoke('browser_close', {}); setCur(null) } finally { setBusy(false) }
  }

  async function runJs() {
    setBusy(true); setJsOut(null)
    try { setJsOut(await invoke<string>('browser_eval', { js })) }
    catch (e) { setJsOut(`Error: ${String((e as Error)?.message ?? e)}`) }
    finally { setBusy(false) }
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title="Browser"
        subtitle="Agent computer-use surface. Navigate, eval JS, extract — agents drive this the same way you do."
        actions={currentUrl ? <Chip tone="success" icon={<Globe size={9} />}>connected</Chip> : <Chip>idle</Chip>}
      />

      <div className="flex-1 overflow-y-auto px-7 py-6 space-y-5">
        {/* URL bar */}
        <Card className="ring-glow">
          <div className="flex items-center gap-2">
            <Globe size={13} className="text-[rgb(var(--c-primary-2))]" />
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') open() }}
              placeholder="https://… or a search term"
              className="flex-1 bg-transparent text-[13px] text-heading placeholder:text-meta outline-none px-2 py-1 font-mono"
            />
            <Button onClick={open} disabled={busy || !url.trim()}
                    icon={busy ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}>
              Open
            </Button>
            {currentUrl && (
              <Button variant="ghost" size="sm" onClick={close} icon={<Square size={11} />}>Close</Button>
            )}
          </div>
          {currentUrl && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-meta">
              <Link2 size={11} /> <span className="font-mono truncate">{currentUrl}</span>
              <button onClick={pollUrl} className="ml-auto p-1 rounded hover:bg-white/5"><RefreshCw size={10} /></button>
            </div>
          )}
        </Card>

        {/* Quick links */}
        <Card padding="sm">
          <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-2">Quick links</div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_LINKS.map(u => (
              <button key={u} onClick={() => { setUrl(u); invoke('browser_open', { url: u }).then(pollUrl) }}
                      className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[11px] text-body font-mono">
                {new URL(u).host}
              </button>
            ))}
          </div>
        </Card>

        {/* JS eval */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Terminal size={12} className="text-[rgb(var(--c-primary-2))]" />
            <span className="text-[11px] font-bold text-heading uppercase tracking-[0.18em]">Evaluate JS</span>
            <Chip tone="info" className="ml-auto">browser_eval</Chip>
          </div>
          <textarea value={js} onChange={e => setJs(e.target.value)} rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[11px] font-mono text-body outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
          <div className="flex items-center gap-2 mt-2">
            <Button size="sm" onClick={runJs} disabled={busy || !js.trim()} icon={<Send size={11} />}>Run</Button>
            <span className="text-[10px] text-meta">Result shown below; full event-channel wiring arrives in M3.2.</span>
          </div>
          {jsOut && <pre className="mt-3 text-[10px] bg-white/[0.03] border border-white/5 rounded-md p-2 font-mono text-body whitespace-pre-wrap">{jsOut}</pre>}
        </Card>

        {!currentUrl && (
          <Empty
            icon={<Globe size={20} />}
            title="Browser is idle"
            hint="Enter a URL above — Systamator opens a second OS window you can see and that agents can drive. Same webview Tauri uses for the main app, so extensions / cookies don't leak."
          />
        )}
      </div>
    </div>
  )
}
