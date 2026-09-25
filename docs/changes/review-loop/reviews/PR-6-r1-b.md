VERDICT: fix-needed

PR #6（review-loop 1.2：gate-pr 試合併跑閘）第 1 輪，視角 B（對抗：副作用與安全）。
被測物：`origin/claude/review-loop-v04` 用 `--no-ff` 合進 `origin/cursor/review-loop-1-2-gate-pr-2ca6` 的結果（merge commit 506d644，head 8379a84）。

## BLOCKERS

1. **gate.env 語法錯誤時退出碼是 0，會被當成綠燈**（`tools/gate-pr.sh:137-139`）。
   重現：`printf "BASE=integration/line\nGATE_1='false\n" > <change>/gate.env`（引號沒閉合），
   在 macOS 用 `sh tools/gate-pr.sh <change> --head` 跑：只印一行 bash 的語法錯誤，**退出碼 0**，
   一條 GATE 都沒跑，也沒有 `GATE GREEN`。把孤立的 `fi`、沒閉合的 `$(` 換進去，結果一樣（`sh`／`bash` 都是 0；`dash` 是 2）。
   `/cc-review` 只看退出碼判紅綠，這會讓一個沒跑過任何閘的 PR 走到合併。
   修法：在 `. "$ENVFILE"` 之前加
   `sh -n "$ENVFILE" || { echo "gate.env 語法錯：$ENVFILE"; exit 2; }`；
   測試補一條「引號沒閉合的 gate.env → 退出碼 2、輸出沒有 `GATE_1 `，也沒有 `GATE GREEN`」。

2. **`SHARE_DIRS` 帶 `..` 時，會 `rm -rf` 到 worktree 外面**（`tools/gate-pr.sh:281-299`，實際刪檔在 `link_tree` 第 98 行、`copy_tree` 第 85 行）。
   重現：`TMPDIR=$T`，先建 `$T/victim/keep.txt` 與 `<ROOT>/../victim/`，gate.env 設 `SHARE_DIRS='../victim'`、`GATE_1='true'`，
   跑 `--head`：退出碼 0、`GATE GREEN`，但 `$T/victim/keep.txt` 被刪掉，`$T/victim` 變成一個指向 `<ROOT>/../victim` 的 symlink。
   這個 symlink 在結束後還留著，cleanup 沒清。換成 `../../<任意路徑>`，就能刪掉 TMPDIR 以外的東西。
   修法：載入 gate.env 之後、建 worktree 之前，逐項檢查 SHARE_DIRS：
   `case "$rel" in /*|..|../*|*/..|*/../*) echo "SHARE_DIRS 不能是絕對路徑或含 ..：$rel"; exit 2 ;; esac`。
   測試補一條「`SHARE_DIRS='../victim'` → 退出碼 2，`$TMPDIR/victim/keep.txt` 還在，`git worktree list` 沒有多出來」。

3. **Linux 的 `/bin/sh`（dash）收到 SIGINT／SIGTERM 時不跑 EXIT trap，臨時 worktree 會留下來**（`tools/gate-pr.sh:45`，只有 `trap cleanup EXIT`）。
   重現：gate.env 設 `GATE_1='sleep 6'`，用 `perl -e '$SIG{INT}="DEFAULT"; exec @ARGV' env TMPDIR=$T dash tools/gate-pr.sh <change> --head &` 在背景啟動，
   2 秒後 `kill -INT <pid>`（或 `-TERM`，或對整個 process group 送）：退出碼 130／143，
   `git worktree list` 多一條 `$T/gate-pr.XXXXXX`，`$T` 底下也留著那個目錄（schema 模式下裡面是整份複製的 node_modules）。
   macOS 的 `/bin/sh`（bash）同一組操作會清乾淨，所以現有測試抓不到。
   這違反 tasks.md 1.2 的「`trap` 保證清掉」，也違反共同約束的「macOS 與 Linux 都要能跑」。
   修法：在 `trap cleanup EXIT` 下面加 `trap 'exit 129' HUP; trap 'exit 130' INT; trap 'exit 143' TERM`（dash 執行 `exit` 時會接著跑 EXIT trap）。
   測試補一條：用 `dash`（沒有 dash 就跳過並印一行）跑 `GATE_1='sleep 30'`，送 TERM，斷言 `git worktree list` 與跑之前相同，`$TMPDIR` 沒有 `gate-pr.*` 目錄。

## FOLLOWUPS

