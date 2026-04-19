// Typed Tauri command wrappers for runs / agents / orchestrator.
// Frontend code uses these instead of stringly-typed invoke() calls.

import { invoke } from './ipc'
import type { Run, Step, AgentProfile } from '@/types/domain'

// ── Runs / orchestrator ─────────────────────────────────────────────────

export interface PlannedStep {
  kind: string; label: string; agentRole: string; dependsOn: number[]; input: Record<string, unknown>
}
export interface PlannedGoal {
  taskType: string; conductorId: string; steps: PlannedStep[]
}

export const runStart = (goal: string) =>
  invoke<{ runId: string; plan: PlannedGoal }>('run_start', { input: { goal } })

export const runTick = (runId: string) =>
  invoke<{ stepId: string | null; status: 'advanced' | 'idle' | 'done'; runDone: boolean }>('run_tick', { runId })

export const runList = (limit = 50) =>
  invoke<Run[]>('run_list', { limit })

export const runGet = (runId: string) =>
  invoke<[Run, Step[]]>('run_get', { runId })

// ── Agents ──────────────────────────────────────────────────────────────

export const agentList = () => invoke<AgentProfile[]>('agent_list', {})
export const agentSeedDefaults = () => invoke<number>('agent_seed_defaults', {})

// ── DB status ───────────────────────────────────────────────────────────

export const dbStatus = () => invoke<{ connected: boolean; message: string }>('db_status', {})
