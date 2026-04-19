import clsx from 'clsx'

export function StatusDot({ status, size = 8 }: { status: 'running' | 'idle' | 'error' | 'success'; size?: number }) {
  const cls =
    status === 'running' ? 'bg-[rgb(var(--c-success))] dot-running' :
    status === 'success' ? 'bg-[rgb(var(--c-success))]' :
    status === 'error'   ? 'bg-[rgb(var(--c-danger))]' :
                            'bg-meta/40'
  return <span className={clsx('rounded-full inline-block flex-shrink-0', cls)} style={{ width: size, height: size }} />
}
