import type { ReactNode } from 'react'

export function Empty({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8 py-12">
      <div className="w-14 h-14 rounded-2xl gradient-primary text-white flex items-center justify-center shadow-xl mb-4">
        {icon}
      </div>
      <div className="text-[16px] font-semibold text-heading">{title}</div>
      {hint && <div className="text-[12px] text-meta mt-1.5 max-w-md leading-relaxed">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
