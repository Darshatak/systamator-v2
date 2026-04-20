// /flows — n8n-style automations. Reuses v1's workflow metaphor:
// trigger → step chain → agent tools. Placeholder; full editor in M6.

import { Workflow } from 'lucide-react'
import { InfraShell } from './_shared'

export default function FlowsScreen() {
  return (
    <InfraShell
      title="Flows"
      subtitle="Event-driven automations — trigger an agent chain on webhook, file change, or cron."
      kind={null}
      icon={<Workflow size={20} />}
      emptyHint={
        <>
          M6 adds a visual editor. Today you can describe a flow in Chat:
          <br />
          <code className="bg-white/5 rounded px-1 font-mono">when a GitHub issue is opened in repo X, draft a PR</code>
        </>
      }
    />
  )
}