- [需確認] 逾時只殺掉 `sh -c` 那一層，子孫程序會活下來繼續跑。實測 `GATE_2='(sleep 6; echo late2 > f); true'`、`GATE_TIMEOUT=2`：GATE_2 記紅了，但 `late2` 還是在 GATE_3、GATE_4 跑完之後被寫出來。卡住的測試 runner（node worker）會一直留著。問題出在 tasks.md 規定的 `perl -e 'alarm N; exec @ARGV'` 寫法本身：可以改成 perl 先 `setpgrp`、fork 子程序，逾時就 `kill -TERM` 整個 process group，再補一次 KILL。
- 預設 900 秒只靠 grep 原始碼驗。實測 mutation：把 `timeout=900` 改成 `timeout=1 # timeout=900`，17 項測試仍全綠。建議用假的 `perl` 記下 alarm 的參數來驗。
- [需確認] `SCHEMA_GLOB` 的比對語意沒寫清楚，實測（Python `fnmatch`）：`*` 會跨 `/`（`db/*.prisma` 會中 `db/sub/x.prisma`，`*.prisma` 會中任何深度）；`**/*.prisma` **不中**根目錄的 `schema.prisma`，`db/**/*.prisma` 不中 `db/x.prisma`；空白分隔的多個 pattern（`'*.prisma db/**'`）永遠不中；大小寫有差。沒中的話會走 symlink，gate 裡的 generate 就會寫進主 repo 的 node_modules。建議在 gate.env 格式說明寫清楚語意，並讓 `**/` 可以對到零層目錄。
- `SHARE_DIRS` 是絕對路徑（`/abs/x` 會被接成 `<ROOT>//abs/x`）或目錄不存在時，靜默略過、不印任何東西。建議印一行 `SHARE 略過：<rel>`。
- 自指判定用 `normpath` 比字面：`/tmp` 與 `/private/tmp` 的別名、`<dir>` 本身是 symlink 時會漏刪；`node_modules -> sub/..`（`sub` 是指向別處的 symlink）會被誤判成自指而刪掉。只刪 symlink 本身、不遞迴，影響小。建議改用 `os.path.realpath` 兩邊都解開再比。必要的幾種都實測對了：絕對自指、`.`、`./`、`../nm`、結尾帶 `/` 會刪；指向別處、真目錄、相對指向別處、指回祖先（絕對與 `..`）、懸空 link 都不刪。
- gate.env 裡有執行失敗的指令時，腳本在 `set -e` 下直接結束，退出碼落在表外、也沒說原因：`false` 是 1（跟 GATE RED 分不出來）、`exit 5` 是 5、找不到指令是 127。建議改成 `if ! . "$ENVFILE"; then echo "gate.env 載入失敗"; exit 2; fi`。
- CRLF 的 gate.env 會讓 BASE 帶著 `\r`：`--head` 印「invalid refspec 'integration/line?'」，PR 模式印出來的 base 不符，兩個分支名看起來一模一樣。建議偵測到 `\r` 就退出碼 2，印「gate.env 是 CRLF」。
- gate.env 跟腳本共用同一個變數空間：gate.env 定義 `ROOT`、`CHANGE`、`mode`、`pr` 會改掉腳本行為（實測 `ROOT=/nonexistent` → 退出碼 1「無法取得 origin/…」；`mode=pr pr=99` 讓 `--head` 變成 PR 模式）。建議腳本內部變數加前綴。
- 衝突檔名有中文或空白時，被 `core.quotePath` 轉成八進位（`"\344\270\255 ..."`）。建議 `git -c core.quotePath=false diff --name-only --diff-filter=U`。
- fetch 失敗、worktree add 失敗、衝突這幾條路徑會留下 `gate-pr-log.*`，但不印 `LOG` 路徑；每跑一次就在 `$TMPDIR` 多一個 LOG 目錄，沒有任何清理。
- [需確認] `gh pr view --json files` 可能有 100 檔上限，檔案多的 PR 會讓 SCHEMA_GLOB 漏判。
- [需確認] fork 來的 PR，head 不在 origin 上，fetch 失敗會退出碼 1；可以考慮改 fetch `pull/<n>/head`。
- GATE 在 worktree 裡跑 `git branch`、`git config --local`，會寫進主 repo 共用的 `.git`（實測 `git status` 不變，但 config 與 branch 變了）。這是 GATE 內容自己的責任，建議在 gate.env 格式說明提一句。
- `GATE_<n>=`（空字串）也算有定義，會跑 `sh -c ""` 並記綠。

## 逐條 Scenario

