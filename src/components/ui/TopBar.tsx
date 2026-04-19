import type { ReactNode } from 'react'

export function TopBar({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-7 py-4 border-b border-white/8 backdrop-blur-md">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[rgb(var(--c-primary-2))]">Systamator</div>
        <div className="text-[18px] font-bold text-heading leading-tight">{title}</div>
        {subtitle && <div className="text-[12px] text-meta mt-0.5">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  )
}
