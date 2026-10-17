import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { isCodePath, isVerifyCall, langHits, mineDirty, parsePorcelain } from '../hooks/cc-watch-logic'

const ROOT = '/repo'

// 假的 git：ahead 決定 rev-list 的回答，null＝沒有 upstream。
function fakeHost(on: On, opts: { ahead: number | null; dirty: string }) {
  mock.clock(on)
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
    return ok('')
  })
  on('fs.read', () => ({ value: '| # | 一行 |\n|---|---|\n| 1 | a |\n| 2 | b |\n' }))
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('tool.call', () => ({ result: 'ok', text: 'ok' }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
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

  test('porcelain 與本 session 的 dirty 檔', async () => {
    const dirty = parsePorcelain(' M src/a.ts\0R  new.ts\0old.ts\0?? b.ts\0')
    expect([...dirty].sort()).toEqual(['b.ts', 'new.ts', 'old.ts', 'src/a.ts'])
    expect(mineDirty('/repo', ['/repo/src/a.ts', '/repo/c.ts', '/other/b.ts'], dirty)).toEqual(['src/a.ts'])
  })
})

describe('完成前檢查', () => {
  test('改了程式、沒驗證 → 提醒', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: ' M src/a.ts\0' })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' } as never)
    const res = await $.turn.complete(done('改好了'))
    expect(res.text).toContain('沒有跑測試')
    expect(res.text).toContain('還沒 commit 的檔有 1 個')
  })

  test('改完有跑測試 → 不提醒驗證', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' } as never)
    await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
    const res = await $.turn.complete(done('改好了，測試綠'))
    expect(res.text).toBe('改好了，測試綠')
  })

  test('先測試再改 → 仍提醒', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
    await $.tool.call({ tool: 'Write', file_path: '/repo/src/b.ts', content: 'x' } as never)
    const res = await $.turn.complete(done('改好了'))
    expect(res.text).toContain('沒有跑測試')
  })

  test('只改文件 → 不提醒', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '寫報告', turnId: 't1' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/docs/r.md', content: 'x' } as never)
    const res = await $.turn.complete(done('寫好了'))
    expect(res.text).toBe('寫好了')
  })

  test('子 agent 的報告原樣交回', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '改一下', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' } as never)
    const res = await $.turn.complete(done('这是报告', { agentId: 'sub1' }))
    expect(res.text).toBe('这是报告')
  })

  test('回覆含簡體字 → 提醒', async ($, on) => {
    fakeHost(on, { ahead: 0, dirty: '' })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    await $.turn.start({ text: '問題', turnId: 't1' })
    const res = await $.turn.complete(done('这个可以'))
    expect(res.text).toContain('簡體字或港式字：这、个')
  })
})

describe('狀態面板', () => {
  const PANE = { plugin: 'cc-harness', component: 'Pane', requestId: 'cc-watch', props: {} } as const

  test('有未 push 的 commit → Push 鍵送出 push', async ($, on) => {
    fakeHost(on, { ahead: 2, dirty: '' })
    const sent: string[] = []
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: e.text } as never
    })
    await $.session.start({ cwd: ROOT, surface: null, isInteractive: true } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface } as never)
      expect((await ui.find({ key: 'push' }))?.text).toContain('2 個 commit')
      expect(await ui.find({ type: 'Text', text: /BACKLOG：2 條/ })).toBeDefined()
      await ui.press({ key: 'push' })
      await ui.unmount()
    }
    expect(sent).toEqual(['push', 'push'])
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
