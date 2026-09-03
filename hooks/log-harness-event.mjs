#!/usr/bin/env node
// harness 感測器（P1）：把「誰用了哪支 skill」與「這個 session 載入了哪些指令檔」
// 各記一行到 ~/.claude/projects/<dir>/harness.log。
//
// 為什麼要有這支：skill-usage.py 是事後掃逐字稿，格式一改就歸零（見該檔檔頭死法）。
// 本檔是即時記錄，兩者互為備援；退役／死法判定以兩邊對得上的數字為準。
//
// 掛三個事件（事件名與欄位皆實測自 Claude Code 2.1.259 的 HOOK_EVENT_REGISTRY）：
//   · UserPromptExpansion — 使用者打的 slash command 展開時。payload 欄位：
//     expansion_type, command_name, command_args, command_source, prompt。
//     只在「user-typed」時觸發，所以它記的一定是使用者自己打的。
//   · PreToolUse matcher `Skill` — agent 自己派的 skill。payload: tool_input.skill。
//   · InstructionsLoaded — 每載入一個 CLAUDE.md／rule 檔觸發一次。payload 欄位：
//     file_path, memory_type(User|Project|Local|Managed), load_reason, globs?,
//     trigger_file_path?, parent_file_path?。這就是 P6 要的常駐總量來源。
//
// 只寫名字、類別、位元組數，不寫任何訊息正文或參數內容——與 skill-usage.py 同一條隱私線。
//
// **恆 exit 0（fail open）**：這支壞掉最糟是少記一筆；擋下 tool call 或弄壞開場糟得多。
// PreToolUse 尤其不能非 0，非 0 會被當成阻擋。
//
// 負向驗證見 test/log-harness-event.test.mjs：三種 payload 各產一行；未知事件不產行；
// 壞 JSON exit 0 不產行；無 transcript_path 時退回用 cwd 推目錄。

import { appendFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/** cwd → ~/.claude/projects 的目錄名（非英數一律變 `-`，與 Claude Code 同規則）。 */
export function projectDirFromCwd(cwd) {
  return String(cwd ?? '').replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * log 檔位置。優先用 transcript_path 的目錄——那一定是對的 project 目錄；
 * 沒有時才用 cwd 推。兩個都沒有就回 null（不寫、不炸）。
 */
export function logPathFor(payload) {
  const t = payload?.transcript_path;
  if (typeof t === 'string' && t) return join(dirname(t), 'harness.log');
  const cwd = payload?.cwd;
  if (typeof cwd === 'string' && cwd) {
    return join(homedir(), '.claude', 'projects', projectDirFromCwd(cwd), 'harness.log');
  }
  return null;
}

function sizeOf(p) {
  try { return statSync(p).size; } catch { return ''; }
}

/** 只留單行可用的字元，避免一筆記錄跨行把 log 弄髒。 */
function clean(v) {
  return String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

/**
 * 把 payload 轉成一行 TSV，回 null＝這個事件不記。
 * 欄位：時間 / 種類 / 名稱 / 補充1 / 補充2。
 */
export function toLine(payload, now = new Date()) {
  const ev = payload?.hook_event_name;
  const sid = clean(payload?.session_id).slice(0, 8);
  const ts = now.toISOString();
  const row = (kind, name, a = '', b = '') => [ts, sid, kind, clean(name), clean(a), clean(b)].join('\t');

  if (ev === 'UserPromptExpansion') {
    return row('skill-user', payload.command_name, payload.command_source, payload.expansion_type);
  }
  if (ev === 'PreToolUse') {
    if (payload?.tool_name !== 'Skill') return null; // matcher 應該已篩掉，這是第二道
    return row('skill-agent', payload?.tool_input?.skill);
  }
  if (ev === 'InstructionsLoaded') {
    const fp = payload.file_path;
    return row('instr', fp, `${payload.memory_type ?? ''}/${payload.load_reason ?? ''}`, sizeOf(fp));
  }
  return null;
}

export function append(line, path) {
  if (!line || !path) return false;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${line}\n`, 'utf8');
  return true;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  try {
    const payload = JSON.parse(await readStdin());
    append(toLine(payload), logPathFor(payload));
  } catch {
    // fail open，見檔頭
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((c) => process.exit(c));
}
