// /apps — v1's App Store, port-in-progress. Lists repo/stack resources
// for now; full marketplace + one-click deploy lands in M6.

import { Boxes } from 'lucide-react'
import { InfraShell } from './_shared'

export default function AppsScreen() {
  return (
    <InfraShell
      title="Apps"
      subtitle="Installed stacks and managed applications across your fleet."
      kind="repo"
      icon={<Boxes size={20} />}
      emptyHint={
        <>
          Add a repo resource in <b>Fleet</b> to register an app, or describe it to the AI:
          <br />
          <code className="bg-white/5 rounded px-1 font-mono">deploy nextcloud on Mac mini</code>
        </>
      }
    />
  )
}
