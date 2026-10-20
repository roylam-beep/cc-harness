#!/usr/bin/env node
// PreToolUse(Write|Edit|MultiEdit|NotebookEdit|Bash)：寫入**帳號層**前先問使用者。
//
// 帳號層＝`~/.claude/**`、`~/.claude.json`（含 `.claude.json.*`）、`~/.agents/**`；設了 `CLAUDE_CONFIG_DIR` 時它指的目錄也算。改這裡會影響
// 這台機器上**每一個** repo 的每一個 session，所以不論 agent 自己覺得多安全，都要使用者當場點頭。
// 帳號層寫入邊界的權威定義就是本檔（2026-10-18 起全域 CLAUDE.md 不再另寫一份）。
//
// **放行（不問）**：
//   · `~/.claude/projects/*/memory/**` — agent 可自由寫（內容規則在全域 CLAUDE.md）；攔它每存一次記憶就跳一次窗。
//   · `~/.claude/plans/**` — plan mode 的計畫檔，CLI 指定 agent 寫在這裡。
//   · repo 內的 `.claude/`（專案級）— 不是帳號層，路徑比對只認 `$HOME/.claude`。
//   · 讀：`cat`／`ls`／`grep`／`git -C ~/.claude status|log|diff` 這類一律放行，只攔寫。
//
// **問法是 ask 不是 block**：與 guard-bash（exit 2 硬擋）不同，本檔 exit 0 並在 stdout 印
// `permissionDecision: "ask"`，app 跳權限窗讓使用者按允許／拒絕。因為結果只是多點一下，
// Bash 這支**寧可多問**：
//   · heredoc 內文**不剝掉**——直譯器（python／node／sh…）的 heredoc 或 `-c` 字串裡同時出現
//     帳號層路徑與寫入跡象（`open(…,'w')`、`json.dump(`、`shutil.`、`os.replace` …）就問。
//     這條是實際漏網案例補的：`python3 - <<'EOF'` 改 `~/.claude.json`，路徑只出現在 heredoc 裡。
//     寫到管線（`proc.stdin.write(`、`sys.stdout.write(`）不算寫入跡象（2026-10-20：做 MCP 時讀
//     `~/.claude.json` 拿 env、再餵子程序，每次 smoke test 都被問）。曾試過「同一句才算」，
//     驗收抓到變數別名、`-c` 首句賦值都會漏，退回整段判。
//   · `cd ~/.claude && <寫入>` 追蹤 cwd，相對路徑照樣算帳號層；payload 的 `cwd` 本身在帳號層也算。
//   · `claude plugin install|update|uninstall|marketplace add|remove…`：指令裡看不到路徑，但寫的
//     就是 `~/.claude/plugins/`，明列為問。`claude mcp` 只問 `--scope user`（全機器生效）和沒寫
//     scope 的 `remove`；`add` 預設 local、`-s project` 寫 repo 的 `.mcp.json`，都只影響當前 repo，不問
//     （2026-10-20 改，做 MCP 時每加一次就跳窗）。
//
// **已知漏網（判不到，不假裝判得到）**：直譯器用變數拼出路徑（`os.path.join(home, '.claude')`）、
//   `$(...)` 子 shell 組出的路徑、第三方安裝器自己寫 `~/.agents`（例如 `npx skills add -g`）。
//   CLI 自己寫的對話紀錄、遙測、`/config` 不走工具，本來就不經過 hook——這是要的結果。
//
// **逃生門 `CC_GUARD_USERLEVEL=off`**：設在 `~/.claude/settings.json` 的 `env`，重開 session 生效。
//   只認 hook 進程自己的環境變數，agent 在 Bash 指令前面塞是設在它的子 shell，讀不到。
//
// **解析失敗一律放行（fail open）**：這支壞掉最糟是「沒問到」，不是「每個工具呼叫都卡住」。
//
// 純函式 classifyToolCall 對外 export，由 test/guard-userlevel.test.mjs 直接測。

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WRAPPERS, gitSubcommand } from './guard-bash.mjs';

