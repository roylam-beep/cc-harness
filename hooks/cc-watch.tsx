import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitInfo, PrInfo, PrState } from '../types'
import {
  checkState,
  countBacklog,
  editedPath,
  isCodePath,
  isVerifyCall,
  mineDirty,
  parsePorcelain,
  WATCH_ENV,
  watchConfig,
} from './cc-watch-logic'
import type { WatchConfig } from './cc-watch-logic'

const PANE = 'cc-watch'
const touched = atom({ plugin: 'cc-harness', key: 'touched' } as const, [])
const git = atom({ plugin: 'cc-harness', key: 'git' } as const, null)
const warning = atom({ plugin: 'cc-harness', key: 'warning' } as const, null)
const pr = atom({ plugin: 'cc-harness', key: 'pr' } as const, null)

// Push／Commit 鍵只把字填進輸入框，使用者按 Enter 才送出：跟手打一樣快（prompt.submit 會排隊約 5 秒），
// 也照常走 agent 的流程（commit 只挑本 session 的檔、push 前跑測試）。
async function fillPrompt($: EngineInterface, text: string): Promise<void> {
  await $.prompt.fill({ text, mode: 'replace' })
}

// 本回合（主迴圈）的紀錄；hot reload 會歸零，可接受。
let seq = 0
let editSeq = 0
let verifySeq = 0
let turnEdits: string[] = []

