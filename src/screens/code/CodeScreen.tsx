// Code screen — the Coder agent's workspace.
//
// Left: workspace picker + file tree (one dir at a time, breadcrumb nav).
// Right: file viewer / diff preview / run output. Top: run-command field.

import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, File, FileText, Terminal, GitBranch, Folder, ChevronRight, Loader2, Play, Save, RefreshCw, Layers, Trash2, Plus } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { Card, Chip, TopBar, Button, Empty } from '@/components/ui'
import clsx from 'clsx'

interface FsEntry { name: string; path: string; isDir: boolean; size: number; modified: number }
interface FsRead  { path: string; bytes: number; truncated: boolean; text: string }
interface RunShellResult { stdout: string; stderr: string; exitCode: number; wallMs: number }
interface GitStatus { branch: string; upstream: string | null; ahead: number; behind: number; staged: string[]; modified: string[]; untracked: string[] }
interface WorktreeInfo { id: string; path: string; repo: string; branch: string; createdAt: number }

const LS_WS = 'systamator.code.workspace'

export default function CodeScreen() {
  const [workspace, setWorkspace] = useState<string>(() => localStorage.getItem(LS_WS) ?? '~')
  const [cwd, setCwd]             = useState<string>(() => localStorage.getItem(LS_WS) ?? '~')
  const [entries, setEntries]     = useState<FsEntry[] | null>(null)
  const [active,  setActive]      = useState<FsEntry | null>(null)
  const [file,    setFile]        = useState<FsRead | null>(null)
  const [editing, setEditing]     = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [run,     setRun]         = useState<RunShellResult | null>(null)
  const [running, setRunning]     = useState(false)
  const [cmd,     setCmd]         = useState<string>('pwd && ls -la')
  const [git,     setGit]         = useState<GitStatus | null>(null)
  const [gitErr,  setGitErr]      = useState<string | null>(null)
  const [diff,    setDiff]        = useState<string | null>(null)
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [wtBusy, setWtBusy]       = useState(false)

  async function loadDir(path: string) {
    setEntries(null); setActive(null); setFile(null); setEditing(null)
    try { setEntries(await invoke<FsEntry[]>('fs_list_dir', { path })); setCwd(path) }
    catch (e) { setEntries([]); setRun({ stdout: '', stderr: String((e as Error)?.message ?? e), exitCode: -1, wallMs: 0 }) }
  }

  async function loadGit() {
    setGit(null); setGitErr(null)
    try { setGit(await invoke<GitStatus>('git_status', { cwd: workspace })) }
    catch (e) { setGitErr(String((e as Error)?.message ?? e)) }
  }

  async function loadWorktrees() {
    try { setWorktrees(await invoke<WorktreeInfo[]>('worktree_list', {})) }
    catch { setWorktrees([]) }
  }

  async function createWorktree() {
    setWtBusy(true)
    try {
      const runId = `adhoc-${Date.now().toString(36)}`
      await invoke('worktree_create', { repoPath: workspace, runId })
      await loadWorktrees()
    } catch (e) { alert(`worktree_create failed: ${String((e as Error)?.message ?? e)}`) }
    finally { setWtBusy(false) }
  }

  async function removeWorktree(id: string, repo: string) {
    setWtBusy(true)
    try { await invoke('worktree_remove', { runId: id, repoPath: repo }); await loadWorktrees() }
    catch (e) { alert(`worktree_remove failed: ${String((e as Error)?.message ?? e)}`) }
    finally { setWtBusy(false) }
  }

  async function openFile(e: FsEntry) {
    setActive(e); setFile(null); setEditing(null)
    if (e.isDir) { loadDir(e.path); return }
    try { const f = await invoke<FsRead>('fs_read', { path: e.path }); setFile(f); setEditing(f.text) }
    catch (err) { setRun({ stdout: '', stderr: String((err as Error)?.message ?? err), exitCode: -1, wallMs: 0 }) }
  }

  async function save() {
    if (!active || editing === null) return
    setSaving(true); setDiff(null)
    try {
      const r = await invoke<{ diff: string }>('fs_write_with_diff', { path: active.path, content: editing })
      setDiff(r.diff)
      // Re-read to sync bytes/truncated
      const fresh = await invoke<FsRead>('fs_read', { path: active.path })
      setFile(fresh)
      loadGit()
    } catch (e) { setDiff(`Error: ${String((e as Error)?.message ?? e)}`) }
    finally { setSaving(false) }
  }

  async function exec() {
    setRunning(true); setRun(null)
    try { setRun(await invoke<RunShellResult>('run_shell', { cwd: workspace, command: cmd })) }
    catch (e) { setRun({ stdout: '', stderr: String((e as Error)?.message ?? e), exitCode: -1, wallMs: 0 }) }
    finally { setRunning(false) }
  }

  useEffect(() => { localStorage.setItem(LS_WS, workspace); loadDir(workspace); loadGit(); loadWorktrees() /* eslint-disable-next-line */ }, [workspace])

  const breadcrumbs = useMemo(() => cwd.replace(/^\/+/, '').split('/').filter(Boolean), [cwd])

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title="Code"
        subtitle="Coder agent workspace. Read / edit / run / diff. Every path is confined to your workspace root."
        actions={<>
          <input value={workspace} onChange={e => setWorkspace(e.target.value)}
                 placeholder="/absolute/path or ~/relative"
                 className="h-8 w-[260px] px-2 rounded-md border border-white/10 bg-white/5 text-[11px] font-mono text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
          <Button size="sm" variant="soft" icon={<FolderOpen size={11} />} onClick={() => loadDir(workspace)}>Reload</Button>
        </>}
      />

      <div className="flex-1 flex min-h-0">
        {/* File tree */}
        <aside className="w-[280px] flex-shrink-0 border-r border-white/8 flex flex-col">
          <div className="px-3 py-2 border-b border-white/8">
            <div className="flex items-center gap-1 text-[10px] text-meta overflow-hidden">
              <Folder size={10} className="flex-shrink-0" />
              <span className="truncate font-mono">{cwd}</span>
            </div>
            {breadcrumbs.length > 0 && (
              <div className="mt-1 flex items-center gap-0.5 text-[10px] overflow-x-auto">
                {breadcrumbs.map((b, i) => (
                  <span key={i} className="flex items-center gap-0.5">
                    <button onClick={() => loadDir('/' + breadcrumbs.slice(0, i + 1).join('/'))}
                            className="text-body hover:text-heading">{b}</button>
                    {i < breadcrumbs.length - 1 && <ChevronRight size={9} className="text-meta" />}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {entries === null && <Loader2 size={12} className="animate-spin text-meta m-2" />}
            {entries && cwd !== '/' && (
              <button onClick={() => loadDir(cwd.replace(/\/[^/]+\/?$/, '') || '/')}
                      className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-[11px] text-meta hover:bg-white/5 hover:text-heading">
                <ChevronRight size={11} className="rotate-180" /> up
              </button>
            )}
            {entries?.map(e => (
              <button key={e.path} onClick={() => openFile(e)}
                      className={clsx('flex items-center gap-2 w-full px-2 py-1 rounded-md text-left text-[11px] hover:bg-white/5',
                        active?.path === e.path ? 'bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))]' : 'text-body')}>
                {e.isDir ? <Folder size={11} className="text-meta" /> : <FileText size={11} className="text-meta" />}
                <span className="truncate font-mono">{e.name}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main pane */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 space-y-3">
          {/* Git status */}
          {git && (
            <Card padding="sm">
              <div className="flex items-center gap-2 mb-1">
                <GitBranch size={12} className="text-[rgb(var(--c-primary-2))]" />
                <span className="text-[11px] font-bold text-heading">{git.branch}</span>
                {git.upstream && <span className="text-[10px] text-meta">→ {git.upstream}</span>}
                {git.ahead > 0 && <Chip tone="info">↑{git.ahead}</Chip>}
                {git.behind > 0 && <Chip tone="warn">↓{git.behind}</Chip>}
                {git.staged.length   > 0 && <Chip tone="primary">staged {git.staged.length}</Chip>}
                {git.modified.length > 0 && <Chip tone="warn">modified {git.modified.length}</Chip>}
                {git.untracked.length> 0 && <Chip>untracked {git.untracked.length}</Chip>}
                <button onClick={loadGit} className="ml-auto p-1 rounded hover:bg-white/5"><RefreshCw size={10} /></button>
              </div>
            </Card>
          )}
          {gitErr && <div className="text-[11px] text-meta">git: not a repo (or git missing)</div>}

          {/* Worktrees */}
          <Card padding="sm">
            <div className="flex items-center gap-2 mb-2">
              <Layers size={12} className="text-[rgb(var(--c-primary-2))]" />
              <span className="text-[11px] font-bold text-heading uppercase tracking-[0.18em]">Worktrees</span>
              <Chip className="ml-auto">{worktrees.length}</Chip>
              <Button size="sm" variant="soft" icon={<Plus size={11} />} onClick={createWorktree} disabled={wtBusy}>New</Button>
            </div>
            {worktrees.length === 0 ? (
              <div className="text-[11px] text-meta">No worktrees. Creating one spawns <code className="bg-white/5 rounded px-1 font-mono">git worktree add -b systamator/&lt;id&gt;</code> under <code className="bg-white/5 rounded px-1 font-mono">~/.systamator/worktrees/</code> so parallel runs stay isolated.</div>
            ) : (
              <div className="space-y-1">
                {worktrees.map(w => (
                  <div key={w.id} className="flex items-center gap-2 text-[11px] px-2 py-1 rounded-md bg-white/[0.02]">
                    <span className="font-mono text-body truncate flex-1">{w.path}</span>
                    <Chip tone="primary">{w.branch.replace('systamator/', '')}</Chip>
                    <button title="Remove" onClick={() => removeWorktree(w.id, w.repo)}
                            className="p-1 rounded-md text-[rgb(var(--c-danger))] hover:bg-[rgb(var(--c-danger)/0.1)]">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* File viewer / editor */}
          {file && active && !active.isDir && (
            <Card>
              <div className="flex items-center gap-2 mb-2">
                <File size={12} className="text-[rgb(var(--c-primary-2))]" />
                <span className="text-[12px] font-mono text-heading">{active.name}</span>
                <Chip className="ml-auto">{file.bytes} B{file.truncated ? ' · truncated' : ''}</Chip>
                <Button size="sm" variant="primary" icon={saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                        onClick={save} disabled={saving || editing === file.text}>Save</Button>
              </div>
              <textarea value={editing ?? file.text} onChange={e => setEditing(e.target.value)}
                        rows={20} spellCheck={false}
                        className="w-full bg-white/[0.02] border border-white/10 rounded-md px-2 py-2 text-[11px] font-mono text-body outline-none focus:border-[rgb(var(--c-primary)/0.6)] leading-relaxed" />
            </Card>
          )}
          {diff && (
            <Card padding="sm">
              <div className="text-[10px] font-bold text-meta uppercase tracking-[0.18em] mb-1">Diff</div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed">
                {diff.split('\n').map((line, i) => (
                  <span key={i} className={
                    line.startsWith('+ ') ? 'text-[rgb(var(--c-success))]' :
                    line.startsWith('- ') ? 'text-[rgb(var(--c-danger))]'  :
                                            'text-meta'
                  }>{line + '\n'}</span>
                ))}
              </pre>
            </Card>
          )}

          {/* Shell */}
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Terminal size={12} className="text-[rgb(var(--c-primary-2))]" />
              <span className="text-[11px] font-bold text-heading uppercase tracking-[0.18em]">Shell</span>
              <Chip className="ml-auto">run_shell</Chip>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-meta font-mono truncate">{workspace} $</span>
              <input value={cmd} onChange={e => setCmd(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter') exec() }}
                     className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[11px] font-mono text-body outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
              <Button size="sm" onClick={exec} disabled={running || !cmd.trim()}
                      icon={running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}>Run</Button>
            </div>
            {run && (
              <div className="mt-3">
                <div className="flex items-center gap-2 text-[10px] text-meta mb-1">
                  <span>exit {run.exitCode}</span>
                  <span>·</span>
                  <span>{run.wallMs}ms</span>
                </div>
                {run.stdout && <pre className="text-[11px] text-body font-mono whitespace-pre-wrap bg-white/[0.03] border border-white/5 rounded-md p-2 mb-1 leading-relaxed">{run.stdout}</pre>}
                {run.stderr && <pre className="text-[11px] text-[rgb(var(--c-danger))] font-mono whitespace-pre-wrap bg-[rgb(var(--c-danger)/0.06)] border border-[rgb(var(--c-danger)/0.2)] rounded-md p-2 leading-relaxed">{run.stderr}</pre>}
              </div>
            )}
          </Card>

          {(!entries || entries.length === 0) && !file && !run && (
            <Empty icon={<FolderOpen size={20} />} title="Empty workspace"
                   hint="Point the workspace input at a folder — default ~ lists your home directory." />
          )}
        </main>
      </div>
    </div>
  )
}
