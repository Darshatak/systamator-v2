// Trusted-keys manager — ed25519 public keys that can vouch for imported
// skill bundles. Lives inside Advanced tab.

import { useEffect, useState } from 'react'
import { Key, Plus, Trash2, Check, Loader2 } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { toast } from '@/lib/toast'
import { Card, Button, Chip } from '@/components/ui'

interface TrustedKey { name: string; publicKey: string; addedAt: number }

export function TrustedKeysCard() {
  const [keys, setKeys]     = useState<TrustedKey[] | null>(null)
  const [name, setName]     = useState('')
  const [pk, setPk]         = useState('')
  const [adding, setAdding] = useState(false)

  async function refresh() {
    try { setKeys(await invoke<TrustedKey[]>('trusted_keys_list', {})) }
    catch { setKeys([]) }
  }
  useEffect(() => { refresh() }, [])

  async function add() {
    if (!name.trim() || !pk.trim()) return
    setAdding(true)
    try {
      await invoke('trusted_keys_add', { name: name.trim(), publicKey: pk.trim() })
      toast.success('Trusted key added', name.trim())
      setName(''); setPk(''); refresh()
    } catch (e) { toast.error('Add key failed', String((e as Error)?.message ?? e)) }
    finally { setAdding(false) }
  }

  async function remove(n: string) {
    if (!confirm(`Remove trusted key "${n}"?`)) return
    try { await invoke('trusted_keys_remove', { name: n }); refresh() }
    catch (e) { toast.error('Remove key failed', String((e as Error)?.message ?? e)) }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Key size={13} className="text-[rgb(var(--c-primary-2))]" />
        <span className="text-[12px] font-bold text-heading uppercase tracking-[0.18em]">Trusted skill-bundle signers</span>
      </div>
      <p className="text-[11px] text-meta mb-3 leading-relaxed">
        ed25519 public keys authorised to sign skill bundles. Signed bundles from trusted keys import with <code className="bg-white/5 rounded px-1">origin=community-verified</code>; unknown-key signatures are rejected.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Author name / handle"
               className="h-8 px-2 rounded-md border border-white/10 bg-white/5 text-[11px] text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)] w-40" />
        <input value={pk} onChange={e => setPk(e.target.value)} placeholder="base64 public key (44 chars)"
               className="flex-1 h-8 px-2 rounded-md border border-white/10 bg-white/5 text-[11px] font-mono text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
        <Button size="sm" icon={adding ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                onClick={add} disabled={adding || !name.trim() || !pk.trim()}>Add</Button>
      </div>

      {keys === null && <Loader2 size={11} className="animate-spin text-meta" />}
      {keys && keys.length === 0 && (
        <div className="text-[11px] text-meta">No trusted keys yet. Add one and bundles signed by that key will flow through Skills → Import with the <Chip tone="success">verified</Chip> badge.</div>
      )}
      {keys && keys.length > 0 && (
        <div className="space-y-1">
          {keys.map(k => (
            <div key={k.name} className="flex items-center gap-2 text-[11px] px-2 py-1 rounded-md bg-white/[0.02]">
              <Check size={10} className="text-[rgb(var(--c-success))]" />
              <span className="font-semibold text-heading">{k.name}</span>
              <span className="font-mono text-meta truncate flex-1">{k.publicKey}</span>
              <span className="text-[9px] text-meta tabular-nums">{new Date(k.addedAt * 1000).toLocaleDateString()}</span>
              <button title="Remove" onClick={() => remove(k.name)}
                      className="p-1 rounded-md text-[rgb(var(--c-danger))] hover:bg-[rgb(var(--c-danger)/0.1)]">
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