/** 把 `~`／`$HOME`／`${HOME}` 開頭換成家目錄，剝掉成對引號。 */
export function expandHome(p, home) {
  let s = String(p ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
  s = s.replace(/^(?:~|\$\{HOME\}|\$HOME)(?=\/|$)/, home);
  return s;
}

/** `CLAUDE_CONFIG_DIR` 搬走的帳號層根目錄；classifyToolCall 每次呼叫時依 ctx.configDir 設定。 */
let movedConfig = null;

/**
 * 判一個路徑：'protected'＝帳號層要問；'exempt'＝帳號層但放行；null＝不是帳號層。
 * 相對路徑對 cwd 解析；沒有 cwd 就當不是。
 */
export function classifyPath(p, home, cwd, configDir = movedConfig) {
  let s = expandHome(p, home);
  if (configDir) s = s.replace(/^(?:\$\{CLAUDE_CONFIG_DIR\}|\$CLAUDE_CONFIG_DIR)(?=\/|$)/, configDir);
  if (!s) return null;
  if (!s.startsWith('/')) {
    if (!cwd) return null;
    s = path.resolve(cwd, s);
  }
  s = path.normalize(s).replace(/\/+$/, '') || '/';
  const claude = path.join(home, '.claude');
  const inside = (root) => s === root || s.startsWith(`${root}/`);
  for (const root of configDir ? [claude, path.normalize(configDir).replace(/\/+$/, '')] : [claude]) {
    if (!inside(root)) continue;
    const rel = s.slice(root.length + 1);
    if (/^projects\/[^/]+\/memory(\/|$)/.test(rel) || /^plans(\/|$)/.test(rel)) return 'exempt';
    return 'protected';
  }
  if (s === `${claude}.json` || s.startsWith(`${claude}.json.`)) return 'protected';
  if (inside(path.join(home, '.agents'))) return 'protected';
  return null;
}

/** 任一參數都可能是寫入目標的指令。 */
const ANY_ARG_WRITERS = new Set([
  'rm', 'rmdir', 'mkdir', 'touch', 'chmod', 'chown', 'chflags', 'tee', 'truncate',
  'unlink', 'trash', 'shred', 'mv',
]);
/** 只有最後一個參數（目的地）是寫入目標的指令：`cp ~/.claude/x /tmp/` 是讀。 */
const DEST_WRITERS = new Set(['cp', 'ln', 'install', 'rsync', 'ditto']);
/** 直譯器：看 heredoc／-c 字串裡的寫入跡象。 */
const INTERPRETERS = new Set(['python', 'python3', 'node', 'ruby', 'perl', 'deno', 'bun', 'osascript']);
const SHELLS = new Set(['sh', 'bash', 'zsh']);
const CODE_WRITE_HINT = new RegExp([
  String.raw`\bopen\([^\n]*['"](?:[wax][bt]?\+?|r[bt]?\+)['"]`, // \b：`Popen(['x'])` 不算
  String.raw`\.write\(`, 'write_text', 'write_bytes', String.raw`json\.dump\(`,
  String.raw`os\.(?:replace|rename|remove|unlink|makedirs|mkdir|rmdir|symlink|chmod|truncate)`,
  String.raw`shutil\.`, String.raw`\.unlink\(`, String.raw`\.mkdir\(`, String.raw`\.touch\(`, 'rmtree',
  'writeFile', 'appendFile', 'rmSync', 'unlinkSync', 'renameSync', 'copyFile', 'mkdirSync',
  'createWriteStream', String.raw`fs\.rm\(`,
].join('|'));
// `>` 只算真的寫檔：`2>&1`、`>/dev/null` 不算。
const SHELL_WRITE_HINT = /\b(?:rm|mv|cp|tee|mkdir|touch|ln|chmod|truncate)\b|(?:^|[^0-9&>])>>?\s*(?!&|\/dev\/null)|sed\s+-i/;

/** git 子命令裡一定只讀的。其餘（含不認得的）一律當寫。 */
const GIT_READ = new Set([
  'status', 'log', 'diff', 'show', 'ls-files', 'blame', 'rev-parse', 'grep', 'shortlog',
  'describe', 'cat-file', 'ls-tree', 'whatchanged', 'help', 'version', 'check-ignore',
  'show-ref', 'for-each-ref', 'fetch',
]);
const GIT_LIST_FLAGS = new Set(['-a', '-r', '-v', '-vv', '--list', '-l', '--show-current', '--merged', '--no-merged', '--all', '--remotes']);

function gitIsReadOnly(sub, tokens) {
  if (GIT_READ.has(sub)) return true;
  const rest = tokens.slice(tokens.indexOf(sub) + 1);
  if (sub === 'branch' || sub === 'tag' || sub === 'remote') {
    return rest.every((t) => GIT_LIST_FLAGS.has(t));
  }
  if (sub === 'stash') return rest[0] === 'list' || rest[0] === 'show';
  if (sub === 'config') {
    // `git config <key>`（只給 key）是讀；給了值才是寫。
    return rest.some((t) => t.startsWith('--get') || t === '--list' || t === '-l')
      || rest.filter((t) => !t.startsWith('-')).length === 1;
  }
  return false;
}

const PLUGIN_WRITES = /^(?:install|i|uninstall|remove|rm|update|enable|disable|prune|autoremove|init|new)$/;
const MARKETPLACE_WRITES = /^(?:add|remove|rm|update)$/;
const MCP_WRITES = /^(?:add|add-json|add-from-claude-desktop|remove|reset-project-choices)$/;

/** 寫到管線不是寫檔：`proc.stdin.write(`、`sys.stdout.write(`、`process.stderr.write(`。判寫入跡象前先拿掉。 */
const PIPE_WRITE = /[\w.]*\b(?:stdin|stdout|stderr)\.write\(/g;

/**
 * 文字裡出現的帳號層路徑字面值（給直譯器內文用）。
 * quoted：只認**整個字串字面值就是路徑**的（前後緊貼同一種引號），例如 `open('~/.claude/x','w')`、
 * `expanduser("~/.claude.json")`。回放 30 天紀錄時，用 python 改 repo 的 docs、內文剛好寫到
 * `~/.claude/CLAUDE.md`（反引號包著）是最大宗誤問，這條就是擋它的。
 */
export function mentionedPaths(text, home, { quoted = false, configDir = movedConfig } = {}) {
  const quote = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tail = String.raw`(?:/[^\s'"\x60;|&()<>,\]]*)?`;
  const moved = configDir ? String.raw`|(?:\$CLAUDE_CONFIG_DIR|\$\{CLAUDE_CONFIG_DIR\}|${quote(configDir)})${tail}` : '';
  const re = new RegExp(String.raw`(?:~|\$HOME|\$\{HOME\}|${quote(home)})/\.(?:claude(?:\.json)?|agents)${tail}${moved}`, 'g');
  const s = String(text);
  return [...s.matchAll(re)]
    .filter((m) => {
      if (!quoted) return true;
      const before = s[m.index - 1];
      const after = s[m.index + m[0].length];
      return (before === "'" || before === '"') && after === before;
    })
    .map((m) => m[0]);
}

/**
 * 把 Bash 指令拆成段落，heredoc 內文掛回它開頭那一行的每一段（`cat <<EOF | python3 -`
 * 的內文是餵給 python 的，所以整行都掛）。反斜線換行先接起來。
 */
export function splitSegments(command) {
  const lines = String(command ?? '').replace(/\\\n/g, ' ').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    const opener = /<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    let body = '';
    if (opener) {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== opener[2]) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      body = buf.join('\n');
    }
    // line 留整行原文：`python3 -c "a; b"` 的引號裡也有 `;`，切段會把程式切爛，直譯器那支看整行。
    for (const text of line.split(/&&|\|\||[;|]/)) out.push({ text, line, body });
  }
  return out;
}

