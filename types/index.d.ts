export type GitInfo = {
  root: string
  branch: string
  hasUpstream: boolean
  ahead: number
  behind: number
  mineDirty: string[]
  backlog: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'cc-harness': { touched: string[]; git: GitInfo | null; warning: string | null }
  }
}
