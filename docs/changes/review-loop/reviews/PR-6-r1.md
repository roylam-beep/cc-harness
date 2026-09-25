VERDICT: fix-needed

PR #6（review-loop 1.2：gate-pr 試合併跑閘），第 1 輪，視角 A（契約）。
被測：`tools/gate-pr.sh`、`test/gate-pr.test.sh`。試合併：`origin/claude/review-loop-v04` + `origin/cursor/review-loop-1-2-gate-pr-2ca6`（merge 26d9447），合併沒有衝突。

## BLOCKERS

1. **dash（Linux 的 /bin/sh）下 Ctrl-C／SIGTERM 會留下臨時 worktree**
   - 位置：`tools/gate-pr.sh:45`（`trap cleanup EXIT` 只掛 EXIT）。
   - 重現：`--head` 模式，`GATE_1='sleep 20; true'`，在獨立 process group 用 `/bin/dash tools/gate-pr.sh <change> --head` 起跑，2 秒後 `kill -INT -- -<pgid>`（模擬 Ctrl-C），或 `kill -TERM <pid>`。
     實測：`/bin/dash INT rc=130 worktrees=2`、`/bin/dash TERM rc=143 worktrees=2`，`$TMPDIR` 殘留 `gate-pr.XXXX`（worktree）與 `gate-pr-hooks.XXXX`，而且 `sleep 20` 還在那個 worktree 裡跑。macOS 的 `/bin/sh`（bash）兩種訊號都有清乾淨（`worktrees=1`）。
     dash 被訊號終止時不跑 EXIT trap，所以違反 Scenario「主工作目錄不變」（`git worktree list` 不留臨時 worktree）、tasks.md「`trap` 保證清掉」與「macOS 與 Linux 都要能跑」。
   - 要改成：在 `trap cleanup EXIT` 下面加 `trap 'exit 130' INT`、`trap 'exit 143' TERM`、`trap 'exit 129' HUP`（在訊號 trap 裡 `exit`，dash 就會接著跑 EXIT trap）。`test/gate-pr.test.sh` 補一項：用 `perl -e '$SIG{INT}="DEFAULT"; setpgrp(0,0); exec @ARGV' sh tools/gate-pr.sh …` 起背景（背景行程預設會忽略 SIGINT，所以要先重設），送 `kill -INT -- -$pid` 和 `kill -TERM $pid`，斷言 `git worktree list` 與跑之前相同、`$TMP` 沒有 `gate-pr.*`、`gate-pr-hooks.*`。這一項在 `/bin/sh` 與 `dash`（有裝才跑）各跑一次。

2. **「base 不符：不建 worktree」的測試驗不到「不建 worktree」**
   - 位置：`test/gate-pr.test.sh:273-291`。
   - 重現（mutation）：在 `tools/gate-pr.sh:209` 的 `exit 4` 前面插一行，先 `git -C "$ROOT" worktree add --detach "$WT" "origin/$BASE"` 建好 worktree 再 `exit 4`。結果 `sh test/gate-pr.test.sh` 仍是 `GATE_PR OK（17 項全過）`。因為 trap 事後會把 worktree 移除，而測試只比對「跑前／跑後」的 `git worktree list`，建過又刪掉一樣會過。
   - 要改成：d4 案例在 PATH 最前面放一支假 `git`，把 `$*` 記進 log 後 `exec` 真的 git。斷言 log 裡沒有 `worktree add`（也可以順便斷言沒有 `fetch`）。改完拿上面那個 mutation 重跑，這一項要變紅。

3. **「沒設 GATE_TIMEOUT 時預設 900」只 grep 原始碼，沒有驗行為**
   - 位置：`test/gate-pr.test.sh:368-373`。
   - 重現（mutation）：在 `tools/gate-pr.sh:163` 的 `timeout=900` 下一行加 `timeout=5`（註解和 `timeout=900` 字串都留著）。結果 `sh test/gate-pr.test.sh` 仍全過，但實際逾時已經變成 5 秒。
   - 要改成：在 PATH 最前面放一支假 `perl`，把 `$*` 記進 log 後 `exec` 真的 perl。跑一次沒設 `GATE_TIMEOUT` 的 `--head`，斷言 log 裡 alarm 的秒數參數是 `900`。另外跑一次 `GATE_TIMEOUT=7`，斷言是 `7`。刪掉原本的 grep 斷言。

## FOLLOWUPS

