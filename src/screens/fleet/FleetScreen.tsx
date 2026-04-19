import { useEffect, useState } from 'react'
import { Server, Plus, Cpu, Database, Globe, Plug, GitBranch, Loader2 } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import type { Resource } from '@/types/domain'

const KIND_ICON: Record<Resource['kind'], typeof Server> = {
  ssh: Server, docker: Cpu, db: Database, browser: Globe, mcp: Plug, repo: GitBranch, github: GitBranch,
}

export default function FleetScreen() {
  const [resources, setResources] = useState<Resource[] | null>(null)
  useEffect(() => {
    invoke<Resource[]>('resource_list', {}).then(setResources).catch(() => setResources([]))
  }, [])

  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto p-6">
        {resources === null && (
          <div className="text-meta text-[12px] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> loading…</div>
        )}
        {resources && resources.length === 0 && <Empty />}
        {resources && resources.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {resources.map(r => {
              const Icon = KIND_ICON[r.kind] ?? Server
              return (
                <div key={r.id} className="rounded-xl border border-white/10 bg-surface p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={13} className="text-primary" />
                    <span className="text-[12px] font-semibold text-heading truncate">{r.name}</span>
                  </div>
                  <div className="text-[10px] text-meta uppercase tracking-wider">{r.kind}</div>
                  <div className="text-[11px] text-meta mt-1 truncate">{r.tags.join(' · ')}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-white/8">
      <div className="text-[12px] font-bold text-heading uppercase tracking-wider">Fleet</div>
      <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-white text-[11px] font-semibold">
        <Plus size={11} /> Add resource
      </button>
    </div>
  )
}

function Empty() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <Server size={32} className="text-primary mb-3" />
      <h2 className="text-[15px] font-semibold text-heading mb-1">Empty fleet</h2>
      <p className="text-[12px] text-meta max-w-md">
        Add SSH servers, Docker daemons, databases, browser profiles, MCP servers and code repos here.
        Agents reach for them by name.
      </p>
    </div>
  )
}
