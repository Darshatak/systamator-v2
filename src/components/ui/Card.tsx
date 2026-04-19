import type { ReactNode } from 'react'
import clsx from 'clsx'

export function Card({
  children, className = '', glow = false, padding = 'md', as = 'div',
  onClick,
}: {
  children: ReactNode
  className?: string
  glow?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  as?: 'div' | 'button'
  onClick?: () => void
}) {
  const Tag = as as any
  const pad = padding === 'none' ? '' : padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-6' : 'p-4'
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'glass rounded-2xl text-left',
        pad,
        glow && 'ring-glow',
        onClick && 'lift cursor-pointer hover:bg-[rgb(var(--c-surface-2)/0.65)]',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
