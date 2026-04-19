// Canonical domain models — one source of truth for the whole frontend.

export type ProviderType = 'claude' | 'openai' | 'gemini' | 'ollama' | 'xai' | 'mistral'

export type ResourceKind = 'ssh' | 'docker' | 'db' | 'browser' | 'mcp' | 'repo' | 'github'

export interface Resource {
  id:    string
  kind:  ResourceKind
  name:  string
  meta:  Record<string, unknown>
  tags:  string[]
  facts: Record<string, unknown>
}

export type AgentTier = 'lead' | 'manager' | 'ic'

export interface AgentStats {
  runs:           number
  wins:           number
  losses:         number
  tokensSpent:    number
  dollarsSpent:   number
  avgWallMs:      number
  expertiseScore: number      // 0..1, EWMA
  lastActive:    string | null
}

export interface AgentManifest {
  id:            string
  name?:         string
  tier:          AgentTier
  speciality:    string
  parentId?:     string
  children?:     string[]
  system:        string
  providerChain: { providerType: ProviderType; model: string; why: string }[]
  tools:         string[]
}

export interface AgentProfile {
  id:         string
  tier:       AgentTier
  speciality: string
  parentId?:  string
  manifest:   AgentManifest
  stats:      AgentStats
  active:     boolean
}

export type RunStatus = 'running' | 'done' | 'failed' | 'aborted' | 'awaiting_user'
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'awaiting_user'
export type StepKind  = 'tool' | 'llm' | 'control.if' | 'control.loop' | 'control.merge'
export type TaskType  = 'research' | 'code' | 'ops' | 'writing' | 'reasoning' | 'multimodal' | 'casual'

export interface Cost { tokens: number; dollars: number; wallMs: number }

export interface Run {
  id:           string
  goal:         string
  status:       RunStatus
  taskType?:    TaskType
  conductorId?: string
  startedAt:    string
  finishedAt?:  string
  cost:         Cost
  summary?:     string
  meta:         Record<string, unknown>
}

export interface Step {
  id:          string
  runId:       string
  agentId?:    string
  kind:        StepKind
  label:       string
  status:      StepStatus
  dependsOn:   string[]
  input:       Record<string, unknown>
  output?:     unknown
  critique?:   { verdict: 'pass' | 'fail' | 'unknown'; reasons: string[]; retryHint?: string }
  retries:     number
  cost:        Cost
  startedAt?:  string
  finishedAt?: string
}

export interface Skill {
  id:           string
  agentId?:     string
  title:        string
  description:  string
  trigger?:     string
  precondition: string[]
  recipe:       unknown          // serialised step skeleton
  origin:       'builtin' | 'learned' | 'openspace' | 'community'
  successCount: number
  failureCount: number
}
