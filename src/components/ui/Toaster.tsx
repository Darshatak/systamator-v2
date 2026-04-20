import { AnimatePresence, motion } from 'framer-motion'
import { X, Check, Info, AlertTriangle, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { useToastStore, type ToastKind } from '@/lib/toast'

const ICON: Record<ToastKind, typeof Info> = {
  info: Info, success: Check, warn: AlertTriangle, error: XCircle,
}
const TONE_CLS: Record<ToastKind, string> = {
  info:    'border-[rgb(var(--c-info)/0.35)]    bg-[rgb(var(--c-info)/0.10)]    text-[rgb(var(--c-info))]',
  success: 'border-[rgb(var(--c-success)/0.35)] bg-[rgb(var(--c-success)/0.10)] text-[rgb(var(--c-success))]',
  warn:    'border-[rgb(var(--c-warn)/0.35)]    bg-[rgb(var(--c-warn)/0.10)]    text-[rgb(var(--c-warn))]',
  error:   'border-[rgb(var(--c-danger)/0.40)]  bg-[rgb(var(--c-danger)/0.10)]  text-[rgb(var(--c-danger))]',
}

export function Toaster() {
  const items   = useToastStore(s => s.items)
  const dismiss = useToastStore(s => s.dismiss)

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {items.map(t => {
          const Icon = ICON[t.kind]
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{    opacity: 0, y: 8,  scale: 0.95, transition: { duration: 0.15 } }}
              className={clsx(
                'pointer-events-auto min-w-[280px] max-w-[380px] rounded-xl border px-3 py-2.5',
                'shadow-lg shadow-black/30 backdrop-blur-md glass-soft',
                TONE_CLS[t.kind],
              )}
            >
              <div className="flex items-start gap-2">
                <Icon size={13} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0 text-[12px]">
                  <div className="font-semibold text-heading">{t.title}</div>
                  {t.hint && <div className="text-meta mt-0.5 leading-relaxed">{t.hint}</div>}
                </div>
                <button onClick={() => dismiss(t.id)}
                        className="p-0.5 rounded hover:bg-white/5 text-meta hover:text-heading">
                  <X size={11} />
                </button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
