// /containers — Docker containers across hosts. Surfaces docker
// resources registered in Fleet. Live inspect / logs / exec land in M6
// once the orchestrator exposes a docker IC.

import { Container } from 'lucide-react'
import { InfraShell } from './_shared'

export default function ContainersScreen() {
  return (
    <InfraShell
      title="Containers"
      subtitle="Docker containers on every registered host — status, logs, restart."
      kind="docker"
      icon={<Container size={20} />}
      emptyHint={
        <>
          Register a docker host in <b>Fleet</b>, or ask the AI:
          <br />
          <code className="bg-white/5 rounded px-1 font-mono">list containers on prod-1</code>
        </>
      }
    />
  )
}
