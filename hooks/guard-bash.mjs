#!/usr/bin/env node
// PreToolUse(Bash) 攔不可逆指令。**這是 plugin 出貨的通用版**，由 hooks/hooks.json 掛上，
// 裝了 plugin 的 repo 全部生效；不需要各 repo 自己再複製一份。
//
// 掛在 repo 內 .claude/settings.json 的 PreToolUse（matcher: Bash）。
// 全域 CLAUDE.md 寫「不可逆操作先取得明確授權」，但那是自律；本檔是機器保證。
//
// 觸發：每次 Bash 工具呼叫前，stdin 收 {tool_name, tool_input:{command}}。複合指令會拆
// `&&`／`;`／`|`／換行逐段判，所以「cd 某處 && 接遞迴刪除」也抓得到。攔八類：
//   · `git push --force`／`-f`／`--force-with-lease` — 改寫遠端歷史，別線已 pull 的 commit
//     憑空消失。**無例外**：要改遠端歷史由使用者自己下指令。
//   **`git push --delete`／`:branch` refspec 2026-09-17 退役**：刪遠端分支跟 force push 是兩件事
//   ——force push 讓別人已 pull 的 commit 憑空消失，刪一條已合併的分支什麼都沒丟（commit 已在
//   main 裡）。綁在同一條「遠端不可逆」是分類錯誤，實測每次清 PR 分支都被誤擋。改成不擋；
//   要判「分支已合併才放行」得打網路查 PR 狀態（hook 同步執行不該打網路），squash merge 又讓
//   本地 ancestry 判斷失準，那種條件放行只是換一種誤殺。
//   · `git reset` 帶 mode 旗標（`--hard`／`--soft`／`--mixed`／`--keep`／`--merge`）—
//     `--hard` 丟未提交改動（本 repo 是**共用 worktree**，別線 session 可能正在寫），
//     其餘 mode 移動 HEAD＝抹掉既有 commit。**放行純 unstage**：不帶 mode 旗標的
//     `git reset -- <檔>`／`git reset HEAD -- <檔>`，以及 `git restore`。
//   · `git rebase` — 改寫既有 commit。**例外**：`--abort`／`--continue`／`--skip`／
//     `--quit`／`--edit-todo` 是收拾中途狀態，擋它會把人鎖死在 rebase 裡。
//   · `git commit --amend` — 改寫上一個 commit，別線 session 可能已經以它為基準。
//   · `git branch -D`（含 `--delete --force`）— 強制刪分支會丟掉只在該分支上的未合併 commit。
//     **放行 `-d`／`--delete`**：git 自己就會拒絕刪未合併的分支，那道檢查不需要本 hook 再做
//     一次；擋它只是把「清掉已合併的 PR 分支」這種日常動作卡死。
//   · `rm` 旗標同時含 r 與 f — 不可逆遞迴刪除。**兩類例外**（所有目標都符合才放行）：
//     (a) scratchpad（見 SCRATCHPAD_HINTS）——刻意可丟的暫存區；
//     (b) repo 內的可重生目錄（見 DISPOSABLE_NAMES 與 `.tmp-*` 層名）——`node_modules`、
//     `dist`、`.tmp-size` 這種，刪掉一道 build／install 就回來。擋這兩類天天誤擋，而且
//     **一段中槍整串複合指令陪葬**，代價遠大於它保護到的東西。**絕對路徑與帶 `..` 的
//     相對路徑不吃 (b)**：`/var/tmp` 的層名雖像暫存，但目標在 repo 外。
//   · `git commit --no-verify`／`-n`、`git push --no-verify` — 繞過 pre-commit／pre-push 閘。
//     擋這個跟前六類不同：它本身可逆，但它**拆掉的是別的防線**。帳號層「commit 前跑該 repo
//     的 pre-commit 那組」是規則，這條是那條規則的機器保證。**放行 `git push -n`**——
//     push 的 `-n` 是 `--dry-run`，跟 commit 的 `-n` 完全不同意思，混在一起擋會誤擋每天在用的預演。
//   · `git clean` 帶 force — 刪掉未追蹤檔案，git 救不回來（它們從來沒進過 object store），
//     而本 repo 是**共用 worktree**，未追蹤檔可能是別線 session 還沒 add 的產出。
//     **放行 `-n`／`--dry-run`**（只列不刪）、不帶 force 的呼叫（git 自己會拒絕執行），
//     以及 **`-X`**（只刪被 .gitignore 忽略的檔＝build 產物，跟已放行的 `rm -rf dist` 同一類）。
//     小寫 `-x` 意思相反（連 ignore 規則都不管，刪更多），照擋。
//   · **前景跑 `wait-for-run.js`**（第九類，2026-09-23 加）— 這支是 Cursor cloud agent 的看守腳本，
//     一跑就是幾十分鐘；Bash 前景最長 10 分鐘，時間到整個看守被砍，實測近 30 天 4 次
//     「Command timed out after 10m」全是它。判的不是指令字串本身，而是 `tool_input.run_in_background`
//     不是 true。這類跟前八類性質不同：不是不可逆，是**必然失敗**的用法。
//
// 前六類對應帳號層 `~/.claude/CLAUDE.md`「Commit 是常態，push 才要問」節列的「要使用者
// 當輪明確授權」清單；後兩類（`--no-verify`、`clean` 帶 force）守的是同節「commit 前跑該 repo
// 的 pre-commit 那組」與共用 worktree 的未追蹤檔。**擋下不等於不准做**——是不准由 agent 代下，
// 取得授權後請使用者自己執行，或改用 hint 給的可逆替代路徑。
//
// 擋下時 exit 2，stderr 回給模型，內容含「為什麼擋」＋替代指令，不是只說不行。
//
// 負向驗證（實跑過，見 test/guard-bash.test.mjs）：force push → exit 2；遞迴刪 docs/ →
//   exit 2；同旗標刪 scratchpad 路徑 → exit 0；`rm -rf .tmp-size`／`node_modules`／
//   `dist/*` → exit 0；`rm -rf /var/tmp`／`../../node_modules`／`.git`／`.` → exit 2；
//   `git push --follow-tags` → exit 0；
//   heredoc 內文提到被擋指令 → exit 0；`git rebase --abort` → exit 0；
//   `git reset HEAD -- x` → exit 0；`git commit --amend` → exit 2；
//   `git commit --no-verify` → exit 2；`git push -n`（dry-run）→ exit 0；
//   `git clean -fd` → exit 2；`git clean -n -d` → exit 0；`git clean -fdX` → exit 0；
//   `git clean -fdx` → exit 2；`git branch -d merged` → exit 0；`git branch -D x` → exit 2；
//   `git push origin --delete x`／`git push origin :x` → exit 0（已退役，見上）；
//   `node …/wait-for-run.js a r` 前景 → exit 2、同指令 `run_in_background: true` → exit 0。
//
// **逃生門 `CC_GUARD_BASH=off`**：設了就整支停用（`main()` 第一行就 return 0）。存在理由是
//   這支已經因為誤擋被放寬三次，逐條追趕追不完；與其讓人在誤擋現場沒路可走（那才會逼出
//   「改用 python 寫檔」這種完全繞過守衛的作法），不如給一個明確、可稽核的總開關。
//   **只有使用者按得動**：讀的是 hook 進程自己的 `process.env`，來源是 `~/.claude/settings.json`
//   的 `env` 或啟動 Claude Code 時的環境。agent 在 Bash 指令前面寫 `CC_GUARD_BASH=off <指令>`
//   是設在它自己那個子 shell，本進程讀不到，所以不構成繞過路徑。設了要**重開 session** 才生效。
//
// **解析失敗一律放行（fail open）**：這支壞掉時最糟的結果是「攔不到」，
// 而不是「所有 Bash 呼叫都死」。後者會弄壞整個 session，且很難自己救。
//
// 純函式 classifyCommand 對外 export，由 test/guard-bash.test.mjs 直接測。

