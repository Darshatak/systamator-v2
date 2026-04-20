// Skills screen — distilled + marketplace.
//
// Export bundles the full skill library to a JSON file. Import reads a
// local file. Fetch remote pulls from any URL (GitHub blob URLs get
// auto-rewritten to raw.).

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2, Download, Upload, Globe, RefreshCw, Check, AlertTriangle } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import type { Skill } from '@/types/domain'
import { Card, Chip, Empty, TopBar, Button } from '@/components/ui'

export default function SkillsScreen() {
  const [skills, setSkills]     = useState<Skill[] | null>(null)
  const [busy, setBusy]         = useState<null | 'export' | 'import' | 'remote' | 'reindex'>(null)
  const [status, setStatus]     = useState<{ ok: boolean; text: string } | null>(null)
  const [remoteUrl, setRemoteUrl] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  async function refresh() {
    try { setSkills(await invoke<Skill[]>('skill_list', {})) }
    catch { setSkills([]) }
  }
  useEffect(() => { refresh() }, [])

  async function doExport() {
    setBusy('export'); setStatus(null)
    try {
      const json = await invoke<string>('skill_export', {})
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `systamator-skills-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setStatus({ ok: true, text: `Exported ${(skills?.length ?? 0)} skills` })
    } catch (e) { setStatus({ ok: false, text: String((e as Error)?.message ?? e) }) }
    finally { setBusy(null) }
  }

  async function doImportFile(file: File) {
    setBusy('import'); setStatus(null)
    try {
      const text = await file.text()
      const added = await invoke<number>('skill_import', { bundleJson: text })
      setStatus({ ok: true, text: `Imported ${added} new skills from ${file.name}` })
      await refresh()
    } catch (e) { setStatus({ ok: false, text: String((e as Error)?.message ?? e) }) }
    finally { setBusy(null) }
  }

  async function doFetchRemote() {
    if (!remoteUrl.trim()) return
    setBusy('remote'); setStatus(null)
    try {
      const added = await invoke<number>('skill_fetch_remote', { url: remoteUrl.trim() })
      setStatus({ ok: true, text: `Imported ${added} new skills from remote` })
      setRemoteUrl('')
      await refresh()
    } catch (e) { setStatus({ ok: false, text: String((e as Error)?.message ?? e) }) }
    finally { setBusy(null) }
  }

  async function doReindex() {
    setBusy('reindex'); setStatus(null)
    try {
      const n = await invoke<number>('skill_reindex', {})
      setStatus({ ok: true, text: `Reindexed ${n} skills` })
    } catch (e) { setStatus({ ok: false, text: String((e as Error)?.message ?? e) }) }
    finally { setBusy(null) }
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title="Skills"
        subtitle="Team memory. Distilled per run · cosine-searched before planning · shareable as JSON bundles."
        actions={<>
          <Button size="sm" variant="ghost" icon={busy === 'reindex' ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  onClick={doReindex} disabled={!!busy}>Reindex</Button>
          <Button size="sm" variant="soft"  icon={busy === 'export' ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                  onClick={doExport} disabled={!!busy || !skills?.length}>Export</Button>
          <Button size="sm" variant="primary" icon={busy === 'import' ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                  onClick={() => fileInput.current?.click()} disabled={!!busy}>Import file</Button>
          <input ref={fileInput} type="file" accept=".json,application/json" className="hidden"
                 onChange={e => { const f = e.target.files?.[0]; if (f) doImportFile(f); e.target.value = '' }} />
        </>}
      />

      <div className="flex-1 overflow-y-auto px-7 py-6 space-y-4">
        {/* Remote fetch */}
        <Card padding="sm">
          <div className="flex items-center gap-2">
            <Globe size={13} className="text-[rgb(var(--c-primary-2))]" />
            <span className="text-[11px] font-bold text-heading uppercase tracking-[0.18em]">Fetch remote bundle</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} placeholder="https://github.com/.../skills.json  (blob URLs auto-rewrite to raw.)"
                   onKeyDown={e => { if (e.key === 'Enter') doFetchRemote() }}
                   className="flex-1 h-8 px-2 rounded-md border border-white/10 bg-white/5 text-[11px] font-mono text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
            <Button size="sm" onClick={doFetchRemote} disabled={!!busy || !remoteUrl.trim()}>
              {busy === 'remote' ? <Loader2 size={11} className="animate-spin" /> : 'Fetch'}
            </Button>
          </div>
        </Card>

        {status && (
          <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] ${status.ok ? 'border-[rgb(var(--c-success)/0.4)] bg-[rgb(var(--c-success)/0.08)] text-[rgb(var(--c-success))]' : 'border-[rgb(var(--c-danger)/0.4)] bg-[rgb(var(--c-danger)/0.08)] text-[rgb(var(--c-danger))]'}`}>
            {status.ok ? <Check size={12} className="mt-0.5" /> : <AlertTriangle size={12} className="mt-0.5" />}
            <span>{status.text}</span>
          </div>
        )}

        {skills === null && <div className="text-meta text-[12px] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> loading…</div>}
        {skills && skills.length === 0 && (
          <Empty icon={<Sparkles size={20} />} title="No skills yet"
                 hint="Distilled automatically after each run. You can also import a bundle above to seed the library." />
        )}
        {skills && skills.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {skills.map(s => (
              <Card key={s.id}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={12} className="text-[rgb(var(--c-primary-2))]" />
                  <span className="text-[12px] font-semibold text-heading">{s.title}</span>
                  <Chip tone="primary" className="ml-auto">{s.origin}</Chip>
                </div>
                <div className="text-[11px] text-meta leading-relaxed">{s.description}</div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/8">
                  <Chip tone="success">{s.successCount} wins</Chip>
                  {s.failureCount > 0 && <Chip tone="danger">{s.failureCount} losses</Chip>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
