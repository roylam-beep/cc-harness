import type { Checks } from '../types'

// 純函式：不碰 $，給 cc-watch.tsx 與測試共用。

// 只收繁體裡不存在的簡體字；后、里、面、干、台、系、件、示這類兩岸同形或有歧義的字不收。
const SIMPLIFIED = new Set(
  '这们说时会来对没发现实经过还进动关应该设计数据软络务认识问题让给么吗讲话语写读学习开东车长买卖头处机线结构标级页显录证变换环点为个与从将产体门间见视频项优码错误则请输复杂简单历资网层节览'.split(
    '',
  ),
)
const HK = new Set('唔嘅咁喺俾嘢睇慳畀係'.split(''))
const HK_OK = /關係|係數/g

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const VERIFY_BASH =
  /\b(vitest|jest|pytest|mocha|tsc|eslint|ruff|mypy|phpunit|playwright)\b|\b(go|cargo|deno|bun) test\b|\bnode --test\b|\b(npm|pnpm|yarn|bun) (run )?(test|lint|build|typecheck|verify|check)\b|\bmake (test|check|lint)\b|gate\.sh|check_docs\.py|claude plugin (test|validate)|\bphp -l\b|python3? (-I )?-m (pytest|unittest)/

/** 把回覆裡的 code、網址、路徑拿掉，再找簡體字與港式字；最多回 3 個。 */
export function langHits(answer: string): string[] {
  const prose = answer
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\S*[\\/]\S*/g, ' ')
    .replace(HK_OK, ' ')
  const hits: string[] = []
  for (const ch of prose) {
    if ((SIMPLIFIED.has(ch) || HK.has(ch)) && !hits.includes(ch)) hits.push(ch)
    if (hits.length === 3) break
  }
  return hits
}

/** 算不算「改了程式」：文件、暫存、memory 不算。 */
export function isCodePath(path: string): boolean {
  if (path === '') return false
  if (/\.(md|mdx|txt)$/i.test(path)) return false
  if (/^(\/private)?\/tmp\/|^\/var\/folders\//.test(path)) return false
  if (path.includes('/.claude/projects/')) return false
  return true
}

/** 改檔工具的目標路徑；不是改檔工具回 null。 */
export function editedPath(tool: string, input: Record<string, unknown>): string | null {
  if (!EDIT_TOOLS.has(tool)) return null
  const p = input.file_path ?? input.notebook_path
  return typeof p === 'string' ? p : ''
}

/** 算不算驗證動作：測試／lint／build、派子 agent、叫 gate skill、用瀏覽器。 */
export function isVerifyCall(tool: string, input: Record<string, unknown>): boolean {
  if (tool === 'Agent' || tool === 'Task') return true
  if (tool === 'Skill') return /gate/.test(String(input.skill ?? ''))
  if (/^mcp__Claude_(Browser|Preview)__|^mcp__.*(playwright|chrome)/i.test(tool)) return true
  if (tool === 'Bash') return VERIFY_BASH.test(String(input.command ?? ''))
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
