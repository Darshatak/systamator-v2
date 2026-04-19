// Tauri ↔ HTTP IPC bridge. Same shape as v1 so any helper that worked there
// drops in here. In a future web build the same `invoke` posts to /api/<cmd>
// against an Axum companion server.

export const isDesktop = (): boolean =>
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

const API_BASE = ((): string => {
  const fromEnv = (import.meta as any)?.env?.VITE_API_BASE
  return typeof fromEnv === 'string' && fromEnv ? fromEnv.replace(/\/$/, '') : '/api'
})()

export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isDesktop()) {
    const mod = await import('@tauri-apps/api/core')
    return mod.invoke<T>(cmd, args as any)
  }
  const r = await fetch(`${API_BASE}/${cmd}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args ?? {}),
    credentials: 'include',
  })
  if (!r.ok) throw new Error(`ipc ${cmd}: ${r.status} ${await r.text().catch(() => '')}`)
  const ct = r.headers.get('content-type') ?? ''
  return (ct.includes('application/json') ? await r.json() : (await r.text() as unknown)) as T
}

export async function safeInvoke<T>(cmd: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  try { return await invoke<T>(cmd, args) } catch { return fallback }
}
