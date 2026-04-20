// Advanced settings tab — v1 import, data export, cache stats, log level.

import { useState } from 'react'
import { Download, ArrowRightLeft, Check, Loader2, AlertTriangle } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { Card, Button, Chip } from '@/components/ui'
import { DiagnosticsPanel } from './DiagnosticsPanel'

interface ImportReport {
  v1Path: string; exists: boolean
  sshFound: number; sshImported: number
  mcpFound: number; mcpImported: number
  errors: string[]
}

export function AdvancedTab() {
  const [importing, setImporting] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)

  async function runImport() {
    setImporting(true); setReport(null)
    try { setReport(await invoke<ImportReport>('v1_import', {})) }
    catch (e) { setReport({ v1Path: '', exists: false, sshFound: 0, sshImported: 0, mcpFound: 0, mcpImported: 0, errors: [String((e as Error)?.message ?? e)] }) }
    finally { setImporting(false) }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-[18px] font-bold text-heading mb-1">Advanced</h2>
        <p className="text-[12px] text-meta">Data migration, cache, log level, export.</p>
      </div>

      {/* v1 importer */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))] flex items-center justify-center flex-shrink-0">
            <ArrowRightLeft size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-heading">Import from Systamator v1</div>
            <div className="text-[11px] text-meta mt-0.5">
              Reads v1's SSH credentials + registered MCP servers from <code className="font-mono text-[10px]">~/Library/Application Support/com.systamator.app/</code>.
              SSH creds become Fleet resources + keychain secrets. MCP servers land untrusted — re-approve each in Settings → MCP.
            </div>
          </div>
          <Button onClick={runImport} disabled={importing}
                  icon={importing ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}>
            {importing ? 'Importing' : 'Run import'}
          </Button>
        </div>

        {report && (
          <div className="mt-3 border-t border-white/8 pt-3 text-[11px]">
            {!report.exists && (
              <div className="text-meta flex items-center gap-1"><AlertTriangle size={11} /> No v1 data found at <code className="font-mono">{report.v1Path}</code></div>
            )}
            {report.exists && (
              <div className="space-y-1">
                <div className="text-meta font-mono truncate">{report.v1Path}</div>
                <div className="flex items-center gap-2">
                  <Chip tone="success" icon={<Check size={9} />}>SSH {report.sshImported}/{report.sshFound}</Chip>
                  <Chip tone="primary">MCP {report.mcpImported}/{report.mcpFound}</Chip>
                </div>
                {report.errors.length > 0 && (
                  <ul className="text-[rgb(var(--c-danger))] space-y-0.5 mt-1">
                    {report.errors.map((e, i) => <li key={i}>· {e}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <DiagnosticsPanel />

      <Card>
        <div className="text-[12px] font-semibold text-heading mb-1">Export / backup</div>
        <div className="text-[11px] text-meta">Runs → signed ZIP export lands with the skill marketplace (M5.1).</div>
      </Card>
    </div>
  )
}