import { fileURLToPath } from 'node:url';

/** rm -rf 可放行的第一類：暫存區。 */
export const SCRATCHPAD_HINTS = ['/scratchpad', '/private/tmp/claude-', '/tmp/claude-'];

/**
 * rm -rf 可放行的第二類：**可重生目錄**。刪掉它們損失的是機器產物，
 * 一道 build／install 就長回來，不是人寫的東西——擋它只是逼 agent 繞路，
 * 沒保護到任何東西。比對路徑裡的**任一層**（所以 `dist/*`、
 * `node_modules/.cache` 也算），不是只比最後一層。
 */
export const DISPOSABLE_NAMES = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.turbo', '.cache', '.parcel-cache', '.svelte-kit',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  '.venv', 'venv', 'target', '.gradle', '.tox',
]);

/** `.tmp-size`／`tmp`／`temp-out` 這種一看就是暫存的層名，比照可重生目錄放行。 */
const TMP_SEGMENT = /^\.?(tmp|temp)([-_.].*)?$/i;

const SEGMENT_SPLIT = /(?:&&|\|\||[;\n|])/;

/** 會把真正的指令包在後面的外包指令，判定前先剝掉。 */
const WRAPPERS = new Set(['sudo', 'xargs', 'env', 'time', 'nohup', 'nice', 'command', 'exec', '-0', '-n1', '-I{}']);

