import type { Checks } from '../types'
import { CODE_PATH_ENV, codePathConfig, isCodePath } from './code-path.mjs'

// 純函式：不碰 $，給 cc-watch.tsx 與測試共用。
// 「程式檔」判定在 code-path.mjs，跟 guard-bash.mjs 共用同一份。
export { isCodePath }

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const VERIFY_BASH =
  /\b(vitest|jest|pytest|mocha|tsc|eslint|ruff|mypy|phpunit|playwright|rspec)\b|\b(go|cargo|deno|bun|swift|flutter|dotnet) test\b|\bnode --test\b|\b(npm|pnpm|yarn|bun) (run )?(test|lint|build|typecheck|verify|check)\b|\bmake (test|check|lint)\b|\b(mvn|gradle|gradlew) (\S+ )*(test|verify|check)\b|gate\.sh|check_docs\.py|claude plugin (test|validate)|\bphp -l\b|python3? (-I )?-m (pytest|unittest)/
const BROWSER_TOOL = /^mcp__Claude_(Browser|Preview)__|^mcp__.*(playwright|chrome|puppeteer|browser)/i

/**
 * 使用者設定（環境變數，見 code-path.mjs 檔頭與下面這行）。mod 環境沒有 process.env，
 * 由 cc-watch.tsx 開場用 printenv 讀一次傳進來；讀不到就是全空＝內建行為。
 *   CC_VERIFY_EXTRA  額外算「驗證」的 Bash 指令 regex，例如 `\bbazel test\b|\bsbt test\b`。
 */
export type WatchConfig = { docExts: string[]; nonCode: string[]; verifyExtra: RegExp | null }
export const WATCH_ENV = [...CODE_PATH_ENV, 'CC_VERIFY_EXTRA']

export function watchConfig(env: Record<string, string | undefined>): WatchConfig {
  let verifyExtra: RegExp | null = null
  try {
    if (env.CC_VERIFY_EXTRA) verifyExtra = new RegExp(env.CC_VERIFY_EXTRA)
  } catch {
    verifyExtra = null // regex 寫壞就當沒設，不讓提醒整個失效
  }
  return { ...codePathConfig(env), verifyExtra }
}

/** 改檔工具的目標路徑；不是改檔工具回 null。 */
export function editedPath(tool: string, input: Record<string, unknown>): string | null {
  if (!EDIT_TOOLS.has(tool)) return null
  const p = input.file_path ?? input.notebook_path
  return typeof p === 'string' ? p : ''
}

/** 算不算驗證動作：測試／lint／build、派子 agent、叫 gate skill、用瀏覽器。 */
export function isVerifyCall(tool: string, input: Record<string, unknown>, verifyExtra: RegExp | null = null): boolean {
  if (tool === 'Agent' || tool === 'Task') return true
  if (tool === 'Skill') return /gate/.test(String(input.skill ?? ''))
  if (BROWSER_TOOL.test(tool)) return true
  if (tool === 'Bash') {
    const cmd = String(input.command ?? '')
    return VERIFY_BASH.test(cmd) || (verifyExtra?.test(cmd) ?? false)
  }
  return false
}

/** `git status --porcelain -z` → 相對路徑集合（rename 兩個路徑都收）。 */
export function parsePorcelain(out: string): Set<string> {
  const paths = new Set<string>()
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (entry === undefined || entry.length < 4) continue
    paths.add(entry.slice(3))
    if (entry[0] === 'R' || entry[0] === 'C') {
      const from = parts[i + 1]
      if (from) paths.add(from)
      i++
    }
  }
  return paths
}

/** BACKLOG.md 表格裡以數字編號開頭的列數。 */
export function countBacklog(text: string): number {
  return text.split('\n').filter(line => /^\|\s*\d+\s*\|/.test(line)).length
}

/** 本 session 改過、而且現在還 dirty 的檔（相對 repo 根目錄）。 */
export function mineDirty(root: string, touched: readonly string[], dirty: Set<string>): string[] {
  const prefix = root.endsWith('/') ? root : root + '/'
  return touched
    .filter(p => p.startsWith(prefix))
    .map(p => p.slice(prefix.length))
    .filter(rel => dirty.has(rel))
}


const FAILED = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'])

/** gh 的 statusCheckRollup → 一個結論：有一個失敗就算失敗，有一個沒跑完就算進行中。 */
export function checkState(rollup: unknown): Checks {
  if (!Array.isArray(rollup) || rollup.length === 0) return 'none'
  let pending = false
  for (const item of rollup as Record<string, unknown>[]) {
    const conclusion = String(item.conclusion ?? '')
    const state = String(item.state ?? '')
    if (FAILED.has(conclusion) || FAILED.has(state)) return 'fail'
    const status = item.status === undefined ? '' : String(item.status)
    if ((status !== '' && status !== 'COMPLETED') || state === 'PENDING' || state === 'EXPECTED') pending = true
  }
  return pending ? 'pending' : 'pass'
}