async function sh($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const r = await $.process.run(argv, { timeoutMs: 5000 })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

// 使用者設定（見 cc-watch-logic.ts 的 WatchConfig）。mod 環境沒有 process.env，開場用子行程印一次；
// 讀不到（沒設、子行程拿不到環境）就是全空＝內建行為。
let config: WatchConfig = watchConfig({})

async function loadConfig($: EngineInterface): Promise<void> {
  const script = WATCH_ENV.map(name => `printf '%s\\n' "$${name}"`).join('; ')
  const out = await sh($, ['sh', '-c', script])
  const values = (out ?? '').split('\n')
  config = watchConfig(Object.fromEntries(WATCH_ENV.map((name, i) => [name, values[i] ?? ''])))
}

async function refreshGit($: EngineInterface): Promise<GitInfo | null> {
  const top = await sh($, ['git', 'rev-parse', '--show-toplevel'])
  if (top === null) {
    await update($, git, () => null)
    return null
  }
  const root = top.trim()
  const branch = ((await sh($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'])) ?? '?').trim()
  const counts = await sh($, ['git', 'rev-list', '--left-right', '--count', '@{u}...HEAD'])
  const [behind, ahead] = counts === null ? [0, 0] : counts.trim().split(/\s+/).map(Number)
  const status = (await sh($, ['git', 'status', '--porcelain', '-z'])) ?? ''
  let backlog: number | null = null
  try {
    backlog = countBacklog(await $.fs.read(root + '/BACKLOG.md'))
  } catch {
    backlog = null
  }
  const info: GitInfo = {
    root,
    branch,
    hasUpstream: counts !== null,
    ahead: ahead || 0,
    behind: behind || 0,
    mineDirty: mineDirty(root, await read($, touched), parsePorcelain(status)),
    backlog,
  }
  await update($, git, () => info)
  return info
}

const PR_FIELDS = 'number,title,url,reviewDecision,statusCheckRollup'

function toPr(raw: Record<string, unknown>): PrInfo {
  return {
    number: Number(raw.number ?? 0),
    title: String(raw.title ?? ''),
    url: String(raw.url ?? ''),
    checks: checkState(raw.statusCheckRollup),
    review: String(raw.reviewDecision ?? ''),
  }
}

// 目前分支的 PR＋我開著的 PR；gh 不能用（沒裝、沒登入、不是 GitHub repo）就整個 null。
async function refreshPr($: EngineInterface): Promise<void> {
  const run = async (argv: string[]) => {
    try {
      return await $.process.run(argv, { timeoutMs: 15_000 })
    } catch {
      return null
    }
  }
  const mine = await run(['gh', 'pr', 'list', '--author', '@me', '--state', 'open', '--limit', '20', '--json', PR_FIELDS])
  if (mine === null || mine.exitCode !== 0) {
    await update($, pr, () => null)
    return
  }
  const cur = await run(['gh', 'pr', 'view', '--json', PR_FIELDS])
  let state: PrState
  try {
    state = {
      current: cur !== null && cur.exitCode === 0 ? toPr(JSON.parse(cur.stdout) as Record<string, unknown>) : null,
      mineOpen: (JSON.parse(mine.stdout) as Record<string, unknown>[]).map(toPr),
    }
  } catch {
    return
  }
  await update($, pr, () => state)
}

const CHECK_MARK: Record<string, string> = { pass: '✓', fail: '✗', pending: '…', none: '' }
// 顏色只用黑白灰＋紅：紅＝要你處理；白＝數值；灰＝標籤與正常狀態；反白＝執行中。
const CHECK_COLOR: Record<string, string | undefined> = { pass: undefined, fail: 'error', pending: undefined, none: undefined }

// 一回合只報一次；turn.start 重設 reported。
let reported = false

async function finishTurn($: EngineInterface): Promise<void> {
  if (reported) return
  reported = true
  const notes: string[] = []
  if (turnEdits.length > 0 && verifySeq < editSeq) {
    const names = turnEdits.map(p => p.split('/').pop()).slice(0, 3).join('、')
    const more = turnEdits.length > 3 ? ` 等 ${turnEdits.length} 個檔` : ''
    notes.push(`⚠ 本回合改了 ${names}${more}，改完之後沒有跑測試、gate 或瀏覽器驗證。`)
  }
  if (turnEdits.length > 0) {
    const info = await refreshGit($)
    if (info !== null && info.mineDirty.length > 0) {
      notes.push(`ℹ 本 session 改過、還沒 commit 的檔有 ${info.mineDirty.length} 個。`)
    }
  }
  if (notes.length === 0) return
  const text = 'cc-watch\n' + notes.join('\n')
  await update($, warning, () => notes[0] ?? null)
  $.ui.toast(notes[0] ?? text, { timeoutMs: 8000 })
  try {
    await $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] } })
  } catch {
    // 寫不進對話就算了，toast 與狀態列還在。
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cc-watch', description: '打開工作區狀態面板（未 commit、未 push、BACKLOG）' })
    await loadConfig($)
    await refreshGit($)
    void refreshPr($).catch(() => null)
    $.clock.every(60_000, () => {
      void refreshGit($).catch(() => null)
      void refreshPr($).catch(() => null)
    })
    return next(e)
  })

  on('command.run', { command: 'cc-watch' }, async $ => {
    await refreshGit($)
    void refreshPr($).catch(() => null)
    await $.ui.open({ id: PANE, title: '工作區狀態' })
    return { text: '已打開工作區狀態面板。' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, warning, () => null)
      reported = false
      seq = 0
      editSeq = 0
      verifySeq = 0
      turnEdits = []
    }
    return next(e)
  })

  // 主迴圈與子 agent 的工具呼叫都算（子 agent 跑在主回合裡面）。
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const path = editedPath(tool, input)
    if (path !== null && isCodePath(path, config)) {
      editSeq = ++seq
      if (!turnEdits.includes(path)) turnEdits.push(path)
      await update($, touched, list => (list.includes(path) ? list : [...list, path].slice(-500)))
      void refreshGit($).catch(() => null)
    } else if (isVerifyCall(tool, input, config.verifyExtra)) {
      verifySeq = ++seq
    }
    const cmd = String(input.command ?? '')
    if (tool === 'Bash' && /\bgit\b/.test(cmd)) void refreshGit($).catch(() => null)
    if (tool === 'Bash' && /\bgit push\b|\bgh pr\b/.test(cmd)) void refreshPr($).catch(() => null)
    return ran
  }).catch(($, e, next) => next(e))

  // 回合結束的提醒：Desktop 不顯示 turn.complete 的 text，所以改用系統訊息＋toast＋狀態列三處。
  // turn.complete 不論結束原因都檢查；classic.Stop 當備援（Desktop 收尾時 turn.complete 不一定走 answer）。
  on('turn.complete', async ($, e, next) => {
    const res = await next(e)
    // 子 agent 的 text 是要交回給主迴圈的報告，不能動。
    if (e.agentId === undefined) await finishTurn($)
    return res
  })

  on('classic.Stop', async ($, e, next) => {
    const res = await next(e)
    await finishTurn($)
    return res
  })

  // 輸入框上方一行：常駐的精簡版；詳細內容在面板（/cc-watch 或「詳細」鍵）。
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const info = await read($, git)
    if (info === null || e.props.hasSurvey) return next(e)
    const lastWarning = await read($, warning)
    const prs = await read($, pr)
    const { Box, Text, Button } = $.ui.resolve(e)
    const dirty = info.mineDirty.length
    const cur = prs?.current ?? null
    return (
      <Box>
        <Text bold>{info.branch}</Text>
        {!info.hasUpstream && <Text dimColor> · 沒有遠端分支</Text>}
        {info.hasUpstream && info.ahead === 0 && info.behind === 0 && <Text dimColor> · 已同步</Text>}
        {info.hasUpstream && info.ahead > 0 && <Text> · 領先 {info.ahead}</Text>}
        {info.hasUpstream && info.behind > 0 && <Text color="error"> · 落後 {info.behind}</Text>}
        {dirty > 0 ? <Text color="error"> · 未 commit {dirty}</Text> : <Text dimColor> · 未 commit 0</Text>}
        {cur !== null && (
          <Text color={CHECK_COLOR[cur.checks]} dimColor={cur.checks !== 'fail'}>
            {' '}
            · PR #{cur.number} {CHECK_MARK[cur.checks]}
          </Text>
        )}
        {cur === null && prs !== null && prs.mineOpen.length > 0 && <Text dimColor> · 開著的 PR {prs.mineOpen.length}</Text>}
        <Text dimColor>{info.backlog !== null ? ` · BACKLOG ${info.backlog} ` : ' '}</Text>
        {dirty > 0 && <Button key="commit" variant="secondary" label={`Commit ${dirty}`} onPress={() => fillPrompt($, 'commit')} />}
        {info.hasUpstream && info.ahead > 0 && (
          <Button key="push" variant="primary" label={`Push ${info.ahead}`} onPress={() => fillPrompt($, 'push')} />
        )}
        {lastWarning !== null && <Text color="error"> {lastWarning} </Text>}
        <Button key="detail" label="詳細" onPress={async () => void (await $.ui.open({ id: PANE, title: '工作區狀態' }))} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const info = await read($, git)
    if (info === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>目前資料夾不是 git repo。</Text>
        </Box>
      )
    }
    const prs = await read($, pr)
    let usageLine: string | null = null
    try {
      const u = await $.session.usage()
      const pct = u.context.percent === undefined ? '?' : `${Math.round(u.context.percent)}%`
      usageLine = `context ${pct}` + (u.cost === undefined ? '' : ` · 花費 US$${u.cost.usd.toFixed(2)}`)
    } catch {
      usageLine = null
    }
    const list = info.mineDirty.slice(0, 8)
    return (
      <Box flexDirection="column">
        <Text>
          分支 <Text bold>{info.branch}</Text>
          {info.hasUpstream ? `  領先 ${info.ahead}／落後 ${info.behind}` : '  （沒有對應的遠端分支）'}
        </Text>
        <Text color={info.mineDirty.length > 0 ? 'error' : undefined}>
          本 session 改過、未 commit：{info.mineDirty.length} 個檔
        </Text>
        {list.map(rel => (
          <Text dimColor>  {rel}</Text>
        ))}
        {info.mineDirty.length > list.length && <Text dimColor>  …還有 {info.mineDirty.length - list.length} 個</Text>}
        {info.backlog !== null && <Text>BACKLOG：{info.backlog} 條</Text>}
        {usageLine !== null && <Text dimColor>{usageLine}</Text>}
        {prs === null && <Text dimColor>PR：gh 不能用，不顯示</Text>}
        {prs !== null && prs.mineOpen.length === 0 && <Text dimColor>PR：沒有我開著的 PR</Text>}
        {prs !== null &&
          prs.mineOpen.slice(0, 6).map(one => (
            <Text color={CHECK_COLOR[one.checks]}>
              #{one.number} {CHECK_MARK[one.checks]} {one.title.slice(0, 50)}
              {prs.current?.number === one.number ? '（目前分支）' : ''}
            </Text>
          ))}
        <Box>
          {info.mineDirty.length > 0 && (
            <Button key="commit" variant="secondary" label={`Commit（${info.mineDirty.length} 個檔）`} onPress={() => fillPrompt($, 'commit')} />
          )}
          {info.hasUpstream && info.ahead > 0 && (
            <Button key="push" variant="primary" label={`Push（${info.ahead} 個 commit）`} onPress={() => fillPrompt($, 'push')} />
          )}
          <Button
            key="refresh"
            label="重新整理"
            onPress={async () => {
              await refreshGit($)
              await refreshPr($)
            }}
          />
        </Box>
        <Text dimColor>落後數以上次 fetch 為準；用 shell 改的檔（sed、heredoc）不會被記到。</Text>
      </Box>
    )
  })
}
