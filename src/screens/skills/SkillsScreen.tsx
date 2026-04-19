import { useEffect, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import type { Skill } from '@/types/domain'
import { Card, Chip, Empty, TopBar } from '@/components/ui'

export default function SkillsScreen() {
  const [skills, setSkills] = useState<Skill[] | null>(null)
  useEffect(() => { invoke<Skill[]>('skill_list', {}).then(setSkills).catch(() => setSkills([])) }, [])

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Skills" subtitle="What the team has learned. Auto-distilled per run; OpenSpace wiring lands in M2." />

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {skills === null && <div className="text-meta text-[12px] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> loading…</div>}
        {skills && skills.length === 0 && (
          <Empty
            icon={<Sparkles size={20} />}
            title="No skills yet"
            hint="Skills get distilled after each successful run, then re-used as few-shot demos for similar goals."
          />
        )}
        {skills && skills.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {skills.map(s => (
              <Card key={s.id}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={12} className="text-[rgb(var(--c-primary-2))]" />
                  <span className="text-[12px] font-semibold text-heading">{s.title}</span>
                  <Chip tone="primary" className="ml-auto">{s.origin}</Chip>
                </div>
                <div className="text-[11px] text-meta leading-relaxed">{s.description}</div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/8">
                  <Chip tone="success">{s.successCount} wins</Chip>
                  {s.failureCount > 0 && <Chip tone="danger">{s.failureCount} losses</Chip>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