// `=>`／`->`（程式碼箭頭）不是重導向；目標要像路徑（`',`、`)` 開頭的是引號裡的比較運算）。
const REDIRECT = /(?<![=\-])\d*>>?\|?\s*(["']?[\w~$.\/{}-][^\s;&|<>()]*)/g;

/**
 * 判一段 Bash。回傳寫入的帳號層目標（字串）或 null。會更新 state.cwd（`cd`）。
 */
function segmentTarget(seg, state, home) {
  const text = seg.text.trim();
  if (!text) return null;
  const prot = (t) => classifyPath(t, home, state.cwd) === 'protected';

  let tokens = text.split(/\s+/).filter(Boolean);
  while (tokens.length && (WRAPPERS.has(tokens[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]))) tokens.shift();
  if (!tokens.length) return null;
  const cmd = path.basename(tokens[0]);
  const args = tokens.slice(1);
  const nonFlags = args.filter((t) => !t.startsWith('-'));

  if (cmd === 'cd') {
    const dest = args[0];
    if (!dest) state.cwd = home;
    else if (dest !== '-') state.cwd = path.resolve(state.cwd || home, expandHome(dest, home));
    return null;
  }

  // 引號裡的 `>` 是資料（awk 比較、python 字串），先蓋掉；緊接在 `>` 後的引號是寫入目標，留著。
  const unquoted = text.replace(/(>\s*)?(['"])(?:(?!\2)[^\\]|\\.)*\2/g, (m, pre) => (pre ? m : ' Q '));
  for (const m of unquoted.matchAll(REDIRECT)) {
    if (prot(m[1])) return m[1];
  }

  if (ANY_ARG_WRITERS.has(cmd)) return nonFlags.find(prot) ?? null;
  if (DEST_WRITERS.has(cmd)) {
    const tIdx = args.indexOf('-t');
    const dest = tIdx !== -1 ? args[tIdx + 1] : nonFlags.at(-1);
    return dest && prot(dest) ? dest : null;
  }
  if ((cmd === 'sed' || cmd === 'perl') && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) {
    return nonFlags.find(prot) ?? null;
  }
  if (cmd === 'find' && (args.includes('-delete') || /-exec(?:dir)?\s+\S*\b(?:rm|mv|sed|tee|chmod)\b/.test(text))) {
    return nonFlags.find(prot) ?? null;
  }
  if (cmd === 'dd') {
    const of = args.find((a) => a.startsWith('of='));
    return of && prot(of.slice(3)) ? of.slice(3) : null;
  }
  if (cmd === 'git') {
    let dir = state.cwd;
    for (let i = 1; i < tokens.length - 1; i += 1) {
      if (tokens[i] === '-C') dir = path.resolve(dir || home, expandHome(tokens[i + 1], home));
    }
    if (!dir || classifyPath(dir, home) !== 'protected') return null;
    const sub = gitSubcommand(tokens);
    if (!sub || gitIsReadOnly(sub, tokens)) return null;
    return dir;
  }
  if (cmd === 'claude') {
    if (args.includes('--help') || args.includes('-h')) return null;
    const [a, b, c] = nonFlags;
    if ((a === 'plugin' || a === 'plugins') && b === 'marketplace' && MARKETPLACE_WRITES.test(c ?? '')) return '~/.claude/plugins（claude plugin marketplace）';
    if ((a === 'plugin' || a === 'plugins') && PLUGIN_WRITES.test(b ?? '')) return '~/.claude/plugins（claude plugin）';
    if (a === 'mcp' && MCP_WRITES.test(b ?? '')) {
      const i = args.findIndex((t) => t === '-s' || t === '--scope');
      const scope = i !== -1 ? args[i + 1] : args.find((t) => t.startsWith('--scope='))?.slice(8);
      if (scope === 'user') return '~/.claude.json（claude mcp，scope user）';
      if (b === 'remove' && scope !== 'local' && scope !== 'project') return '~/.claude.json（claude mcp remove，沒指定 scope）';
      return null;
    }
    return null;
  }
  // `bash ~/.claude/x.sh` 是執行腳本，不是寫；shell 只看 `-c` 字串與 heredoc。
  const shellInline = SHELLS.has(cmd) && (args.includes('-c') || seg.body);
  if (INTERPRETERS.has(cmd) || shellInline) {
    const all = `${seg.line}\n${seg.body}`;
    const hint = SHELLS.has(cmd) ? SHELL_WRITE_HINT : CODE_WRITE_HINT;
    if (!hint.test(SHELLS.has(cmd) ? all : all.replace(PIPE_WRITE, ' '))) return null;
    const hit = mentionedPaths(all, home, { quoted: !SHELLS.has(cmd) }).find(prot);
    if (hit) return hit;
    // cwd 本身在帳號層、內文用相對路徑寫
    if (state.cwd && classifyPath(state.cwd, home) === 'protected') return state.cwd;
  }
  return null;
}

/** 帶路徑的寫入工具。與 hooks.json 的 matcher 同一份清單；函式自己也守，不靠 matcher。 */
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/**
 * 判一次工具呼叫。回傳 { target } ＝要問；null ＝放行。
 * ctx：{ home, cwd, configDir? }（configDir＝`CLAUDE_CONFIG_DIR`，沒設就只看 `~/.claude`）。
 */
export function classifyToolCall(toolName, toolInput, ctx) {
  const { home } = ctx;
  if (!home) return null;
  movedConfig = ctx.configDir && path.resolve(ctx.configDir) !== path.join(home, '.claude') ? path.resolve(ctx.configDir) : null;
  if (toolName === 'Bash') {
    const command = toolInput?.command;
    if (typeof command !== 'string') return null;
    const state = { cwd: ctx.cwd };
    for (const seg of splitSegments(command)) {
      const target = segmentTarget(seg, state, home);
      if (target) return { target };
    }
    return null;
  }
  if (!FILE_TOOLS.has(toolName)) return null;
  const p = toolInput?.file_path ?? toolInput?.notebook_path;
  if (typeof p !== 'string') return null;
  return classifyPath(p, home, ctx.cwd) === 'protected' ? { target: p } : null;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  if (process.env.CC_GUARD_USERLEVEL === 'off') return 0; // 逃生門，見檔頭
  const home = process.env.HOME;
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return 0; // fail open
  }
  let hit;
  try {
    hit = classifyToolCall(payload?.tool_name, payload?.tool_input, {
      home, cwd: payload?.cwd || process.cwd(), configDir: process.env.CLAUDE_CONFIG_DIR,
    });
  } catch {
    return 0; // fail open
  }
  if (!hit) return 0;
  const shown = String(hit.target).split(home).join('~');
  const reason = `寫入帳號層 ${shown}，影響本機所有 repo，先經你確認（cc-harness guard-userlevel；memory／plans 不問；總開關 CC_GUARD_USERLEVEL=off）`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason },
  }));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
