import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitInfo, PrInfo, PrState, Progress } from '../types'
import {
  checkState,
  countBacklog,
  fmtDuration,
  editedPath,
  isCodePath,
  isVerifyCall,
  langHits,
  mineDirty,
  parsePorcelain,
} from './cc-watch-logic'

const PANE = 'cc-watch'
const touched = atom({ plugin: 'cc-harness', key: 'touched' } as const, [])
const git = atom({ plugin: 'cc-harness', key: 'git' } as const, null)
const warning = atom({ plugin: 'cc-harness', key: 'warning' } as const, null)
const pushSent = atom({ plugin: 'cc-harness', key: 'pushSent' } as const, false)
const pr = atom({ plugin: 'cc-harness', key: 'pr' } as const, null)
const progress = atom({ plugin: 'cc-harness', key: 'progress' } as const, null)

// Push 鍵：按下同一顆鍵原地變灰「已送出…」；push 完成（領先歸零）或 2 分鐘後才恢復，期間再按不重送。
// prompt.submit 會排隊到 session 閒下來才送，延遲改不了，所以回饋要在送出前就給。
async function requestPush($: EngineInterface): Promise<void> {
  let claimed = false
  await update($, pushSent, sent => {
    claimed = !sent
    return true
  })
  if (!claimed) return
  $.clock.after(120_000, () => void update($, pushSent, () => false).catch(() => null))
  await $.prompt.submit({ text: 'push', asUser: true })
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
  if (info.ahead === 0) await update($, pushSent, () => false)
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

// 進度：本回合（主迴圈）的經過時間、工具次數、執行中的子 agent；5 秒更新一次。
let ticker: { cancel: () => void } | null = null

async function tick($: EngineInterface): Promise<void> {
  let agents = 0
  try {
    agents = (await $.agent.list()).filter(a => a.status === 'running' || a.status === 'pending').length
  } catch {
    agents = 0
  }
  const now = await $.clock.now()
  await update($, progress, p => (p === null ? p : { ...p, now, agents }))
}

async function startProgress($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  await update($, progress, p => ({
    running: true,
    startedAt: now,
    now,
    tools: 0,
    agents: 0,
    lastMs: p?.lastMs ?? 0,
    lastTools: p?.lastTools ?? 0,
  }))
  ticker?.cancel()
  ticker = $.clock.every(5_000, () => void tick($).catch(() => null))
}

async function stopProgress($: EngineInterface): Promise<void> {
  ticker?.cancel()
  ticker = null
  const now = await $.clock.now()
  await update($, progress, p =>
    p === null || !p.running ? p : { ...p, running: false, now, agents: 0, lastMs: now - p.startedAt, lastTools: p.tools },
  )
}

const CHECK_MARK: Record<string, string> = { pass: '✓', fail: '✗', pending: '…', none: '' }
const CHECK_COLOR: Record<string, string | undefined> = { pass: 'success', fail: 'error', pending: 'warning', none: undefined }

// 一回合只報一次；turn.start 重設 reported。
let reported = false

async function finishTurn($: EngineInterface, answer: string): Promise<void> {
  await stopProgress($)
  if (reported) return
  reported = true
  const notes: string[] = []
  if (turnEdits.length > 0 && verifySeq < editSeq) {
    const names = turnEdits.map(p => p.split('/').pop()).slice(0, 3).join('、')
    const more = turnEdits.length > 3 ? ` 等 ${turnEdits.length} 個檔` : ''
    notes.push(`⚠ 本回合改了 ${names}${more}，改完之後沒有跑測試、gate 或瀏覽器驗證。`)
  }
  const hits = langHits(answer)
  if (hits.length > 0) notes.push(`⚠ 回覆含簡體字或港式字：${hits.join('、')}`)
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
    await update($, pushSent, () => false)
    await $.command.register({ name: 'cc-watch', description: '打開工作區狀態面板（未 commit、未 push、BACKLOG）' })
    await update($, progress, p => (p === null ? p : { ...p, running: false }))
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
      await startProgress($)
      seq = 0
      editSeq = 0
      verifySeq = 0
      turnEdits = []
    }
    return next(e)
  })

  // 主迴圈與子 agent 的工具呼叫都算（子 agent 跑在主回合裡面）。
  on('tool.call', async ($, e, next) => {
    void update($, progress, p => (p === null || !p.running ? p : { ...p, tools: p.tools + 1 })).catch(() => null)
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const path = editedPath(tool, input)
    if (path !== null && isCodePath(path)) {
      editSeq = ++seq
      if (!turnEdits.includes(path)) turnEdits.push(path)
      await update($, touched, list => (list.includes(path) ? list : [...list, path].slice(-500)))
      void refreshGit($).catch(() => null)
    } else if (isVerifyCall(tool, input)) {
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
    if (e.agentId === undefined) await finishTurn($, e.reason === 'answer' ? e.answer : '')
    return res
  })

  on('classic.Stop', async ($, e, next) => {
    const res = await next(e)
    await finishTurn($, e.last_assistant_message ?? '')
    return res
  })

  // 輸入框上方一行：常駐的精簡版；詳細內容在面板（/cc-watch 或「詳細」鍵）。
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const info = await read($, git)
    if (info === null || e.props.hasSurvey) return next(e)
    const lastWarning = await read($, warning)
    const sent = await read($, pushSent)
    const prs = await read($, pr)
    const prog = await read($, progress)
    const { Box, Text, Button } = $.ui.resolve(e)
    const dirty = info.mineDirty.length
    const cur = prs?.current ?? null
    return (
      <Box>
        {prog?.running === true && (
          <Text color="claude" bold>
            ● {fmtDuration(prog.now - prog.startedAt)} · 工具 {prog.tools}
            {prog.agents > 0 ? ` · 子 agent ${prog.agents}` : ''}
            {'  '}
          </Text>
        )}
        {prog?.running !== true && prog !== null && (prog.lastMs > 0 || prog.lastTools > 0) && (
          <Text dimColor>
            上輪 {fmtDuration(prog.lastMs)} · 工具 {prog.lastTools}
            {'  '}
          </Text>
        )}
        <Text color="claude" bold>
          {info.branch}
        </Text>
        {!info.hasUpstream && <Text dimColor> · 沒有遠端分支</Text>}
        {info.hasUpstream && info.ahead === 0 && info.behind === 0 && <Text color="success"> · 已同步</Text>}
        {info.hasUpstream && info.ahead > 0 && <Text color="suggestion"> · 領先 {info.ahead}</Text>}
        {info.hasUpstream && info.behind > 0 && <Text color="warning"> · 落後 {info.behind}</Text>}
        <Text color={dirty > 0 ? 'warning' : 'success'}> · 未 commit {dirty}</Text>
        {cur !== null && (
          <Text color={CHECK_COLOR[cur.checks]}>
            {' '}
            · PR #{cur.number} {CHECK_MARK[cur.checks]}
          </Text>
        )}
        {cur === null && prs !== null && prs.mineOpen.length > 0 && (
          <Text color="suggestion"> · 開著的 PR {prs.mineOpen.length}</Text>
        )}
        <Text dimColor>{info.backlog !== null ? ` · BACKLOG ${info.backlog} ` : ' '}</Text>
        {info.hasUpstream && info.ahead > 0 && (
          <Button
            key="push"
            variant={sent ? 'secondary' : 'primary'}
            dimColor={sent}
            label={sent ? '已送出…' : `Push ${info.ahead}`}
            onPress={() => requestPush($)}
          />
        )}
        {lastWarning !== null && <Text color="warning"> {lastWarning} </Text>}
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
    const sent = await read($, pushSent)
    const prs = await read($, pr)
    const prog = await read($, progress)
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
        <Text color={info.mineDirty.length > 0 ? 'warning' : undefined}>
          本 session 改過、未 commit：{info.mineDirty.length} 個檔
        </Text>
        {list.map(rel => (
          <Text dimColor>  {rel}</Text>
        ))}
        {info.mineDirty.length > list.length && <Text dimColor>  …還有 {info.mineDirty.length - list.length} 個</Text>}
        {info.backlog !== null && <Text>BACKLOG：{info.backlog} 條</Text>}
        {prog !== null && (
          <Text color={prog.running ? 'claude' : undefined}>
            {prog.running
              ? `執行中 ${fmtDuration(prog.now - prog.startedAt)} · 工具 ${prog.tools} 次 · 子 agent ${prog.agents} 個`
              : `上輪 ${fmtDuration(prog.lastMs)} · 工具 ${prog.lastTools} 次`}
          </Text>
        )}
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
          {info.hasUpstream && info.ahead > 0 && (
            <Button
              key="push"
              variant={sent ? 'secondary' : 'primary'}
              dimColor={sent}
              label={sent ? 'push 已送出…' : `Push（${info.ahead} 個 commit）`}
              onPress={() => requestPush($)}
            />
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
