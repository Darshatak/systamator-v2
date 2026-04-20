// Global toast queue. Zustand so any component can dispatch, any
// component can subscribe. `toast.*` helpers match the v1 API so
// existing call patterns land here cleanly.

import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'warn' | 'error'

export interface ToastItem {
  id:      string
  kind:    ToastKind
  title:   string
  hint?:   string
  expiresAt: number
}

interface ToastStore {
  items: ToastItem[]
  push:  (t: Omit<ToastItem, 'id' | 'expiresAt'>, ttlMs?: number) => string
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push:  (t, ttlMs = 4500) => {
    const id = Math.random().toString(36).slice(2, 9)
    const item: ToastItem = { ...t, id, expiresAt: Date.now() + ttlMs }
    set(s => ({ items: [...s.items, item] }))
    setTimeout(() => set(s => ({ items: s.items.filter(i => i.id !== id) })), ttlMs)
    return id
  },
  dismiss: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),
}))

// Ergonomic helpers — prefer these over useToastStore.getState() calls.
const push = (kind: ToastKind) => (title: string, hint?: string) =>
  useToastStore.getState().push({ kind, title, hint })

export const toast = {
  info:    push('info'),
  success: push('success'),
  warn:    push('warn'),
  error:   push('error'),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
}
