// Browser screen — launches and controls a second Tauri webview that the
// Browser agent (or the user directly) can drive. The window itself is a
// separate OS window; this screen is the control panel.

import { useEffect, useState } from 'react'
import { Globe, Send, Square, ArrowRight, RefreshCw, Loader2, Link2, Terminal, MousePointerClick, Keyboard, Copy, ChevronLeft, ChevronRight, Camera, ScanLine } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { toast } from '@/lib/toast'
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
  // Click / type / extract panel state
  const [clickSel, setClickSel]     = useState('button')
  const [typeSel, setTypeSel]       = useState('input[type="text"]')
  const [typeText, setTypeText]     = useState('')
  const [extractSel, setExtractSel] = useState('h1')
  const [extracted, setExtracted]   = useState<string | null>(null)
  const [action, setAction]         = useState<string | null>(null)
  const [shot, setShot]             = useState<string | null>(null)

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
    } catch (e) { toast.error('Browser open failed', String((e as Error)?.message ?? e)) }
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

  async function doClick() {
    setBusy(true); setAction(null)
    try { await invoke('browser_click', { selector: clickSel }); setAction(`clicked ${clickSel}`) }
    catch (e) { setAction(`error: ${String((e as Error)?.message ?? e)}`) }
    finally { setBusy(false) }
  }
  async function doType() {
    setBusy(true); setAction(null)
    try { await invoke('browser_type', { selector: typeSel, text: typeText }); setAction(`typed into ${typeSel}`) }
    catch (e) { setAction(`error: ${String((e as Error)?.message ?? e)}`) }
    finally { setBusy(false) }
  }
  async function doExtract() {
    setBusy(true); setExtracted(null)
    try { setExtracted(await invoke<string>('browser_extract', { selector: extractSel })) }
    catch (e) { setExtracted(`Error: ${String((e as Error)?.message ?? e)}`) }
    finally { setBusy(false) }
  }
  async function snapshot() {
    setBusy(true); setExtracted(null)
    try { setExtracted(await invoke<string>('browser_snapshot_a11y', {})) }
    catch (e) { setExtracted(`Error: ${String((e as Error)?.message ?? e)}`) }
    finally { setBusy(false) }
  }
  async function screenshot() {
    setBusy(true); setShot(null)
    try { setShot(await invoke<string>('browser_screenshot', {})) }
    catch (e) { setAction(`screenshot error: ${String((e as Error)?.message ?? e)}`) }
    finally { setBusy(false) }
  }
  async function back()    { try { await invoke('browser_back',    {}); pollUrl() } catch {} }
  async function forward() { try { await invoke('browser_forward', {}); pollUrl() } catch {} }
  async function reload()  { try { await invoke('browser_reload',  {}); pollUrl() } catch {} }

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
            <>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-meta">
                <Link2 size={11} /> <span className="font-mono truncate">{currentUrl}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={back}    title="Back"    className="p-1 rounded hover:bg-white/5"><ChevronLeft size={11} /></button>
                  <button onClick={forward} title="Forward" className="p-1 rounded hover:bg-white/5"><ChevronRight size={11} /></button>
                  <button onClick={reload}  title="Reload"  className="p-1 rounded hover:bg-white/5"><RefreshCw size={10} /></button>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Click / Type / Extract */}
        {currentUrl && (
          <div className="grid grid-cols-3 gap-3">
            <Card padding="sm">
              <div className="flex items-center gap-2 mb-2">
                <MousePointerClick size={11} className="text-[rgb(var(--c-primary-2))]" />
                <span className="text-[10px] font-bold text-heading uppercase tracking-[0.18em]">Click</span>
                <Chip className="ml-auto">browser_click</Chip>
              </div>
              <input value={clickSel} onChange={e => setClickSel(e.target.value)} placeholder="button.primary"
                     className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[11px] font-mono text-body outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
              <Button size="sm" onClick={doClick} disabled={busy} className="mt-2 w-full">Click selector</Button>
            </Card>

            <Card padding="sm">
              <div className="flex items-center gap-2 mb-2">
                <Keyboard size={11} className="text-[rgb(var(--c-primary-2))]" />
                <span className="text-[10px] font-bold text-heading uppercase tracking-[0.18em]">Type</span>
                <Chip className="ml-auto">browser_type</Chip>
              </div>
              <input value={typeSel} onChange={e => setTypeSel(e.target.value)} placeholder="input[name='q']"
                     className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[11px] font-mono text-body outline-none focus:border-[rgb(var(--c-primary)/0.6)] mb-1.5" />
              <input value={typeText} onChange={e => setTypeText(e.target.value)} placeholder="text to type"
                     className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[11px] text-body outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
              <Button size="sm" onClick={doType} disabled={busy || !typeText} className="mt-2 w-full">Type</Button>
            </Card>

            <Card padding="sm">
              <div className="flex items-center gap-2 mb-2">
                <Copy size={11} className="text-[rgb(var(--c-primary-2))]" />
                <span className="text-[10px] font-bold text-heading uppercase tracking-[0.18em]">Extract</span>
                <Chip className="ml-auto">browser_extract</Chip>
              </div>
              <input value={extractSel} onChange={e => setExtractSel(e.target.value)} placeholder="article h1"
                     className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[11px] font-mono text-body outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
              <Button size="sm" onClick={doExtract} disabled={busy} className="mt-2 w-full">Read text</Button>
            </Card>
          </div>
        )}

        {currentUrl && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="soft" icon={<ScanLine size={11} />} onClick={snapshot} disabled={busy}>A11y snapshot</Button>
            <Button size="sm" variant="soft" icon={<Camera size={11} />}   onClick={screenshot} disabled={busy}>Screenshot</Button>
            <span className="text-[10px] text-meta">Snapshot → 120 interactive elements. Screenshot → browser window PNG (macOS).</span>
          </div>
        )}

        {action && <div className="text-[11px] text-meta">{action}</div>}
        {extracted && (
          <Card padding="sm">
            <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-1">Extracted / snapshot</div>
            <pre className="text-[11px] text-body font-mono whitespace-pre-wrap">{extracted}</pre>
          </Card>
        )}
        {shot && (
          <Card padding="sm">
            <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-1">Screenshot</div>
            <img src={shot} className="w-full rounded-md border border-white/10" />
          </Card>
        )}

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