/** git reset 的 mode 旗標。帶其中任一＝動 HEAD 或動工作區，不是單純 unstage。 */
const RESET_MODES = new Set(['--hard', '--soft', '--mixed', '--keep', '--merge']);

/** rebase 進行中的收拾動作。擋這些等於把人鎖死在 rebase 中途，一律放行。 */
const REBASE_ESCAPES = new Set(['--abort', '--continue', '--skip', '--quit', '--edit-todo', '--show-current-patch']);

/**
 * 取 git 子命令：第一個非旗標的 token。`git -C <path> commit`／`git -c k=v commit`
 * 這些前置旗標會吃掉下一個 token，不跳過的話會把路徑當成子命令。
 * 回 null＝這段不是 git 指令。
 */
export function gitSubcommand(tokens) {
  const idx = tokens.findIndex((t) => t === 'git' || t.endsWith('/git'));
  if (idx === -1) return null;
  for (let i = idx + 1; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === '-c' || t === '-C' || t === '--git-dir' || t === '--work-tree') {
      i += 1;
      continue;
    }
    if (t.startsWith('-')) continue;
    return t;
  }
  return null;
}

/** 短旗標（單一 `-` 開頭、只有字母）裡是否含指定字母。`--show-current` 這種長旗標不算。 */
function hasShortFlag(tokens, letters) {
  return tokens.some((t) => /^-[A-Za-z]+$/.test(t) && [...letters].some((c) => t.includes(c)));
}

function looksScratchpad(arg) {
  return SCRATCHPAD_HINTS.some((hint) => arg.includes(hint));
}

/**
 * 這個 rm 目標可不可以放行。scratchpad ＝可以；repo 內的可重生目錄＝可以；其餘擋。
 *
 * **絕對路徑與帶 `..` 的相對路徑不吃名字白名單**：`/var/tmp`、`../../node_modules`
 * 的層名雖然在清單裡，但目標在當前 repo 外，那是另一回事。
 */
export function disposableTarget(arg) {
  if (looksScratchpad(arg)) return true;
  if (arg.startsWith('/') || arg.startsWith('~')) return false;
  const segments = arg.replace(/\/+$/, '').split('/').filter(Boolean);
  if (segments.includes('..')) return false;
  return segments.some((seg) => DISPOSABLE_NAMES.has(seg) || TMP_SEGMENT.test(seg));
}

/** rm 的旗標同時含 r 與 f（含 -rf／-fr／-r -f／--recursive --force）才算不可逆遞迴刪除。 */
function recursiveForce(tokens) {
  let recursive = false;
  let force = false;
  for (const t of tokens) {
    if (t === '--recursive') recursive = true;
    else if (t === '--force') force = true;
    else if (/^-[A-Za-z]+$/.test(t)) {
      if (t.includes('r') || t.includes('R')) recursive = true;
      if (t.includes('f')) force = true;
    }
  }
  return recursive && force;
}

