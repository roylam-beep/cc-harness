#!/usr/bin/env node
// log-harness-event.mjs 的負向驗證。跑：node test/log-harness-event.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toLine, logPathFor, projectDirFromCwd } from '../hooks/log-harness-event.mjs';

const HOOK = new URL('../hooks/log-harness-event.mjs', import.meta.url).pathname;
let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log(`  ok  ${name}`); };

// --- toLine ---
t('使用者打的 slash command → skill-user 行，帶 command_name', () => {
  const l = toLine({ hook_event_name: 'UserPromptExpansion', session_id: 'abcdefgh-1111',
    command_name: 'cc-close', command_source: 'user', expansion_type: 'slash_command' });
  const f = l.split('\t');
  assert.equal(f[1], 'abcdefgh');
  assert.equal(f[2], 'skill-user');
  assert.equal(f[3], 'cc-close');
});

t('agent 派的 Skill → skill-agent 行', () => {
  const l = toLine({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'cc-handover' } });
  assert.equal(l.split('\t')[2], 'skill-agent');
  assert.equal(l.split('\t')[3], 'cc-handover');
});

t('PreToolUse 但不是 Skill → 不記', () => {
  assert.equal(toLine({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }), null);
});

t('InstructionsLoaded → instr 行，帶 memory_type/load_reason 與字元數', () => {
  const d = mkdtempSync(join(tmpdir(), 'harness-'));
  const fp = join(d, 'CLAUDE.md');
  writeFileSync(fp, '12345');
  const f = toLine({ hook_event_name: 'InstructionsLoaded', file_path: fp,
    memory_type: 'User', load_reason: 'session_start' }).split('\t');
  assert.equal(f[2], 'instr');
  assert.equal(f[4], 'User/session_start');
  assert.equal(f[5], '5');
});

t('中文檔算字元不算位元組（跟 session-start.sh 的 wc -m 同單位）', () => {
  // 位元組是字元的三倍。兩邊不同單位＝P6 拿到兩個不同的分母。
  const d = mkdtempSync(join(tmpdir(), 'harness-cjk-'));
  const fp = join(d, 'AGENTS.md');
  writeFileSync(fp, '中文規則五字');
  const f = toLine({ hook_event_name: 'InstructionsLoaded', file_path: fp,
    memory_type: 'Project', load_reason: 'session_start' }).split('\t');
  assert.equal(f[5], '6');
});

t('檔案不存在時字元數留空，不丟例外', () => {
  const f = toLine({ hook_event_name: 'InstructionsLoaded', file_path: '/nope/x.md',
    memory_type: 'Project', load_reason: 'include' }).split('\t');
  assert.equal(f[5], '');
});

t('未知事件 → 不記', () => {
  assert.equal(toLine({ hook_event_name: 'Stop' }), null);
});

t('名稱含換行／tab 被壓成空白，一筆不跨行', () => {
  const l = toLine({ hook_event_name: 'UserPromptExpansion', command_name: 'a\nb\tc' });
  assert.equal(l.includes('\n'), false);
  assert.equal(l.split('\t')[3], 'a b c');
});

// --- logPathFor ---
t('有 transcript_path 就用它的目錄', () => {
  assert.equal(logPathFor({ transcript_path: '/x/y/s.jsonl' }), '/x/y/harness.log');
});

t('沒有 transcript_path 時退回用 cwd 推 projects 目錄', () => {
  const p = logPathFor({ cwd: '/Users/a/Documents/3.AGENT/cc-harness' });
  assert.match(p, /\.claude\/projects\/-Users-a-Documents-3-AGENT-cc-harness\/harness\.log$/);
});

t('兩個都沒有 → null（不寫、不炸）', () => {
  assert.equal(logPathFor({}), null);
});

t('cwd 轉目錄名：非英數一律變 -', () => {
  assert.equal(projectDirFromCwd('/a/b.c_d'), '-a-b-c-d');
});

// --- 端到端：真的跑一次 hook ---
t('端到端：餵 UserPromptExpansion payload → harness.log 多一行', () => {
  const d = mkdtempSync(join(tmpdir(), 'harness-e2e-'));
  const tp = join(d, 'sess.jsonl');
  execFileSync('node', [HOOK], {
    input: JSON.stringify({ hook_event_name: 'UserPromptExpansion', transcript_path: tp,
      session_id: 'deadbeef-0000', command_name: 'cc-gate', command_source: 'user' }),
  });
  const log = readFileSync(join(d, 'harness.log'), 'utf8');
  assert.match(log, /\tskill-user\tcc-gate\t/);
  assert.equal(log.trimEnd().split('\n').length, 1);
});

t('端到端：壞 JSON → exit 0 且不產檔（fail open）', () => {
  const d = mkdtempSync(join(tmpdir(), 'harness-bad-'));
  const out = execFileSync('node', [HOOK], { input: 'not json{', cwd: d });
  assert.equal(String(out), '');
  assert.equal(existsSync(join(d, 'harness.log')), false);
});

t('端到端：Bash 的 PreToolUse → exit 0 且不產行（不會誤擋工具）', () => {
  const d = mkdtempSync(join(tmpdir(), 'harness-bash-'));
  const tp = join(d, 'sess.jsonl');
  execFileSync('node', [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash',
      transcript_path: tp, tool_input: { command: 'rm -rf /' } }),
  });
  assert.equal(existsSync(join(d, 'harness.log')), false);
});

console.log(`\nlog-harness-event: ${pass} 項全過`);
