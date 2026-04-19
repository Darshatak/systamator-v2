import { Target, Plus } from 'lucide-react'

export default function GoalsScreen() {
  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <Target size={32} className="text-primary mb-3" />
        <h2 className="text-[15px] font-semibold text-heading mb-1">No goals yet</h2>
        <p className="text-[12px] text-meta mb-4 max-w-md">
          A goal is one sentence. Hit ⌘K and type what you want done — Conductor picks it up from there.
        </p>
        <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-white text-[12px] font-semibold hover:opacity-90">
          <Plus size={11} /> New goal (M1)
        </button>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-white/8">
      <div className="text-[12px] font-bold text-heading uppercase tracking-wider">Goals</div>
      <div className="text-[11px] text-meta">Vibe-Kanban-style board lands in M4</div>
    </div>
  )
}