/**
 * 判一段（單一）指令該不該擋。回 null＝放行。
 * 回 { rule, why, hint } ＝擋，三個欄位都會進 stderr 給模型看。
 */
export function classifySegment(segment) {
  const cmd = segment.trim();
  if (!cmd) return null;
  const tokens = cmd.split(/\s+/);

  const sub = gitSubcommand(tokens);
  const AUTHORIZE = '要做請先取得使用者**當輪**明確授權，並由使用者自己下這道指令';

  // 1. 遠端不可逆變更：強制推送（刪遠端分支 2026-09-17 退役，見檔頭）
  if (sub === 'push') {
    if (tokens.some((t) => t === '--force' || t.startsWith('--force-with-lease') || /^-[A-Za-z]*f[A-Za-z]*$/.test(t))) {
      return {
        rule: 'git push --force',
        why: '改寫遠端歷史，別線 session 已 pull 的 commit 會憑空消失，且無法從本地還原。',
        hint: `${AUTHORIZE}。想撤回內容改用 \`git revert\` 疊新 commit。`,
      };
    }
  }

  // 2. 繞過閘：--no-verify。commit 的 `-n` 是它的簡寫，push 的 `-n` 是 --dry-run（放行）。
  if (sub === 'commit' || sub === 'push') {
    const noVerify = tokens.includes('--no-verify') || (sub === 'commit' && tokens.includes('-n'));
    if (noVerify) {
      return {
        rule: `git ${sub} --no-verify`,
        why: '繞過 pre-commit／pre-push 閘，等於把該 repo 的文件與測試防線整條關掉，而且事後看不出這個 commit 沒過閘。',
        hint: `閘紅就修紅的那件事，或把它拆成過得了閘的小 commit。閘本身壞了（誤判、環境缺件）就修閘並在收尾點名。真要跳過，${AUTHORIZE}。`,
      };
    }
  }

  // 3. git clean 帶 force：刪未追蹤檔，git 救不回來。
  if (sub === 'clean') {
    // -n 可能併在合旗標裡（`-fdn`），git 自己也是 dry-run 勝出，所以用 hasShortFlag 而非 includes。
    const dryRun = tokens.includes('--dry-run') || hasShortFlag(tokens, 'n');
    const forced = tokens.includes('--force') || hasShortFlag(tokens, 'f');
    // **`-X` 放行**：大寫 X ＝只刪被 .gitignore 忽略的檔，那就是 build／install 產物，
    // 跟已經放行的 `rm -rf node_modules`／`dist` 同一類，擋它只是逼 agent 改用 rm 繞路。
    // **小寫 `-x` 不放行**：它是「忽略 ignore 規則」，刪得比預設更多，意思剛好相反。
    // `-X` 沒有長旗標（`git clean -h` 實測），所以只比短旗標，且 hasShortFlag 區分大小寫。
    const ignoredOnly = hasShortFlag(tokens, 'X');
    if (forced && !dryRun && !ignoredOnly) {
      return {
        rule: 'git clean -f',
        why: '刪掉未追蹤檔案，它們從來沒進 git object store，所以 git 救不回來；本 repo 是共用 worktree，那些檔可能是別線 session 還沒 add 的產出。',
        hint: `先看會刪什麼：\`git clean -n -d\`（只列不刪，本 hook 放行）。只想清 build 產物用 \`git clean -fdX\`（只刪被 .gitignore 忽略的檔，本 hook 放行）。真要整包刪，${AUTHORIZE}。`,
      };
    }
  }

  // 4. git reset 帶 mode 旗標。不帶＝純 unstage，放行。
  if (sub === 'reset') {
    const mode = tokens.find((t) => RESET_MODES.has(t));
    if (mode === '--hard' || mode === '--merge' || mode === '--keep') {
      return {
        rule: `git reset ${mode}`,
        why: '會丟掉未提交的工作區改動，而工作區可能有別線 session 正在寫的檔（本 repo 是共用 worktree）。',
        hint: `先看有什麼會被丟：\`git status --short\`。只想丟單檔用 \`git restore -- <檔>\`。真要整包丟，${AUTHORIZE}。`,
      };
    }
    if (mode) {
      return {
        rule: `git reset ${mode}`,
        why: '移動 HEAD 會抹掉既有 commit，別線 session 可能已經以它為基準（本 repo 是共用 worktree）。',
        hint: `想撤回已 commit 的內容用 \`git revert\` 疊新 commit；只想 unstage 用 \`git reset -- <檔>\`（不帶 mode 旗標，本 hook 放行）。真要動 HEAD，${AUTHORIZE}。`,
      };
    }
  }

  // 5. git rebase（中途收拾動作放行）
  if (sub === 'rebase' && !tokens.some((t) => REBASE_ESCAPES.has(t))) {
    return {
      rule: 'git rebase',
      why: '改寫既有 commit 的 SHA，別線 session 或已推出去的分支會對不上（本 repo 是共用 worktree）。',
      hint: `要併歷史用 \`git merge\`；要改內容疊新 commit。真要 rebase，${AUTHORIZE}。（\`--abort\`／\`--continue\`／\`--skip\` 本 hook 放行）`,
    };
  }

  // 6. 改寫上一個 commit
  if (sub === 'commit' && tokens.includes('--amend')) {
    return {
      rule: 'git commit --amend',
      why: '改寫上一個 commit 的 SHA，若它已推出去或已被別線 session 當基準就會對不上。',
      hint: `補內容或修訊息就多打一個 commit（\`fixup:\` 前綴）。真要改寫，${AUTHORIZE}。`,
    };
  }

  // 7. 強制刪本地分支。
  // **`-d`／`--delete` 放行**：git 自己就會拒絕刪未合併的分支（`error: the branch 'x' is not
  // fully merged`），所以「可能丟掉未合併 commit」這個風險 git 已經守住了，本 hook 再擋一次
  // 只是把清 merged 分支這種日常動作卡死。**`-D`／`--delete --force` 照擋**——那正是叫 git
  // 別守的寫法。`git branch -d -r origin/x` 只刪遠端追蹤參照（本地快取），不碰遠端，同樣放行。
  const branchForced = hasShortFlag(tokens, 'D')
    || (tokens.includes('--delete') && (tokens.includes('--force') || hasShortFlag(tokens, 'f')));
  if (sub === 'branch' && branchForced) {
    return {
      rule: 'git branch -D',
      why: '強制刪分支會連帶丟掉只存在該分支上的未合併 commit——`-D` 就是叫 git 跳過「未合併」那道檢查。',
      hint: `先確認已合併：\`git branch --merged\`。已合併的用 \`git branch -d\`（本 hook 放行，git 自己會守住未合併的）。真要強制刪，${AUTHORIZE}。`,
    };
  }

  // 8. rm -rf（scratchpad 放行）
  // 先剝掉外包指令：`xargs rm -rf …`／`sudo rm -rf …` 的第一個 token 不是 rm，
  // 只看 tokens[0] 會整個漏掉（本檔測試第一次跑就是漏在 `ls | xargs rm -rf /x`）。
  const bare = tokens.filter((t) => !WRAPPERS.has(t));
  if (bare[0] === 'rm') {
    if (recursiveForce(bare)) {
      const targets = bare.slice(1).filter((t) => !t.startsWith('-'));
      const allDisposable = targets.length > 0 && targets.every(disposableTarget);
      if (!allDisposable) {
        const blocked = targets.filter((t) => !disposableTarget(t));
        return {
          rule: 'rm -rf',
          why: `不可逆遞迴刪除，目標既不在 scratchpad 也不是可重生目錄（${blocked.join(' ') || '未指定路徑'}）。`,
          hint: `暫存檔放 scratchpad（路徑含 ${SCRATCHPAD_HINTS.join(' 或 ')}）或取名 \`.tmp-*\`，本 hook 放行；\`node_modules\`／\`dist\` 這類可重生目錄也放行。版控檔用 \`git rm\`。其餘先問使用者。`,
        };
      }
    }
  }

  return null;
}

