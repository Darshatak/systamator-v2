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

export const runStart = (goal: string, repoPath?: string) =>
  invoke<{ runId: string; plan: PlannedGoal; worktreePath: string | null }>(
    'run_start', { input: { goal, repoPath } },
  )

export const runTick = (runId: string) =>
  invoke<{ stepId: string | null; status: 'advanced' | 'idle' | 'done' | 'awaiting_user'; runDone: boolean }>('run_tick', { runId })

export const runList = (limit = 50) =>
  invoke<Run[]>('run_list', { limit })

export const runGet = (runId: string) =>
  invoke<[Run, Step[]]>('run_get', { runId })

// ── Agents ──────────────────────────────────────────────────────────────

export const agentList = () => invoke<AgentProfile[]>('agent_list', {})
export const agentSeedDefaults = () => invoke<number>('agent_seed_defaults', {})

// ── DB status ───────────────────────────────────────────────────────────

export const dbStatus = () => invoke<{ connected: boolean; message: string }>('db_status', {})

// ── Orchestrator extensions ─────────────────────────────────────────────

export const stepApprove     = (stepId: string) => invoke<void>('step_approve', { stepId })
export const skillDistillRun = (runId: string)  => invoke<string | null>('skill_distill_run', { runId })

// ── CLI providers ───────────────────────────────────────────────────────

export interface CliInfo {
  installed: boolean
  path:      string | null
  version:   string | null
  loginHint: string | null
}
export interface CliDetectResult {
  claude: CliInfo; codex: CliInfo; gemini: CliInfo; opencode: CliInfo
}
export const cliDetect    = () => invoke<CliDetectResult>('cli_detect', {})
export const cliLoginOpen = (provider: string) => invoke<string>('cli_login_open', { provider })
export const cliExec      = (provider: string, prompt: string) =>
  invoke<{ stdout: string; stderr: string; exitCode: number; provider: string }>('cli_exec', { provider, prompt })
