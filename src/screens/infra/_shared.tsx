// Shared scaffolding for the infrastructure-first placeholder screens.
// Each infra page renders an InfraShell with a header, one or two CTA
// chips, and a resource roll-up if the backend resource_list exposes
// anything for that kind. The real-body implementations land in M6.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, Chip, Empty, TopBar, Button } from '@/components/ui'
import { MessageSquare } from 'lucide-react'
import { invoke } from '@/lib/ipc'

interface Resource {
  id:    string
  kind:  string
  name:  string
  meta:  Record<string, unknown>
}

export function InfraShell({
  title, subtitle, kind, emptyHint, icon,
}: {
  title: string
  subtitle: string
  kind: string | null
  emptyHint: ReactNode
  icon: ReactNode
}) {
  const [rows, setRows] = useState<Resource[] | null>(null)

  useEffect(() => {
    if (!kind) { setRows([]); return }
    invoke<Resource[]>('resource_list', { kind })
      .then(setRows)
      .catch(() => setRows([]))
  }, [kind])

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title={title}
        subtitle={subtitle}
        actions={
          <Link to={`/chat?prefill=${encodeURIComponent(`${title.toLowerCase()}: `)}`}>
            <Button size="sm" variant="primary" icon={<MessageSquare size={12} />}>Ask AI</Button>
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto px-7 py-6">
        {rows === null && <div className="text-[12px] text-meta">loading…</div>}
        {rows && rows.length === 0 && (
          <Empty icon={icon} title={`No ${title.toLowerCase()} yet`} hint={emptyHint} />
        )}
        {rows && rows.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {rows.map(r => (
              <Card key={r.id} padding="sm" className="lift">
                <div className="flex items-center gap-2">
                  <Chip tone="primary">{r.kind}</Chip>
                  <span className="text-[12px] font-semibold text-heading truncate">{r.name}</span>
                </div>
                {/* Free-form meta peek — each infra page refines this later. */}
                <pre className="text-[10px] text-meta font-mono mt-2 whitespace-pre-wrap leading-snug">
                  {JSON.stringify(r.meta, null, 2).slice(0, 220)}
                </pre>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