/**
 * 去掉 heredoc 的**內容**，只留開頭那行。
 *
 * 為什麼需要：heredoc body 是資料不是指令。本檔第一次上線就被自己擋下——
 * 當時在寫 hook 說明文件，內文舉例寫了一段被擋指令的字面文字，
 * heredoc body 被當成指令解析、當場命中。這類誤判會逼人用 --no-verify 或繞路，
 * 等於把閘拆了，所以修在解析層而不是放寬規則。
 */
export function stripHeredocs(command) {
  const lines = String(command ?? '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    out.push(line);
    const opener = /<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    i += 1;
    if (!opener) continue;
    const delim = opener[2];
    while (i < lines.length && lines[i].trim() !== delim) i += 1;
    if (i < lines.length) i += 1; // 跳過結尾的 delimiter 行本身
  }
  return out.join('\n');
}

/** 拆複合指令逐段判——`cd x && <遞迴刪除>` 這種靠只看首個 token 是抓不到的。 */
export function classifyCommand(command) {
  for (const segment of stripHeredocs(command).split(SEGMENT_SPLIT)) {
    const hit = classifySegment(segment);
    if (hit) return hit;
  }
  return null;
}

/** 看守腳本的檔名。比對的是指令段落裡的 token，heredoc 內文已先剝掉。 */
export const WATCH_SCRIPT = 'wait-for-run.js';

