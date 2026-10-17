export type Checks = 'pass' | 'fail' | 'pending' | 'none'

export type GitInfo = {
  root: string
  branch: string
  hasUpstream: boolean
  ahead: number
  behind: number
  mineDirty: string[]
  backlog: number | null
}

export type PrInfo = { number: number; title: string; url: string; checks: Checks; review: string }

/** gh 不能用時整個是 null（狀態列不顯示 PR）。 */
export type PrState = { current: PrInfo | null; mineOpen: PrInfo[] }

export type Progress = {
  running: boolean
  startedAt: number
  now: number
  tools: number
  agents: number
  lastMs: number
  lastTools: number
}

declare module 'claude-code' {
  interface PluginState {
    'cc-harness': {
      touched: string[]
      git: GitInfo | null
      warning: string | null
      pushSent: boolean
      pr: PrState | null
      progress: Progress | null
    }
  }
}
