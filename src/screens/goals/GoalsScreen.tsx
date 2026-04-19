import { Target, Plus } from 'lucide-react'
import { Empty, TopBar, Button } from '@/components/ui'

export default function GoalsScreen() {
  return (
    <div className="h-full flex flex-col">
      <TopBar
        title="Goals"
        subtitle="Your work board. Vibe-Kanban-style worktree isolation lands in M4."
        actions={<Button icon={<Plus size={12} />} variant="primary" size="sm">New goal</Button>}
      />
      <div className="flex-1 overflow-hidden">
        <Empty
          icon={<Target size={20} />}
          title="No goals yet"
          hint="A goal is one sentence. Open the palette (⌘K) and describe what you want done — Conductor picks it up from there."
        />
      </div>
    </div>
  )
}
