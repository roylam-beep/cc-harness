import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { checkState, isCodePath, isVerifyCall, langHits, mineDirty, parsePorcelain } from '../hooks/cc-watch-logic'

const ROOT = '/repo'

// 假的 git：ahead 決定 rev-list 的回答，null＝沒有 upstream。
const toasts: string[] = []

// 回合結束的提醒文字：系統訊息列＋toast 合起來看。
function notices(session: { appended: () => readonly { message: unknown }[] }): string {
  return session
    .appended()
    .map(r => JSON.stringify(r.message))
    .concat(toasts)
    .join('\n')
}

function fakeHost(on: On, opts: { ahead: number | null; dirty: string; prs?: string; current?: string }) {
  toasts.length = 0
  mock.clock(on)
  on('ui.toast', ($, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? ''))
    return { value: undefined } as never
  })
  on('process.run', ($, e) => {
    const cmd = e.argv.join(' ')
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (cmd === 'git rev-parse --show-toplevel') return ok(ROOT + '\n')
    if (cmd === 'git rev-parse --abbrev-ref HEAD') return ok('main\n')
    if (cmd.startsWith('git rev-list')) {
      return opts.ahead === null
        ? { value: { exitCode: 128, stdout: '', stderr: 'no upstream', isStdoutTruncated: false, isStderrTruncated: false } }
        : ok(`0\t${opts.ahead}\n`)
    }
    if (cmd.startsWith('git status')) return ok(opts.dirty)
    if (cmd.startsWith('gh pr list')) return ok(opts.prs ?? '[]')
    if (cmd.startsWith('gh pr view')) {
      return opts.current === undefined
        ? { value: { exitCode: 1, stdout: '', stderr: 'no pull requests', isStdoutTruncated: false, isStderrTruncated: false } }
        : ok(opts.current)
    }
    return ok('')
  })
  on('fs.read', () => ({ value: '| # | 一行 |\n|---|---|\n| 1 | a |\n| 2 | b |\n' }))
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('tool.call', () => ({ result: 'ok', text: 'ok' }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('classic.Stop', () => ({}) as never)
}

const done = (answer: string, extra: Record<string, unknown> = {}) =>
  ({ answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', ...extra }) as never

describe('logic', () => {
  test('簡體字與港式字', async () => {
    expect(langHits('這是繁體，沒問題')).toEqual([])
    expect(langHits('这个软件')).toEqual(['这', '个', '软'])
    expect(langHits('我哋唔係咁')).toEqual(['唔', '係', '咁'])
    expect(langHits('兩者的關係與係數')).toEqual([])
    expect(langHits('看 `这里` 和 /tmp/这个 路徑')).toEqual([])
  })

  test('哪些檔算改程式', async () => {
    expect(isCodePath('/repo/src/a.ts')).toBe(true)
    expect(isCodePath('/repo/docs/x.md')).toBe(false)
    expect(isCodePath('/private/tmp/claude-501/x.ts')).toBe(false)
    expect(isCodePath('/Users/a/.claude/projects/p/memory/m.md')).toBe(false)
  })

  test('哪些動作算驗證', async () => {
    expect(isVerifyCall('Bash', { command: 'npm run test' })).toBe(true)
    expect(isVerifyCall('Bash', { command: 'claude plugin test ./m' })).toBe(true)
    expect(isVerifyCall('Bash', { command: 'git status' })).toBe(false)
    expect(isVerifyCall('Agent', {})).toBe(true)
    expect(isVerifyCall('Skill', { skill: 'cc-harness:cc-gate' })).toBe(true)
    expect(isVerifyCall('mcp__Claude_Browser__navigate', {})).toBe(true)
  })

  test('PR 檢查結論', async () => {
    expect(checkState([])).toBe('none')
    expect(checkState([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }])).toBe('pass')
    expect(checkState([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'SUCCESS' }])).toBe('pending')
    expect(checkState([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'FAILURE' }])).toBe('fail')
  })

  test('porcelain 與本 session 的 dirty 檔', async () => {
    const dirty = parsePorcelain(' M src/a.ts\0R  new.ts\0old.ts\0?? b.ts\0')
    expect([...dirty].sort()).toEqual(['b.ts', 'new.ts', 'old.ts', 'src/a.ts'])
    expect(mineDirty('/repo', ['/repo/src/a.ts', '/repo/c.ts', '/other/b.ts'], dirty)).toEqual(['src/a.ts'])
  })
})

