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
//   · **第十類：`git push` 前沒有 gate 紀錄**——**2026-10-20 停用**（使用者定案：每次 push 等 review 十幾二十分鐘，不值得）。
//     main 不再呼叫 classifyPushGate；函式與測試留著，要恢復把 main 那行接回去。原說明：（2026-10-18 加，使用者定案，取代原本靠 agent 記得的
//     「改完要說完成前自派 gate」——實測 5 個動過 src 的 session 只有 1 個自派過）。要推的 commit
//     （`@{u}..HEAD`；沒 upstream 退回 `origin/HEAD` 指的預設分支，再退回 `origin/main`、`origin/master`）動到程式檔、而且 HEAD 在
//     `.git/harness-gate` 裡沒有 `pass`／`skip` 紀錄，就擋下，hint 叫 agent 先派 gate 子 agent。
//     「程式檔」＝副檔名不是 .md／.mdx／.txt、不在暫存、不在 memory（判定在 hooks/code-path.mjs，
//     與 cc-watch 共用同一份；`CC_DOC_EXTS`／`CC_NONCODE_PATHS` 可擴充，見該檔檔頭）。紀錄由 agent 自己寫（gate 回 passes 才寫 pass；
//     使用者當輪明說跳過才寫 skip），所以這是「擋住不經過 gate 的 push」，不是防偽。
//     `pass` 對 HEAD 之後只動非程式檔的 commit 仍有效；`skip` 只對寫下當時的 HEAD 有效。
//     放行 dry-run、刪遠端分支。**全程 fail open**：git 失敗、不在 repo、算不出範圍都放行。
//     **看的是 push 實際推的那個 repo**（2026-10-20 修）：`git -C <路徑> push`、同一條指令前面的
//     `cd <路徑>` 都會改變目標；以前一律看 session 所在 repo，推 `~/.claude` 被 cc-harness 的未驗 commit 誤擋。
//     路徑帶 `$`／反引號算不出來，退回 session 所在 repo。
//
// 前六類對應帳號層 `~/.claude/CLAUDE.md`「Commit 是常態，push 才要問」節列的「要使用者
// 當輪明確授權」清單；後兩類（`--no-verify`、`clean` 帶 force）守的是同節「commit 前跑該 repo
// 的 pre-commit 那組」與共用 worktree 的未追蹤檔。**擋下不等於不准做**——是不准由 agent 代下，
// 取得授權後請使用者自己執行，或改用 hint 給的可逆替代路徑。
//
// 擋下時 exit 2，stderr 回給模型，內容含「為什麼擋」＋替代指令，不是只說不行。
//
// 第十類的驗證：test/guard-bash.test.mjs 用假的 git／紀錄測判斷，再用真的暫存 repo 端對端跑一次。
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
//   **只有使用者按得動**：讀的是 hook 進程自己的 `process.env`，來源是帳號層 `settings.json`（`~/.claude/`，
//   設了 `CLAUDE_CONFIG_DIR` 就是那個目錄）的 `env` 或啟動 Claude Code 時的環境。agent 在 Bash 指令前面寫 `CC_GUARD_BASH=off <指令>`
//   是設在它自己那個子 shell，本進程讀不到，所以不構成繞過路徑。設了要**重開 session** 才生效。
//
// **逐類放行與擴充**（同樣只有使用者設得了、要重開 session；全部沒設＝上面描述的預設行為）：
//   · `CC_GUARD_BASH_ALLOW`：逗號分隔的類別鍵，列了的那類不擋，其餘照擋。鍵：`force-push`、
//     `no-verify`、`clean`、`reset`、`rebase`、`amend`、`branch-force`、`rm`、`watch-script`、
//     `push-gate`（第十類）。例：自己一個人用、不共用 worktree 的 repo 設 `rebase,amend`。
//     擋下訊息會印這次命中的鍵。
//   · `CC_GUARD_BASH_DISPOSABLE`：追加可重生目錄名（例 `obj,.build,.dart_tool,_build,Pods`），
//     規則同 DISPOSABLE_NAMES（任一層符合、絕對路徑與 `..` 不吃）。內建清單不因此縮小。
//   · `CC_GUARD_BASH_WATCH_SCRIPTS`：追加要求背景執行的看守腳本檔名，內建 `wait-for-run.js` 永遠在。
//   · `CC_REVIEWER_MODEL`：第十類 hint 叫 agent 派 gate 子 agent 時帶的 model（預設 `opus`）。
//
// **解析失敗一律放行（fail open）**：這支壞掉時最糟的結果是「攔不到」，
// 而不是「所有 Bash 呼叫都死」。後者會弄壞整個 session，且很難自己救。
//
// 純函式 classifyCommand 對外 export，由 test/guard-bash.test.mjs 直接測。

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { codePathConfig, isCodePath, parseList } from './code-path.mjs';

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
export const WRAPPERS = new Set(['sudo', 'xargs', 'env', 'time', 'nohup', 'nice', 'command', 'exec', '-0', '-n1', '-I{}']);

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
export function disposableTarget(arg, extra = []) {
  if (looksScratchpad(arg)) return true;
  if (arg.startsWith('/') || arg.startsWith('~')) return false;
  const segments = arg.replace(/\/+$/, '').split('/').filter(Boolean);
  if (segments.includes('..')) return false;
  return segments.some((seg) => DISPOSABLE_NAMES.has(seg) || extra.includes(seg) || TMP_SEGMENT.test(seg));
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
export function classifySegment(segment, opts = {}) {
  const cmd = segment.trim();
  if (!cmd) return null;
  const tokens = cmd.split(/\s+/);
  const allow = opts.allow ?? new Set();
  // 使用者在 CC_GUARD_BASH_ALLOW 放行的類別直接跳過，繼續判下一類（同一段可能同時命中兩類）。
  const block = (key, hit) => (allow.has(key) ? null : { key, ...hit });

  const sub = gitSubcommand(tokens);
  const AUTHORIZE = '要做請先取得使用者**當輪**明確授權，並由使用者自己下這道指令';

  // 1. 遠端不可逆變更：強制推送（刪遠端分支 2026-09-17 退役，見檔頭）
  if (sub === 'push') {
    const hit = tokens.some((t) => t === '--force' || t.startsWith('--force-with-lease') || /^-[A-Za-z]*f[A-Za-z]*$/.test(t))
      && block('force-push', {
        rule: 'git push --force',
        why: '改寫遠端歷史，別線 session 已 pull 的 commit 會憑空消失，且無法從本地還原。',
        hint: `${AUTHORIZE}。想撤回內容改用 \`git revert\` 疊新 commit。`,
      });
    if (hit) return hit;
  }

  // 2. 繞過閘：--no-verify。commit 的 `-n` 是它的簡寫，push 的 `-n` 是 --dry-run（放行）。
  if (sub === 'commit' || sub === 'push') {
    const noVerify = tokens.includes('--no-verify') || (sub === 'commit' && tokens.includes('-n'));
    const hit = noVerify && block('no-verify', {
        rule: `git ${sub} --no-verify`,
        why: '繞過 pre-commit／pre-push 閘，等於把該 repo 的文件與測試防線整條關掉，而且事後看不出這個 commit 沒過閘。',
        hint: `閘紅就修紅的那件事，或把它拆成過得了閘的小 commit。閘本身壞了（誤判、環境缺件）就修閘並在收尾點名。真要跳過，${AUTHORIZE}。`,
      });
    if (hit) return hit;
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
    const hit = forced && !dryRun && !ignoredOnly && block('clean', {
        rule: 'git clean -f',
        why: '刪掉未追蹤檔案，它們從來沒進 git object store，所以 git 救不回來；本 repo 是共用 worktree，那些檔可能是別線 session 還沒 add 的產出。',
        hint: `先看會刪什麼：\`git clean -n -d\`（只列不刪，本 hook 放行）。只想清 build 產物用 \`git clean -fdX\`（只刪被 .gitignore 忽略的檔，本 hook 放行）。真要整包刪，${AUTHORIZE}。`,
      });
    if (hit) return hit;
  }

  // 4. git reset 帶 mode 旗標。不帶＝純 unstage，放行。
  if (sub === 'reset') {
    const mode = tokens.find((t) => RESET_MODES.has(t));
    const hit = (mode === '--hard' || mode === '--merge' || mode === '--keep')
      ? block('reset', {
        rule: `git reset ${mode}`,
        why: '會丟掉未提交的工作區改動，而工作區可能有別線 session 正在寫的檔（本 repo 是共用 worktree）。',
        hint: `先看有什麼會被丟：\`git status --short\`。只想丟單檔用 \`git restore -- <檔>\`。真要整包丟，${AUTHORIZE}。`,
      })
      : mode && block('reset', {
        rule: `git reset ${mode}`,
        why: '移動 HEAD 會抹掉既有 commit，別線 session 可能已經以它為基準（本 repo 是共用 worktree）。',
        hint: `想撤回已 commit 的內容用 \`git revert\` 疊新 commit；只想 unstage 用 \`git reset -- <檔>\`（不帶 mode 旗標，本 hook 放行）。真要動 HEAD，${AUTHORIZE}。`,
      });
    if (hit) return hit;
  }

  // 5. git rebase（中途收拾動作放行）
  if (sub === 'rebase' && !tokens.some((t) => REBASE_ESCAPES.has(t))) {
    const hit = block('rebase', {
      rule: 'git rebase',
      why: '改寫既有 commit 的 SHA，別線 session 或已推出去的分支會對不上（本 repo 是共用 worktree）。',
      hint: `要併歷史用 \`git merge\`；要改內容疊新 commit。真要 rebase，${AUTHORIZE}。（\`--abort\`／\`--continue\`／\`--skip\` 本 hook 放行）`,
    });
    if (hit) return hit;
  }

  // 6. 改寫上一個 commit
  if (sub === 'commit' && tokens.includes('--amend')) {
    const hit = block('amend', {
      rule: 'git commit --amend',
      why: '改寫上一個 commit 的 SHA，若它已推出去或已被別線 session 當基準就會對不上。',
      hint: `補內容或修訊息就多打一個 commit（\`fixup:\` 前綴）。真要改寫，${AUTHORIZE}。`,
    });
    if (hit) return hit;
  }

  // 7. 強制刪本地分支。
  // **`-d`／`--delete` 放行**：git 自己就會拒絕刪未合併的分支（`error: the branch 'x' is not
  // fully merged`），所以「可能丟掉未合併 commit」這個風險 git 已經守住了，本 hook 再擋一次
  // 只是把清 merged 分支這種日常動作卡死。**`-D`／`--delete --force` 照擋**——那正是叫 git
  // 別守的寫法。`git branch -d -r origin/x` 只刪遠端追蹤參照（本地快取），不碰遠端，同樣放行。
  const branchForced = hasShortFlag(tokens, 'D')
    || (tokens.includes('--delete') && (tokens.includes('--force') || hasShortFlag(tokens, 'f')));
  if (sub === 'branch' && branchForced) {
    const hit = block('branch-force', {
      rule: 'git branch -D',
      why: '強制刪分支會連帶丟掉只存在該分支上的未合併 commit——`-D` 就是叫 git 跳過「未合併」那道檢查。',
      hint: `先確認已合併：\`git branch --merged\`。已合併的用 \`git branch -d\`（本 hook 放行，git 自己會守住未合併的）。真要強制刪，${AUTHORIZE}。`,
    });
    if (hit) return hit;
  }

  // 8. rm -rf（scratchpad 放行）
  // 先剝掉外包指令：`xargs rm -rf …`／`sudo rm -rf …` 的第一個 token 不是 rm，
  // 只看 tokens[0] 會整個漏掉（本檔測試第一次跑就是漏在 `ls | xargs rm -rf /x`）。
  const bare = tokens.filter((t) => !WRAPPERS.has(t));
  if (bare[0] === 'rm') {
    if (recursiveForce(bare)) {
      const targets = bare.slice(1).filter((t) => !t.startsWith('-'));
      const extra = opts.disposable ?? [];
      const allDisposable = targets.length > 0 && targets.every((t) => disposableTarget(t, extra));
      if (!allDisposable) {
        const blocked = targets.filter((t) => !disposableTarget(t, extra));
        const hit = block('rm', {
          rule: 'rm -rf',
          why: `不可逆遞迴刪除，目標既不在 scratchpad 也不是可重生目錄（${blocked.join(' ') || '未指定路徑'}）。`,
          hint: `暫存檔放 scratchpad（路徑含 ${SCRATCHPAD_HINTS.join(' 或 ')}）或取名 \`.tmp-*\`，本 hook 放行；\`node_modules\`／\`dist\` 這類可重生目錄也放行。版控檔用 \`git rm\`。其餘先問使用者。`,
        });
        if (hit) return hit;
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
export function classifyCommand(command, opts = {}) {
  for (const segment of stripHeredocs(command).split(SEGMENT_SPLIT)) {
    const hit = classifySegment(segment, opts);
    if (hit) return hit;
  }
  return null;
}

/**
 * 看守腳本的預設檔名（Cursor cloud agent 的 watch 腳本）。比對的是指令段落裡的 token，heredoc 內文已先剝掉。
 * 別的長時間看守腳本用 `CC_GUARD_BASH_WATCH_SCRIPTS` 追加（逗號分隔檔名），預設這一支永遠在。
 */
export const WATCH_SCRIPT = 'wait-for-run.js';

/**
 * 第九類：整個 tool_input 一起判——前八類只看 command 字串，這類還要看 `run_in_background`。
 * 回 null＝放行；回 { rule, why, hint } ＝擋。
 */
export function classifyToolInput(toolInput, opts = {}) {
  const command = toolInput?.command;
  if (typeof command !== 'string') return null;
  const hit = classifyCommand(command, opts);
  if (hit) return hit;
  if (opts.allow?.has('watch-script')) return null;
  const scripts = [WATCH_SCRIPT, ...(opts.watchScripts ?? [])];
  const watched = stripHeredocs(command)
    .split(SEGMENT_SPLIT)
    .flatMap((seg) => seg.split(/\s+/))
    .map((t) => scripts.find((s) => t.endsWith(s) || t.endsWith(`${s}"`)))
    .find(Boolean);
  if (watched && toolInput.run_in_background !== true) {
    return {
      key: 'watch-script',
      rule: `${watched} 前景執行`,
      why: 'Bash 前景最長 10 分鐘，看守的 run 動輒更久；時間到整個看守被砍，看起來就是「聽到一半斷了」。',
      hint: '同一條指令改帶 `run_in_background: true`，然後結束這一輪——腳本結束時 harness 會叫醒你。只想看一眼現況用一次性的查詢（Cursor 是 `cursor_get_run`），不要前景等。',
    };
  }
  return null;
}

/** gate 紀錄檔名（放在 `git rev-parse --git-path` 指的地方，不進版控）。 */
export const GATE_RECORD = 'harness-gate';

/** 第十類判「程式檔」：hooks/code-path.mjs，跟 cc-watch 共用同一份。 */
export { isCodePath };

/** 把 `cd`／`-C` 的路徑參數接到 base 上；去引號、展開 `~`。帶 `$`／反引號算不出來回 null。 */
function joinDir(base, arg, home) {
  const a = String(arg ?? '').replace(/^["']|["']$/g, '');
  if (!a || /[$`]/.test(a)) return null;
  if (a === '~' || a.startsWith('~/')) return home ? join(home, a.slice(1)) : null;
  return resolve(base, a);
}

/** 這段是「真的會推出去」的 git push（dry-run、刪遠端分支不算）就回它推的目錄，否則 null。 */
function pushDir(t, cur, home) {
  if (gitSubcommand(t) !== 'push') return null;
  const dryRun = t.includes('--dry-run') || hasShortFlag(t, 'n');
  const deleting = t.includes('--delete') || hasShortFlag(t, 'd') || t.some((x) => x.startsWith(':'));
  if (dryRun || deleting) return null;
  let dir = cur;
  const g = t.findIndex((x) => x === 'git' || x.endsWith('/git'));
  for (let i = g + 1; i < t.length && t[i] !== 'push'; i += 1) {
    if (t[i] === '-C') dir = joinDir(dir, t[i + 1], home) ?? dir;
  }
  return dir;
}

/**
 * 每個「真的會推出去」的 git push（dry-run、刪遠端分支不算）推的是哪個目錄。
 * 依序走過各段：`cd <路徑>` 改變後面的目錄，`git -C <路徑>` 只改那一段；算不出來就沿用目前目錄。
 */
export function pushTargets(command, cwd = '.', home = homedir()) {
  let cur = cwd;
  let prev = cwd;
  const stack = []; // `( … )` 子 shell 裡的 cd 出了括號就失效
  const out = [];
  for (const raw of stripHeredocs(command).split(SEGMENT_SPLIT)) {
    const seg = raw.trim();
    const opens = /^\(*/.exec(seg)[0].length;
    const closes = /\)*$/.exec(seg)[0].length;
    for (let i = 0; i < opens; i += 1) stack.push(cur);
    // 引號包住的路徑（含空白）算一個 token
    const t = (seg.slice(opens, seg.length - closes).match(/"[^"]*"|'[^']*'|\S+/g) ?? []);
    const restore = () => { for (let i = 0; i < closes && stack.length; i += 1) cur = stack.pop(); };
    if (t[0] === 'cd') {
      const next = t.length === 1 ? home || cur : t[1] === '-' ? prev : joinDir(cur, t[1], home) ?? cur;
      prev = cur;
      cur = next;
      restore();
      continue;
    }
    const dir = pushDir(t, cur, home);
    restore();
    if (dir) out.push(dir);
  }
  return out;
}

/** `git diff --name-only` 的輸出 → 程式檔清單。io.git 失敗（null）回 null。 */
function codeFiles(io, range, codePath) {
  const out = io.git(['diff', '--name-only', range]);
  return out == null ? null : out.split('\n').map((l) => l.trim()).filter((p) => isCodePath(p, codePath));
}

/**
 * 第十類：push 前要有 gate 紀錄。io＝{ git(args)→stdout|null, record()→紀錄檔全文 }，或
 * `(目錄) => io`（每個 push 各自看它推的 repo；`opts.cwd` 是 session 所在目錄）。
 * 注入是為了測試；任何一步拿不到答案就回 null（fail open）。
 */
export function classifyPushGate(command, io, opts = {}) {
  if (opts.allow?.has('push-gate')) return null;
  if (typeof command !== 'string') return null;
  const cwd = opts.cwd ?? '.';
  for (let dir of new Set(pushTargets(command, cwd, opts.home))) {
    let dio = typeof io === 'function' ? io(dir) : io;
    // 算出的目錄不是 repo（路徑算錯、不存在）就退回 session 所在 repo——寧可誤擋也不放過
    if (dir !== cwd && typeof io === 'function' && !dio.git(['rev-parse', 'HEAD'])) { dir = cwd; dio = io(cwd); }
    const hit = gateHit(dio, opts, dir === cwd ? null : dir);
    if (hit) return hit;
  }
  return null;
}

/** 單一 repo 的判定；dir 非 null＝推的不是 session 所在 repo，訊息裡點名。 */
function gateHit(io, opts, dir) {
  try {
    const up = io.git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])?.trim();
    const dflt = io.git(['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'])?.trim();
    const base = up || dflt || ['origin/main', 'origin/master'].find((b) => io.git(['rev-parse', '--verify', '-q', b]));
    if (!base) return null;
    const files = codeFiles(io, `${base}..HEAD`, opts.codePath);
    if (!files || files.length === 0) return null;
    const head = io.git(['rev-parse', 'HEAD'])?.trim();
    if (!head) return null;

    const records = String(io.record() ?? '').split('\n')
      .map((line) => /^([0-9a-f]{7,40})\s+(pass|skip)\s*$/.exec(line.trim()))
      .filter(Boolean);
    for (const [, sha, verdict] of records) {
      if (head.startsWith(sha)) return null; // pass／skip 都只認 HEAD 本身
      if (verdict !== 'pass') continue;
      const since = codeFiles(io, `${sha}..HEAD`, opts.codePath); // pass 之後只多了非程式檔的 commit 也算過
      if (since && since.length === 0) return null;
    }

    const shown = files.slice(0, 3).join('、') + (files.length > 3 ? ` 等 ${files.length} 個` : '');
    const rec = '"$(git rev-parse --git-path harness-gate)"';
    const where = dir ? `（repo：${dir}）` : '';
    const model = opts.reviewerModel || 'opus';
    return {
      key: 'push-gate',
      rule: 'git push（HEAD 沒有 gate 紀錄）',
      why: `要推的 commit${where}動到程式檔（${shown}），HEAD ${head.slice(0, 7)} 沒有 gate 通過紀錄。寫的人自己驗不出「跑得動但語意錯」，所以 push 前要由乾淨 context 的子 agent 驗過。`,
      hint: `照 \`/cc-gate\`〈push 前〉派 gate 子 agent（Agent 工具、model: "${model}"）；判定 passes 後執行 \`echo "$(git rev-parse HEAD) pass" >> ${rec}\` 再重推。有缺陷先修再重派，最多兩輪。使用者**當輪明說**跳過 gate 時，才改寫 \`skip\`（只對當時的 HEAD 有效）。commit 和 push 分成兩個指令下，本 hook 看的是下指令當下的 HEAD。`,
    };
  } catch {
    return null;
  }
}

/**
 * 使用者設定 → 各 classify 函式的 opts。只讀 hook 進程自己的環境（理由同逃生門，見檔頭）。
 * 全部沒設＝跟以前完全一樣。
 */
export function configFromEnv(env = {}) {
  return {
    allow: new Set(parseList(env.CC_GUARD_BASH_ALLOW)),
    disposable: parseList(env.CC_GUARD_BASH_DISPOSABLE),
    watchScripts: parseList(env.CC_GUARD_BASH_WATCH_SCRIPTS),
    reviewerModel: String(env.CC_REVIEWER_MODEL ?? '').trim(),
    codePath: codePathConfig(env),
  };
}

/** 真實的 io：在 cwd 跑 git；紀錄檔路徑用 `git rev-parse --git-path`（worktree 也對）。 */
function realIo(cwd) {
  const git = (args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });
    return r.status === 0 ? r.stdout : null;
  };
  const record = () => {
    const p = git(['rev-parse', '--git-path', GATE_RECORD])?.trim();
    if (!p) return '';
    try { return readFileSync(resolve(cwd, p), 'utf8'); } catch { return ''; }
  };
  return { git, record };
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

  const opts = configFromEnv(process.env);
  const hit = classifyToolInput(payload.tool_input, opts);
  if (!hit) return 0;

  console.error(`⛔ PreToolUse 擋下：${hit.rule}（harness W7.3）`);
  console.error(`   指令：${command.length > 200 ? `${command.slice(0, 200)}…` : command}`);
  console.error(`   為什麼擋：${hit.why}`);
  console.error(`   怎麼走：${hit.hint}`);
  console.error('   規則出處：本檔檔頭註解。要放寬得改本檔，不是繞過。');
  // 印實際路徑，家目錄縮成 ~；設了 CLAUDE_CONFIG_DIR 就印那個目錄。
  const home = process.env.HOME;
  const cfg = process.env.CLAUDE_CONFIG_DIR || (home ? join(home, '.claude') : '~/.claude');
  const settings = join(home && cfg.startsWith(`${home}/`) ? `~${cfg.slice(home.length)}` : cfg, 'settings.json');
  console.error(`   若這是誤擋：請使用者在 ${settings} 的 env 設 "CC_GUARD_BASH_ALLOW": "${hit.key}"（只放行這一類）或 "CC_GUARD_BASH": "off"（整支停用），並重開 session（只有使用者設得了，agent 設不了）。`);
  return 2; // PreToolUse：exit 2 ＝ 阻擋，stderr 回給模型
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