/**
 * 第九類：整個 tool_input 一起判——前八類只看 command 字串，這類還要看 `run_in_background`。
 * 回 null＝放行；回 { rule, why, hint } ＝擋。
 */
export function classifyToolInput(toolInput) {
  const command = toolInput?.command;
  if (typeof command !== 'string') return null;
  const hit = classifyCommand(command);
  if (hit) return hit;
  const foregroundWatch = stripHeredocs(command)
    .split(SEGMENT_SPLIT)
    .some((seg) => seg.split(/\s+/).some((t) => t.endsWith(WATCH_SCRIPT) || t.endsWith(`${WATCH_SCRIPT}"`)));
  if (foregroundWatch && toolInput.run_in_background !== true) {
    return {
      rule: `${WATCH_SCRIPT} 前景執行`,
      why: 'Bash 前景最長 10 分鐘，Cursor run 動輒更久；時間到整個看守被砍，看起來就是「聽到一半斷了」。',
      hint: '同一條指令改帶 `run_in_background: true`，然後結束這一輪——run 結束時 harness 會帶著 7 行摘要叫醒你。只想看一眼現況用 `cursor_get_run`（一次性、不阻塞）。',
    };
  }
  return null;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  // 逃生門，見檔頭。**只認 hook 進程自己的環境變數**——agent 在 Bash 指令前面塞
  // `CC_GUARD_BASH=off …` 沒有用，那是它自己那個子 shell 的環境，這支進程讀不到。
  if (process.env.CC_GUARD_BASH === 'off') return 0;

  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return 0; // fail open，見檔頭
  }
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string') return 0;

  const hit = classifyToolInput(payload.tool_input);
  if (!hit) return 0;

  console.error(`⛔ PreToolUse 擋下：${hit.rule}（harness W7.3）`);
  console.error(`   指令：${command.length > 200 ? `${command.slice(0, 200)}…` : command}`);
  console.error(`   為什麼擋：${hit.why}`);
  console.error(`   怎麼走：${hit.hint}`);
  console.error('   規則出處：本檔檔頭註解。要放寬得改本檔，不是繞過。');
  console.error('   若這是誤擋：請使用者在 ~/.claude/settings.json 的 env 設 "CC_GUARD_BASH": "off" 並重開 session（只有使用者設得了，agent 設不了）。');
  return 2; // PreToolUse：exit 2 ＝ 阻擋，stderr 回給模型
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