| # | Scenario | 判定 | 測試／證據 | 實跑摘要 |
|---|---|---|---|---|
| 1 | 全綠 | ✅ | test 1（`GATE_1 exit=0`、`GATE GREEN`、作者 gate@local、hook 沒跑、git 設定沒寫） | rc=0；另用 dirty repo 跑 PR 模式也是綠 |
| 2 | 有紅也跑完 | ✅ | test 2（`GATE RED 1,3`，LOG 有 stdout 與 stderr） | rc=1；timeout 對抗案例 `GATE RED 1,2,3` 後 GATE_4 照跑 |
| 3 | 衝突 | ✅ | test 3；自測 add/add、binary、modify/delete、中文加空白路徑 | 都是 rc=3、`GATE CONFLICT`、沒跑 GATE；rename 可以合就 rc=0；中文檔名被八進位跳脫（FOLLOWUP） |
| 4 | base 不符 | ✅ | test 4 | rc=4，worktree list 不變 |
| 5 | 設定缺漏 | ❌ | test 5（缺 gate.env、缺 BASE／GATE_1、缺 gh、--head 不要 gh） | 列出的情形都對；但 gate.env 語法錯是 **rc=0**（BLOCKER 1） |
| 6 | 單條逾時 | ✅（有保留） | test 6（`GATE_TIMEOUT=1`、`exec perl sleep`） | 該條 exit=142 記紅、其餘照跑；子孫程序存活（FOLLOWUP）；預設 900 沒有真的驗（FOLLOWUP） |
| 7 | 共用依賴目錄 | ❌ | test 7／7b／7c；自測 14 種自指 link | 自指判定必要的情形都對；`SHARE_DIRS='../victim'` 刪掉 worktree 外的檔（BLOCKER 2） |
| 8 | 只驗 HEAD | ✅ | test 8（假 gh 一叫就爆，沒被叫到；用的是 origin 最新版，不是本機版） | rc=0 |
| 9 | 主工作目錄不變 | ❌ | test 9（exit 0／1／3／4）；自測 dirty（modified、staged、untracked）加上 gh 失敗、fetch head／base 失敗、worktree add 失敗、TMPDIR 唯讀 | 以上 porcelain v2、worktree、stash、local config 都相同；dash 下 INT／TERM 留下 worktree（BLOCKER 3） |

其他檢查：
- 所有權：diff 只動 `tools/gate-pr.sh`、`test/gate-pr.test.sh` ✅
- 檔頭有用法、退出碼表、防什麼 ✅；沒有 `/Users/` 路徑 ✅
- Linux 相容：沒有 `stat -f`、`date -j`、`readlink -f`、`sed -i`、`mktemp -t`、`[[`；`cp -cR` 有 `cp -R` 退路（GNU 的 `-c` 是 `--preserve=context`，失敗或成功都安全）；`dash -n` 通過；整份測試改用 `/bin/dash` 跑 gate-pr，17 項全過。只剩 signal 清理有差（BLOCKER 3）。
- 回歸：PR 只有新增檔，沒有刪掉或放寬既有斷言。
- mutation：拿掉 worktree remove（8 項紅）、衝突改成 exit 1（2 項紅）、不刪自指 link（2 項紅）、永遠不 copy（2 項紅）、拿掉 gpgsign=false（1 項紅）、拿掉 perl alarm（1 項紅）、關掉 base 檢查（2 項紅）都抓得到；只有改預設逾時抓不到。

## 實跑

| 指令 | 退出碼 |
|---|---|
| `sh test/gate-pr.test.sh`（worktree 內，TMPDIR 在 scratchpad） | 0（17 項全過） |
| 同一份測試把 `/bin/sh` 換成 `/bin/dash` 跑 gate-pr | 0（17 項全過） |
| BASE-GATE（check_docs、spec_merge check、spec_merge.test 25 項、test_skills、guard-bash 21 項） | 0 |
| `t_self.sh`：14 種 `<dir>/node_modules` 形態 | 見 FOLLOWUP 自指那條 |
| `t_fail.sh`：dirty repo 加 6 種失敗路徑 | 1／1／1／1／1，主 repo 都 SAME，只留 LOG 目錄 |
| `t_sig.sh`／`t_int.sh`：sh／dash × INT／TERM × pid／group | sh 都清乾淨；dash 的 INT、TERM 都留 worktree |
| `t_to.sh`：逾時後子孫程序 | rc=1，`late2` 在結束後才被寫出來 |
| `t_conf.sh`：add/add、binary、modify/delete、rename、中文空白 | 3／3／3／0／3 |
| `t_env.sh`：gate.env 含引號、`$()`、語法錯、`exit 5`、`false`、CRLF、變數撞名、全形空白；路徑含空白與中文 | 語法錯 rc=0（BLOCKER 1），其餘見 FOLLOWUPS |
| `t_syn.sh`：sh／dash／bash × 3 種語法錯 | sh=0、bash=0、dash=2 |
| `t_glob.sh`：7 種 SCHEMA_GLOB × 4 種檔案清單 | 見 FOLLOWUP SCHEMA_GLOB 那條 |
| `dotdot`：`SHARE_DIRS='../victim'` | rc=0，`$TMPDIR/victim/keep.txt` 被刪 |
| mutation 9 組 | 見上 |

所有臨時 repo 與腳本都在 scratchpad；被測程式在 mutation 後已用 `cp` 還原，`git status` 乾淨。
