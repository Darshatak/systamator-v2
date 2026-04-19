import { useEffect, useState } from 'react'
import { Server, Plus, Cpu, Database, Globe, Plug, GitBranch, Loader2 } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import type { Resource } from '@/types/domain'
import { Card, Chip, Empty, TopBar, Button, StatusDot } from '@/components/ui'

const KIND_ICON: Record<Resource['kind'], typeof Server> = {
  ssh: Server, docker: Cpu, db: Database, browser: Globe, mcp: Plug, repo: GitBranch, github: GitBranch,
}

export default function FleetScreen() {
  const [resources, setResources] = useState<Resource[] | null>(null)
  useEffect(() => { invoke<Resource[]>('resource_list', {}).then(setResources).catch(() => setResources([])) }, [])

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title="Fleet"
        subtitle="Resources your agents can reach for. SSH, Docker, databases, browsers, MCP, repos."
        actions={<Button icon={<Plus size={12} />} variant="primary" size="sm">Add resource</Button>}
      />

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {resources === null && (
          <div className="text-meta text-[12px] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> loading…</div>
        )}
        {resources && resources.length === 0 && (
          <Empty
            icon={<Server size={20} />}
            title="Empty fleet"
            hint="Add SSH servers, Docker daemons, databases, browser profiles, MCP servers and code repos here. Agents reach for them by name."
            action={<Button icon={<Plus size={12} />} variant="soft" size="sm">Add SSH server</Button>}
          />
        )}
        {resources && resources.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {resources.map(r => {
              const Icon = KIND_ICON[r.kind] ?? Server
              return (
                <Card key={r.id} onClick={() => {}}>
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))] flex items-center justify-center flex-shrink-0">
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-heading truncate">{r.name}</div>
                      <div className="text-[10px] text-meta uppercase tracking-wider">{r.kind}</div>
                    </div>
                    <StatusDot status="idle" />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.tags.map(t => <Chip key={t}>{t}</Chip>)}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
