#!/usr/bin/env node
// PreToolUse(Bash)：看守腳本只准背景跑。由本 plugin 的 hooks/hooks.json 掛上。
//
// `wait-for-run.js` 是 Cursor cloud agent 的看守腳本，一跑幾十分鐘；Bash 前景 10 分鐘就被砍，
// 看起來就是「聽到一半斷了」。所以**執行**它而 `tool_input.run_in_background` 不是 true → 擋（exit 2）。
// 不是不可逆，是必然失敗的用法。
//
// 只擋「執行」：段落第一個 token 就是腳本，或第一個 token 是直譯器（node、sh…）、後面第一個非旗標參數是腳本。
// `ls`／`cat`／`grep` 只是提到路徑不擋。複合指令拆 `&&`／`;`／`|`／換行逐段判；heredoc 內文不算。
//
// 設定（帳號層 settings.json 的 env，要重開 session；agent 在指令前寫的變數本進程讀不到）：
//   · `CC_GUARD_BASH=off` 或 `CC_GUARD_BASH_ALLOW` 含 `watch-script`：不擋。沿用 cc-harness guard-bash 的鍵名。
//   · `CC_GUARD_BASH_WATCH_SCRIPTS`：追加看守腳本檔名（逗號分隔），內建 `wait-for-run.js` 永遠在。
//
// **解析失敗一律放行（fail open）**：壞掉時最糟是「攔不到」，而不是「所有 Bash 呼叫都死」。
//
// 防什麼：前景跑看守腳本，10 分鐘後整個看守被砍，run 結束時沒人被叫醒。

import { fileURLToPath } from 'node:url';

export const WATCH_SCRIPT = 'wait-for-run.js';
const SEGMENT_SPLIT = /(?:&&|\|\||[;\n|])/;
const INTERPRETERS = new Set(['node', 'sh', 'bash', 'zsh', 'python', 'python3', 'deno', 'bun', 'nohup', 'exec']);

const parseList = (value) => String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const unquote = (t) => t.replace(/^["']|["']$/g, '');

/** heredoc 內文整段拿掉（`cat <<'EOD' … EOD` 裡提到腳本不算執行）。 */
export function stripHeredocs(command) {
  const lines = String(command ?? '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    out.push(lines[i]);
    const opener = /<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(lines[i]);
    if (!opener) continue;
    while (i + 1 < lines.length && lines[i + 1].trim() !== opener[2]) i += 1;
    i += 1; // 跳過結尾的 delimiter 行
  }
  return out.join('\n');
}

/** 這一段在執行哪支看守腳本？沒有回 null。 */
function executedScript(segment, scripts) {
  const tokens = segment.trim().split(/\s+/).map(unquote).filter((t) => !/^\w+=/.test(t));
  const isScript = (t) => scripts.find((s) => t === s || t.endsWith(`/${s}`));
  if (!tokens.length) return null;
  if (isScript(tokens[0])) return isScript(tokens[0]);
  if (!INTERPRETERS.has(tokens[0].split('/').pop())) return null;
  const arg = tokens.slice(1).find((t) => !t.startsWith('-'));
  return arg ? isScript(arg) ?? null : null;
}

/** 回 null＝放行；回 { key, rule, why, hint }＝擋。 */
export function classifyToolInput(toolInput, env = {}) {
  const command = toolInput?.command;
  if (typeof command !== 'string') return null;
  if (env.CC_GUARD_BASH === 'off' || parseList(env.CC_GUARD_BASH_ALLOW).includes('watch-script')) return null;
  if (toolInput.run_in_background === true) return null;
  const scripts = [WATCH_SCRIPT, ...parseList(env.CC_GUARD_BASH_WATCH_SCRIPTS)];
  const watched = stripHeredocs(command).split(SEGMENT_SPLIT).map((seg) => executedScript(seg, scripts)).find(Boolean);
  if (!watched) return null;
  return {
    key: 'watch-script',
    rule: `${watched} 前景執行`,
    why: 'Bash 前景最長 10 分鐘，看守的 run 動輒更久；時間到整個看守被砍，看起來就是「聽到一半斷了」。',
    hint: '同一條指令改帶 `run_in_background: true`，然後結束這一輪——腳本結束時 harness 會叫醒你。只想看一眼現況用一次性的查詢（Cursor 是 `cursor_get_run`），不要前景等。',
  };
}

async function main() {
  let payload;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return 0; // fail open
  }
  const hit = classifyToolInput(payload?.tool_input, process.env);
  if (!hit) return 0;
  console.error(`⛔ PreToolUse 擋下：${hit.rule}`);
  console.error(`   為什麼擋：${hit.why}`);
  console.error(`   怎麼走：${hit.hint}`);
  console.error('   若這是誤擋：請使用者在帳號層 settings.json 的 env 設 "CC_GUARD_BASH_ALLOW": "watch-script"，並重開 session（agent 設不了）。');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