- [需確認] 逾時只殺得到 GATE 的那層 `sh`，孫行程會變成孤兒繼續跑。實測 `GATE_TIMEOUT=2`、`GATE_1='sleep 8; echo late > …'`：`GATE_1 exit=142` 記紅是對的，但 `sleep 8` 以 ppid=1 繼續跑，而它所在的 worktree 已經被刪了。如果真的 GATE 是 `a && b` 這種複合指令卡住（例如本 repo 的 GATE_1 `claude plugin validate … && …`），卡住的那支會和後面的 GATE 搶資源。測試用 `exec perl -e "sleep 15"` 剛好繞開了這個情況。建議 perl 那層先 `setpgrp`，alarm 到了就 `kill TERM => -pgid`。不過 tasks.md 規定寫法是 `perl -e 'alarm N; exec @ARGV'`，要不要改由發包者決定。
- [需確認] 基礎設施失敗的退出碼和「有紅」混在一起：`無法讀 PR`（例如 gh 沒登入）、`無法取得 origin/…`、`無法建立 worktree`、非衝突的試合併失敗都回 1，但沒有 `GATE RED` 行。`set -e` 中途失敗會回子指令的退出碼，實測假 `ln` 回 7，`gate-pr.sh` 就 `rc=7`，不在 0 到 4 的表裡。spec 規定 `/cc-review` 收到退出碼 1 要把紅的 GATE 當 BLOCKER、走 fix-needed，所以 gh 過期這種狀況會被誤判成要退回給 Cursor agent 修。建議基礎設施錯誤一律回 2，或另訂一個退出碼，並寫進檔頭的退出碼表和 spec。
- `gh pr view` 在呼叫端的 cwd 跑，不是在 `$ROOT` 跑（`tools/gate-pr.sh:184`）。用絕對路徑的 change-dir、從別的目錄呼叫時，會查到錯的 repo 或查不到。建議改成 `(cd "$ROOT" && gh pr view …)`。
- `SCHEMA_GLOB` 命中判定用的是 `gh pr view --json files`，GitHub 最多只回前 100 個檔。建議改用 worktree 裡的 `git diff --name-only origin/$BASE...origin/$head_ref`，也不用多一次 gh 依賴。
- `is_self_link` 用 `normpath` 比較，沒有用 `realpath`。主 repo 路徑經過 symlink 時（macOS 的 `/tmp` 和 `/var` 都是）會判斷不到。建議兩邊都 `os.path.realpath`。
- `TMPDIR` 結尾帶 `/` 時，`LOG` 路徑會出現 `//`（實跑：`LOG /var/folders/…/T//gate-pr-log.iFfEqC`）。不影響功能，要修的話 `${TMPDIR%/}`。

## 逐條 Scenario

| # | Scenario | 判定 | 測試／證據 | 實跑摘要 |
|---|---|---|---|---|
| 1 | 全綠 | ✅ | test 1（`:148-204`）：`GATE_1 exit=0 `、`GATE_2 exit=0 true`、最後一行 `GATE GREEN`、rc 0；另驗作者 `gate@local`／`gate`、沒跑 hook、沒寫 git 設定 | ✔；mutation 拿掉身分寫死 → 紅 |
| 2 | 有紅也跑完 | ✅ | test 2（`:206-237`）：`GATE RED 1,3`、rc 1、GATE_2 仍跑、`LOG` 目錄裡有 stdout 和 stderr | ✔；mutation「第一條紅就 break」→ 紅；mutation「改成 grep 輸出判紅」→ 紅 |
| 3 | 衝突 | ✅ | test 3（`:239-264`）：`^GATE CONFLICT$`、檔名 `README`、rc 3、沒有 `GATE_1` 行、GATE 沒跑 | ✔；mutation「exit 3→1」→ 紅；mutation「衝突仍跑閘」→ 紅 |
| 4 | base 不符 | ❌ | test 4（`:266-291`）：rc 4、印兩個分支名。但「不建 worktree」驗不到（BLOCKER 2） | 實作本身對（檢查在 `:208`，比 worktree 建立早）；mutation「先建 worktree 再 exit 4」→ 測試仍全過 |
| 5 | 設定缺漏 | ✅ | test 5a–5d（`:293-341`）：缺 gate.env、缺 BASE＋GATE_1（兩行都印）、PR 模式缺 gh、`--head` 缺 GATE_1 時不要求 gh，都是 rc 2 | ✔；mutation「不檢查 gh」→ 紅 |
| 6 | 單條逾時 | ❌ | test 6（`:343-367`）用 `GATE_TIMEOUT=1` 驗到「中止、記紅、其餘照跑」；「沒設為 900」只 grep 原始碼（BLOCKER 3） | ✔ 1–2s；mutation「拿掉 perl alarm」→ 紅；mutation「預設實際用 5」→ 測試仍全過 |
| 7 | 共用依賴目錄 | ✅ | test 7/7b/7c（`:375-489`）：symlink 指回主 repo、自指 link 刪掉並印一行、指向上一層的 link 不動、SCHEMA_GLOB 命中改複製（主 repo 的 marker 沒被改）、假 cp 拒 `-cR` 時退回 `cp -R` | ✔；mutation「命中仍 symlink」→ 紅；mutation「不刪自指 link」→ 紅 |
| 8 | 只驗 HEAD | ✅ | test 8（`:491-532`）：假 gh 一被呼叫就寫 log 並 exit 9，斷言 log 不存在；在 `origin/BASE` 最新版跑（有 fresh-marker、沒有 local-only） | ✔ |
| 9 | 主工作目錄不變 | ❌ | test 9（`:534-595`）：exit 0、1、3、4 四種都比對 status、HEAD、分支、worktree list；KEEP_WT 在 test 7 驗到有印路徑而且 worktree 還在。但 dash 下遇到訊號會留下 worktree（BLOCKER 1） | ✔；mutation「拿掉 trap」→ 5 項紅；dash 下 INT、TERM 實測留下 worktree |

