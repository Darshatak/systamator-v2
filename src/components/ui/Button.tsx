import type { ReactNode } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'ghost' | 'soft' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export function Button({
  children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', className = '', icon,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: Variant
  size?: Size
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  icon?: ReactNode
}) {
  const sizeCls = size === 'sm' ? 'h-7 px-2.5 text-[11px]' :
                  size === 'lg' ? 'h-11 px-5 text-[14px]' :
                                  'h-9 px-3.5 text-[12px]'
  const variantCls = {
    primary: 'gradient-primary text-white shadow-md hover:opacity-95',
    ghost:   'text-meta hover:text-heading hover:bg-white/5 border border-transparent',
    soft:    'bg-[rgb(var(--c-surface-2))] text-heading border border-[rgb(var(--c-border-2))] hover:bg-[rgb(var(--c-surface-2)/0.7)]',
    danger:  'bg-[rgb(var(--c-danger)/0.12)] text-[rgb(var(--c-danger))] border border-[rgb(var(--c-danger)/0.4)] hover:bg-[rgb(var(--c-danger)/0.2)]',
  }[variant]

  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-xl font-semibold transition-all',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        sizeCls, variantCls, className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}
