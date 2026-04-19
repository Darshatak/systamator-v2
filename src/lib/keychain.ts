// Frontend wrapper around the OS keychain Tauri commands.
// Use these — never localStorage — for secrets.

import { invoke } from './ipc'

export const KC_NS = {
  providers: 'providers',
  ssh:       'ssh',
  oauth:     'oauth',
  mcp:       'mcp',
  search:    'search',          // tavily, brave, etc.
} as const

export const kcGet    = (ns: string, key: string)               => invoke<string | null>('keychain_get',    { namespace: ns, key })
export const kcSet    = (ns: string, key: string, value: string) => invoke<void>          ('keychain_set',    { namespace: ns, key, value })
export const kcDelete = (ns: string, key: string)               => invoke<void>          ('keychain_delete', { namespace: ns, key })
export const kcList   = (ns: string)                             => invoke<string[]>      ('keychain_list',   { namespace: ns })