其他特別確認：
- GATE 從 1 連號，遇到第一個沒定義的就停：test 10 ✔（`GATE_3` 沒跑）。
- 只以退出碼判紅綠：`:318` 只看 `$rc`，mutation 驗證過。
- 主 repo 是 change-dir 往上三層：`:115`。
- 試合併身分寫死 `gate@local`，另加 `commit.gpgsign=false` 和空的 `core.hooksPath`，全程不寫 git config（test 1 和 test「全域設定」驗到）。
- 中途失敗（假 `ln` 回 7）：`/bin/sh` 和 dash 都有清掉 worktree，但退出碼是 7（見 FOLLOWUP）。
- 腳本檔頭有用法、退出碼表、`防什麼`：✅（`:4-22`）。

## 實跑

| 指令 | 退出碼 |
|---|---|
| `git fetch -q origin claude/review-loop-v04 cursor/review-loop-1-2-gate-pr-2ca6`；`worktree add --detach`；`merge --no-ff`（身分 rev@local） | 0／0／0 |
| `git diff --name-only origin/claude/review-loop-v04...origin/cursor/review-loop-1-2-gate-pr-2ca6` → `test/gate-pr.test.sh`、`tools/gate-pr.sh`（剛好是所有權，沒有多改） | 0 |
| `sh test/gate-pr.test.sh`（macOS，/bin/sh=bash）→ `GATE_PR OK（17 項全過）`，9.7s | 0 |
| 同一套測試，把 gate-pr.sh 改用 `/bin/dash` 跑（暫時複本，用完刪掉）→ 17 項全過 | 0 |
| BASE-GATE（`check_docs && spec_merge check && spec_merge.test（25 項）&& test_skills（10 支）&& guard-bash（21 pass）`） | 0 |
| `sh -n` 和 `dash -n` 跑兩支檔 | 0 |
| grep `sed -i`／`readlink -f`／`timeout `／`[[`／`local`／`source`／`<<<`／`pipefail`：沒有 bashism（命中的只是 python 的 `==` 和 email 裡的 `local`）；grep `/Users/`、`YYYY-MM-DD`：沒有 | — |
| 訊號 harness（`scratchpad/rev6A-sig.sh`）：/bin/sh INT rc=130 有清、TERM rc=143 有清；/bin/dash INT rc=130 **留下**、TERM rc=143 **留下** | — |
| 逾時孤兒：`GATE_TIMEOUT=2`、`sleep 8; …` → `GATE_1 exit=142`、`GATE RED 1`、rc 1，elapsed 3s；`sleep 8` 以 ppid 1 繼續跑 | 1 |
| mutation（`scratchpad/rev6A-mut.sh`、`rev6A-mut2.sh`，只改自己 worktree 裡的 gate-pr.sh，每項跑完 `git checkout` 還原）：12 項變紅（stop-on-first-red、conflict-exit1、conflict-runs-gates、no-alarm、no-gh-check、no-trap、grep-output、schema-no-copy、keep-selflink、identity 等）；**2 項仍綠**（base-builds-wt、default-timeout-5 → BLOCKER 2、3） | — |
| 真實 gate.env 對 PR #6：`sh tools/gate-pr.sh docs/changes/review-loop 6`（在驗收 worktree 裡）→ GATE_1 到 GATE_9 都是 `exit=0`、`LOG …/gate-pr-log.iFfEqC`、`GATE GREEN`，16s；GATE_8 的 log 是 `GATE_PR OK（17 項全過）`；跑完主工作目錄 `status --porcelain`、`worktree list` 和驗收 worktree 的 status 都和跑之前相同，`$TMPDIR` 只留 log 目錄 | 0 |
| 收尾：`worktree remove --force` 驗收 worktree、`worktree prune` | 0 |