describe('完成前檢查', () => {
  test('改了程式、沒驗證 → 提醒', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: ' M src/a.ts\0' })
    const session = mock.session(on)
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' } as never)
    const res = await $.turn.complete(done('改好了'))
    expect(res.text).toBe('改好了')
    expect(notices(session)).toContain('沒有跑測試')
    expect(notices(session)).toContain('還沒 commit 的檔有 1 個')
  })

  test('改完有跑測試 → 不提醒驗證', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    const session = mock.session(on)
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' } as never)
    await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
    const res = await $.turn.complete(done('改好了，測試綠'))
    expect(res.text).toBe('改好了，測試綠')
    expect(notices(session)).toBe('')
  })

  test('先測試再改 → 仍提醒', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    const session = mock.session(on)
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
    await $.tool.call({ tool: 'Write', file_path: '/repo/src/b.ts', content: 'x' } as never)
    const res = await $.turn.complete(done('改好了'))
    expect(notices(session)).toContain('沒有跑測試')
  })

  test('只改文件 → 不提醒', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    const session = mock.session(on)
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '寫報告', turnId: 't1' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/docs/r.md', content: 'x' } as never)
    const res = await $.turn.complete(done('寫好了'))
    expect(res.text).toBe('寫好了')
    expect(notices(session)).toBe('')
  })

  test('子 agent 的報告原樣交回', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    const session = mock.session(on)
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' } as never)
    const res = await $.turn.complete(done('这是报告', { agentId: 'sub1' }))
    expect(res.text).toBe('这是报告')
    expect(notices(session)).toBe('')
  })

  test('回覆含簡體字 → 提醒', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    const session = mock.session(on)
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '問題', turnId: 't1' })
    const res = await $.turn.complete(done('这个可以'))
    expect(notices(session)).toContain('簡體字或港式字：这、个')
  })

  test('回合被中斷（aborted）也提醒', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    const session = mock.session(on)
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' } as never)
    await $.turn.complete(done('', { reason: 'aborted', isAborted: true }))
    expect(notices(session)).toContain('沒有跑測試')
  })

  test('只有 Stop 事件也提醒；兩個都來只報一次', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    const session = mock.session(on)
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' } as never)
    await $.classic.Stop({ stop_hook_active: false } as never)
    await $.turn.complete(done('改好了'))
    expect(session.appended().length).toBe(1)
    expect(notices(session)).toContain('沒有跑測試')
  })
})

describe('狀態面板', () => {
  const PANE = { plugin: 'cc-harness', component: 'Pane', requestId: 'cc-watch', props: {} } as const

  test('有未 push 的 commit → Push 鍵把 push 填進輸入框（不直接送出）', async ($, on) => {
    fakeHost(on, { ahead: 2, dirty: '' })
    const filled: string[] = []
    const submitted: string[] = []
    on('prompt.fill', ($, e) => {
      filled.push(e.text)
      return { isFilled: true } as never
    })
    on('prompt.submit', ($, e) => {
      submitted.push(e.text)
      return { text: e.text } as never
    })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' } as never)
    expect((await ui.find({ key: 'push' }))?.text).toContain('2 個 commit')
    expect(await ui.find({ key: 'commit' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /BACKLOG：2 條/ })).toBeDefined()
    await ui.press({ key: 'push' })
    await ui.unmount()
    expect(filled).toEqual(['push'])
    expect(submitted).toEqual([])
  })

  test('沒有 upstream → 不顯示 Push 鍵', async ($, on) => {
    fakeHost(on, { ahead: null, dirty: '' })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface } as never)
      expect(await ui.find({ key: 'push' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /沒有對應的遠端分支/ })).toBeDefined()
      await ui.unmount()
    }
  })
})

describe('輸入框上方狀態列', () => {
  const BAND = { plugin: 'cc-harness', component: 'AbovePrompt', props: { hasSurvey: false } } as const

  test('一行顯示狀態；Commit／Push 鍵各自把字填進輸入框', async ($, on) => {
    fakeHost(on, { ahead: 3, dirty: ' M src/a.ts\0' })
    const filled: string[] = []
    on('prompt.fill', ($, e) => {
      filled.push(e.text)
      return { isFilled: true } as never
    })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface } as never)
      expect(await ui.find({ type: 'Text', text: /領先 3/ })).toBeDefined()
      expect(await ui.find({ key: 'detail' })).toBeDefined()
      expect((await ui.find({ key: 'push' }))?.text).toContain('Push 3')
      expect((await ui.find({ key: 'commit' }))?.text).toContain('Commit 1')
      await ui.press({ key: 'commit' })
      await ui.press({ key: 'push' })
      await ui.unmount()
    }
    expect(filled).toEqual(['commit', 'push', 'commit', 'push'])
  })

  test('沒有 upstream → 沒有 Push 鍵', async ($, on) => {
    fakeHost(on, { ahead: null, dirty: '' })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface } as never)
      expect(await ui.find({ key: 'push' })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('上回合沒驗證 → 狀態列顯示 ⚠，下回合開始就清掉', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' } as never)
    await $.turn.complete(done('改好了'))
    let ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
    expect(await ui.find({ type: 'Text', text: /沒有跑測試/ })).toBeDefined()
    await ui.unmount()
    await $.turn.start({ text: '下一題', turnId: 't2' })
    ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
    expect(await ui.find({ type: 'Text', text: /沒有跑測試/ })).toBeUndefined()
    await ui.unmount()
  })

  test('目前分支有 PR → 顯示 PR 號碼與檢查結果', async ($, on) => {
    const one = JSON.stringify({ number: 12, title: 't', url: 'https://x/12', reviewDecision: '', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] })
    fakeHost(on, { ahead: 0, dirty: '', prs: `[${one}]`, current: one })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    const pane = await $.ui.mount({ plugin: 'cc-harness', component: 'Pane', requestId: 'cc-watch', props: {}, surface: 'desktop' } as never)
    await pane.press({ key: 'refresh' })
    await pane.unmount()
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface } as never)
      expect(await ui.find({ type: 'Text', text: /PR #12 ✗/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /已同步/ })).toBeDefined()
      await ui.unmount()
    }
  })

})
