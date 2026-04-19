import type { ReactNode } from 'react'
import clsx from 'clsx'

type Tone = 'default' | 'primary' | 'success' | 'warn' | 'danger' | 'info'

export function Chip({
  children, tone = 'default', icon, className = '',
}: {
  children: ReactNode
  tone?: Tone
  icon?: ReactNode
  className?: string
}) {
  const toneCls = {
    default: 'bg-white/5 text-meta border border-white/10',
    primary: 'bg-[rgb(var(--c-primary)/0.14)] text-[rgb(var(--c-primary-2))] border border-[rgb(var(--c-primary)/0.3)]',
    success: 'bg-[rgb(var(--c-success)/0.12)] text-[rgb(var(--c-success))] border border-[rgb(var(--c-success)/0.3)]',
    warn:    'bg-[rgb(var(--c-warn)/0.12)]    text-[rgb(var(--c-warn))]    border border-[rgb(var(--c-warn)/0.3)]',
    danger:  'bg-[rgb(var(--c-danger)/0.12)]  text-[rgb(var(--c-danger))]  border border-[rgb(var(--c-danger)/0.3)]',
    info:    'bg-[rgb(var(--c-info)/0.12)]    text-[rgb(var(--c-info))]    border border-[rgb(var(--c-info)/0.3)]',
  }[tone]
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap', toneCls, className)}>
      {icon}
      {children}
    </span>
  )
}
