// Trusted-keys manager — ed25519 public keys that can vouch for imported
// skill bundles. Lives inside Advanced tab.

import { useEffect, useState } from 'react'
import { Key, Plus, Trash2, Check, Loader2, Sparkles, PenLine, Copy } from 'lucide-react'
import { invoke } from '@/lib/ipc'
import { toast } from '@/lib/toast'
import { Card, Button, Chip } from '@/components/ui'

interface TrustedKey { name: string; publicKey: string; addedAt: number }
interface Keypair { publicKey: string; privateKey: string }

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

  const [generated, setGenerated] = useState<Keypair | null>(null)
  async function keygen() {
    try {
      const kp = await invoke<Keypair>('skill_keygen', {})
      setGenerated(kp)
      toast.success('Keypair generated', 'Private key shown once — copy it now')
    } catch (e) { toast.error('Keygen failed', String((e as Error)?.message ?? e)) }
  }
  const [signInput, setSignInput] = useState('')
  const [signKey, setSignKey]     = useState('')
  const [signed, setSigned]       = useState<string | null>(null)
  async function sign() {
    if (!signInput.trim() || !signKey.trim()) return
    try {
      const out = await invoke<string>('skill_sign_bundle', { bundleJson: signInput.trim(), privateKeyB64: signKey.trim() })
      setSigned(out)
      toast.success('Bundle signed', 'Signed JSON ready below')
    } catch (e) { toast.error('Sign failed', String((e as Error)?.message ?? e)) }
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

      <div className="mt-4 border-t border-white/8 pt-3 space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={11} className="text-[rgb(var(--c-primary-2))]" />
            <span className="text-[10px] font-bold text-heading uppercase tracking-[0.18em]">Generate keypair</span>
            <Button size="sm" variant="soft" onClick={keygen} className="ml-auto">New keypair</Button>
          </div>
          {generated && (
            <div className="space-y-1 text-[10px] font-mono">
              <CopyRow label="public"  value={generated.publicKey} />
              <CopyRow label="private" value={generated.privateKey} warn />
              <div className="text-[10px] text-[rgb(var(--c-warn))]">Private key is shown once. Copy it now — Systamator does not persist it.</div>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <PenLine size={11} className="text-[rgb(var(--c-primary-2))]" />
            <span className="text-[10px] font-bold text-heading uppercase tracking-[0.18em]">Sign a bundle</span>
          </div>
          <textarea value={signInput} onChange={e => setSignInput(e.target.value)} rows={4}
                    placeholder="Paste an unsigned skill bundle JSON…"
                    className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[10px] font-mono text-body outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
          <div className="flex items-center gap-2 mt-1.5">
            <input value={signKey} onChange={e => setSignKey(e.target.value)} type="password"
                   placeholder="base64 private key (32-byte seed)"
                   className="flex-1 h-7 px-2 rounded-md border border-white/10 bg-white/5 text-[10px] font-mono text-heading outline-none focus:border-[rgb(var(--c-primary)/0.6)]" />
            <Button size="sm" icon={<PenLine size={11} />} onClick={sign} disabled={!signInput.trim() || !signKey.trim()}>Sign</Button>
          </div>
          {signed && (
            <pre className="mt-2 text-[10px] font-mono text-body whitespace-pre-wrap bg-white/[0.03] border border-white/5 rounded-md p-2 max-h-40 overflow-y-auto">{signed}</pre>
          )}
        </div>
      </div>
    </Card>
  )
}

function CopyRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy() { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[9px] font-bold uppercase tracking-[0.18em] ${warn ? 'text-[rgb(var(--c-warn))]' : 'text-meta'}`}>{label}</span>
      <span className="font-mono text-meta truncate flex-1">{value}</span>
      <button onClick={copy} className="p-1 rounded hover:bg-white/5 text-meta" title="Copy">
        {copied ? <Check size={10} className="text-[rgb(var(--c-success))]" /> : <Copy size={10} />}
      </button>
    </div>
  )
}
