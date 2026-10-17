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

declare module 'claude-code' {
  interface PluginState {
    'cc-harness': {
      touched: string[]
      git: GitInfo | null
      warning: string | null
      pr: PrState | null
    }
  }
}
