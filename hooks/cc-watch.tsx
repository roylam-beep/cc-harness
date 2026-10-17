import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitInfo } from '../types'
import {
  countBacklog,
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
  return info
}

// 一回合只報一次；turn.start 重設 reported。
let reported = false

async function finishTurn($: EngineInterface, answer: string): Promise<void> {
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
    await $.command.register({ name: 'cc-watch', description: '打開工作區狀態面板（未 commit、未 push、BACKLOG）' })
    await refreshGit($)
    $.clock.every(60_000, () => void refreshGit($).catch(() => null))
    return next(e)
  })

  on('command.run', { command: 'cc-watch' }, async $ => {
    await refreshGit($)
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
    if (path !== null && isCodePath(path)) {
      editSeq = ++seq
      if (!turnEdits.includes(path)) turnEdits.push(path)
      await update($, touched, list => (list.includes(path) ? list : [...list, path].slice(-500)))
      void refreshGit($).catch(() => null)
    } else if (isVerifyCall(tool, input)) {
      verifySeq = ++seq
    }
    if (tool === 'Bash' && /\bgit\b/.test(String(input.command ?? ''))) void refreshGit($).catch(() => null)
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
    const { Box, Text, Button } = $.ui.resolve(e)
    const sync = info.hasUpstream ? `領先 ${info.ahead}／落後 ${info.behind}` : '沒有遠端分支'
    return (
      <Box>
        <Text dimColor>
          {info.branch} · {sync} ·{' '}
        </Text>
        <Text color={info.mineDirty.length > 0 ? 'warning' : undefined} dimColor={info.mineDirty.length === 0}>
          未 commit {info.mineDirty.length}
        </Text>
        <Text dimColor>{info.backlog !== null ? ` · BACKLOG ${info.backlog} ` : ' '}</Text>
        {info.hasUpstream && info.ahead > 0 && (
          <Button
            key="push"
            variant="primary"
            label={`Push ${info.ahead}`}
            onPress={async () => {
              await $.prompt.submit({ text: 'push', asUser: true })
            }}
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
        <Box>
          {info.hasUpstream && info.ahead > 0 && (
            <Button
              key="push"
              variant="primary"
              label={`Push（${info.ahead} 個 commit）`}
              onPress={async () => {
                await $.prompt.submit({ text: 'push', asUser: true })
              }}
            />
          )}
          <Button key="refresh" label="重新整理" onPress={async () => void (await refreshGit($))} />
        </Box>
        <Text dimColor>落後數以上次 fetch 為準；用 shell 改的檔（sed、heredoc）不會被記到。</Text>
      </Box>
    )
  })
}
