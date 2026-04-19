import { useEffect, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import type { Skill } from '@/types/domain'

export default function SkillsScreen() {
  const [skills, setSkills] = useState<Skill[] | null>(null)
  useEffect(() => { invoke<Skill[]>('skill_list', {}).then(setSkills).catch(() => setSkills([])) }, [])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/8">
        <div className="text-[12px] font-bold text-heading uppercase tracking-wider">Skills</div>
        <div className="text-[11px] text-meta">OpenSpace wiring lands in M2</div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {skills === null && <div className="text-meta text-[12px] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> loading…</div>}
        {skills && skills.length === 0 && (
          <div className="text-center py-20">
            <Sparkles size={28} className="text-primary mx-auto mb-2" />
            <p className="text-[12px] text-meta">No skills yet — they'll be distilled after each run.</p>
          </div>
        )}
        {skills && skills.length > 0 && (
          <div className="space-y-2">
            {skills.map(s => (
              <div key={s.id} className="rounded-xl border border-white/10 bg-surface p-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={11} className="text-primary" />
                  <span className="text-[12px] font-semibold text-heading">{s.title}</span>
                  <span className="ml-auto text-[10px] text-meta">{s.successCount}/{s.successCount + s.failureCount}</span>
                </div>
                <div className="text-[11px] text-meta mt-1">{s.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
