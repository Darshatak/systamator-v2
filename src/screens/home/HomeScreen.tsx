import { Command, Inbox, Activity, Sparkles } from 'lucide-react'

export default function HomeScreen({ onPalette }: { onPalette: () => void }) {
  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
        <section className="mb-10">
          <h1 className="text-3xl font-bold text-heading mb-2">Your control room.</h1>
          <p className="text-meta text-[14px] mb-6 max-w-2xl">
            Hand the team a goal. Conductor decomposes, your agents execute, Critic checks, Skills accumulate.
          </p>
          <button onClick={onPalette}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-[13px] font-semibold shadow-md hover:opacity-90">
            <Command size={14} /> Open command palette · ⌘K
          </button>
        </section>

        <div className="grid grid-cols-3 gap-4">
          <Card icon={Inbox}    title="Inbox"        hint="Approvals, ambiguity, escalations." count={0} />
          <Card icon={Activity} title="Active runs"  hint="Live agent work in progress."        count={0} />
          <Card icon={Sparkles} title="Skills learned" hint="What the team has figured out."    count={0} />
        </div>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-white/8">
      <div className="text-[12px] font-bold text-heading uppercase tracking-wider">Home</div>
      <div className="text-[11px] text-meta">M0 · Foundation</div>
    </div>
  )
}

function Card({ icon: Icon, title, hint, count }: { icon: typeof Inbox; title: string; hint: string; count: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className="text-primary" />
        <span className="text-[11px] font-bold text-heading uppercase tracking-wider">{title}</span>
        <span className="ml-auto text-[14px] font-bold text-heading">{count}</span>
      </div>
      <div className="text-[12px] text-meta">{hint}</div>
    </div>
  )
}
