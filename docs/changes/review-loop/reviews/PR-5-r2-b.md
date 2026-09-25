VERDICT: fix-needed

PR #5（review-loop 1.1：dispatch_state 簿記腳本），第 2 輪，視角 B（對抗）。
被測物：臨時 worktree 在 `origin/claude/review-loop-v04`（c82f881）上 `--no-ff` 合進 `origin/cursor/review-loop-1-1-dispatch-state-0570`（d4456c2），沒有衝突。
三點 diff 只動 `tools/dispatch_state.py`、`test/dispatch_state.test.py`，都在所有權內。
所有權相關的 `indent_cols`／`nested_has_backtick_path`／`ownership_found` 與 `spec_merge.py` 做 AST 比對，三個函式完全相同；`TASK_ANY`／`HEADING`／`BACKTICK_PATH`／`OWN_SUB`／`OWN_INLINE` 五個 regex 字面也相同。
第 1 輪三個 BLOCKER 的行為都修好了（實跑見下），但有兩件事還擋合併。

## BLOCKERS

1. **test_18 沒有單獨驗到「sync 不蓋重派中的列」的任何一個條件，(a)(b)(c) 拿掉任一個、甚至拿掉兩個，測試照樣全綠**
   - 位置：`test/dispatch_state.test.py:981-1049`（test_18）。對應程式在 `tools/dispatch_state.py:713-718`。
   - 重現（只在臨時 worktree 改程式，跑 `python3 test/dispatch_state.test.py`）：
     - 把 `:714` 的 `tid in open_of` 換成 `False`（拿掉 (a)）→ 19 項全過。
     - 把 `:715` 的 REDISPATCH 條件換成 `False`（拿掉 (b)）→ 全過。
     - 把 `:716` 的「PR 欄有值但不是事件 PR」換成 `False`（拿掉 (c)）→ 全過。
     - 把 `REDISPATCH` 改成只剩 `("running",)`（queued／finished 不算重派）→ 全過。
     - (a)+(c) 一起拿掉 → 全過；(b)+(c) 一起拿掉 → 全過。
   - 原因：test_18 的 closed 情境是「列 `running #5`，而且 #5 是 open」，(a)(b)(c) 三個條件同時成立；revert 情境也是 (a)(b) 同時成立。所以只要 (a) 或 (b) 還在，測試就會過，(c) 完全沒測到。spec「sync 不蓋重派中的列」把三個條件寫成三個獨立的「或」，tasks.md 共同約束也要求每個負向 Scenario 都要有一個真的會紅的案例。
   - 要改成：在 test_18（或新的 test_20）補下面這些情境，每個只讓一個條件成立，斷言 `sync` 輸出 `SYNC 一致`、runs.md byte 不變、`sync --check` 退出碼 0：
     - 只有 (a)：列 `failed`、PR 空白；gh 有 `closed #3`、`open #5`。
     - 只有 (b)：列 `running`、PR 空白；gh 只有 `closed #3`，沒有 open PR。`queued` 跟 `finished` 各跑一次。
     - 只有 (c)：列 `failed #5`；gh 只有 `closed #3`，沒有 open PR。revert 也要跑一次：列 `failed #5`，gh 有 `merged #3`、`Revert` 合併 #4，沒有 open PR。
     - 反例（要寫）：列 `failed #3`，gh 只有 `closed #3` → `SYNC 1.1 closed #3`。
   - 我在臨時 harness 跑過上面這幾個情境，程式行為都是對的，只是測試沒守住。

2. **tasks.md 裡同一個 N.M 出現兩次時，`next` 跟 `spec_merge check` 判定相反，而且把缺所有權的那一塊印成 `READY`**
   - 位置：`tools/dispatch_state.py:895-939`（`cmd_next` 用 `lines[task.id]` 當 key，後寫的蓋掉前面的，再依 task 清單把同一行印兩次）。
   - 重現：
     ```
     ## 1. 波
     - [ ] 1.1 a ｜驗：t
       - 所有權：`a.py`
       - 依賴：無
     - [ ] 1.1 dup ｜驗：t
       - 依賴：無
     ```
     `spec_merge.py check` 退出碼 1，回報「L5：task 1.1 缺所有權」；`dispatch_state.py next <dir> --max 9` 退出碼 0，印 `READY 1.1`／`READY 1.1`／`NEXT READY 1｜在飛 0｜上限 9`。兩塊順序對調也一樣，都印兩行 `READY 1.1`。
   - 後果：違反 Scenario「next 缺所有權」（沒有所有權的區塊「永遠不會 READY」），也違反 tasks.md 1.1「必須與 `spec_merge.py check` 的判定一致」。`READY` 行數 2 跟摘要 `NEXT READY 1` 對不上，照行首解析的 `/cc-review`／`merge_pr.sh` 會拿到兩次 1.1。
   - 要改成：`parse_tasks` 之後，只要一個 N.M 出現超過一次，就不讓它進 candidates，每個 N.M 只印一行 `WAIT N.M 編號重複`（行首還是 `WAIT`）；或者更保守，任一塊缺所有權就印 `WAIT N.M 缺所有權`，跟 check 一致。兩種都要補一個測試：同一份檔同時跑 `spec_merge check` 與 `next`，斷言 1.1 不會 `READY`、每個 N.M 最多只有一行。

## FOLLOWUPS

- [需確認] task 行辨識還有一個地方不一致：`- [ ] 1.1`（沒有標題）和 `- [ ] 1.1 `（只有尾端空白），`spec_merge` 的 `TASK_OK` 判成「task 行格式錯」、check 紅；`dispatch_state` 的 `TASK_LINE`（`(?=\s|$)`）照樣當成 task，有所有權就 `READY 1.1`。所有權判定本身沒有矛盾（check 對這行不判所有權），但 check 紅、next 綠。建議 `TASK_LINE` 改成跟 `TASK_OK` 一樣要求 `\s+\S`，或對這種行印 `WAIT N.M 格式錯`。
- [需確認] fetch BASE 失敗時沒有任何提示（第 1 輪就列過，這輪沒改）。實測：origin URL 改成不存在的路徑，PR head 本機已經有，`stale` 用舊的 `origin/<BASE>` 印 `STALE 無`、退出碼 0，但真的 origin 上 BASE 已經前進，那條 PR 其實落後。head fetch 失敗會退出碼 2，BASE fetch 失敗卻不會，兩邊標準不一。`sync` 也會因此漏掉剛推上去的 revert commit。建議 `fetch_base` 失敗時照 head 的做法印「無法對帳」、退出碼 2，或至少印一行不同行首的警告。
- `pull/<n>/head` 這條退路沒有測試：把 `ensure_pr_head` 裡的 `fetch origin pull/<n>/head` 換成 `pass`，19 項照樣全過。我用 bare origin 只放 `refs/pull/7/head`、刪掉分支，實跑 `STALE 無`，行為是對的。建議 test_09 補這個案例。
- CRLF 的 tasks.md 跑 `sync` 後整份變成 LF（第 1 輪就列過，這輪沒改）。實測 SetupHK tasks.md 轉成 CRLF 後跑 sync：321 個 CRLF 全部不見，不只改目標那一行。`apply_marks` 裡處理 `\r\n` 的程式跑不到，因為 `read_text` 用了預設的換行轉換。讀寫都用 `newline=""` 就能保住。
- [需確認] spec 層面：(b) 把 `finished` 算成「重派中」。一般流程是 agent 做完寫 `finished #5`，審查後關掉 #5，這時 sync 永遠不會記 `closed`，`next` 一直印 `SKIP 1.1 finished`、一直佔著所有權，要人手動 upsert。這跟 spec 一致，但可能不是想要的結果。
- [需確認] revert 之後、sync 還沒跑之前就重派（列 `running`，box 還是 `[x]`）：sync 因為 (b) 整條跳過，box 會一直停在 `[x]`，但程式碼已經被 revert。依 spec「不寫該列」算是合規，但 tasks.md 勾選會錯。建議 spec 講清楚：跳過的只有 runs.md 那一列，還是勾選也一起跳過。
- [需確認] 列是 `failed #3`、gh 有 `closed #3` 時，sync 會寫成 `closed #3`，`next` 從 `SKIP 1.1 failed 需人工` 變成 `READY 1.1`，「需人工」的狀態就這樣被自動解除。這符合 spec，只是要確認這是不是想要的。
- `next` 不看 gh：列是 `closed #3`（或沒有列），但 BASE 上已經有 open PR #5／#6 時，`next` 照樣印 `READY 1.1`。靠的是派工時一定會先 upsert `running`。建議在 `/cc-dispatch` 的文件寫明這個前提。
- `` ` ` ``（反引號裡只有空白）兩邊都算有所有權（判定一致），但 `ownership_paths` 取出空清單，這條 task 永遠不會跟別人重疊。影響小。
- 每條 PR 最多 fetch 兩次，每次逾時 60 秒，ssh remote 沒設 `BatchMode`；open PR 多、網路又卡的時候 `stale` 可能跑好幾分鐘。

## 逐條 Scenario

| Scenario | 判定 | 證據 |
|---|---|---|
| upsert 建檔與只改指定欄 | ✅ | test_01；SetupHK runs.md 複本 `upsert-run 6.1 --status finished --pr 99`：只有 6.1 的狀態／PR 改變，其他列只多了空格正規化 |
| upsert 擋非法狀態 | ✅ | test_02；SetupHK 複本 `--status bogus` 退出碼 2 |
| sync 依整合分支打勾 | ✅ | test_03；SetupHK 複本假 gh 回 `system-completion 6.1:` merged #50 → 只有 L286 從 `[ ]` 改成 `[x]`，runs 6.1 `merged #50` |
| sync 抓事後 revert | ✅ | test_04、test_05；harness L：`merged #3`＋Revert #4 → `[ ]`、`reverted #3` |
| sync 記 closed | ✅ | test_06；harness E、P：`closed #3` 寫入 |
| sync 不蓋重派中的列 | ✅ 行為／❌ 測試 | 行為：harness A（running、PR 空、沒有 open）、B（queued）、C（只有 open PR）、D（只有 PR 不同）、F（finished）、G（兩個 open PR）、H／J／K（revert 版）全部 `SYNC 一致`、`--check` 退出碼 0；M／N：新 PR 合併後蓋過 running，變成 `merged #5` 並打勾。測試：mutation M1／M2／M3／M4 都沒被抓到（BLOCKER 1） |
| sync --check 只比對 | ✅ | test_07；harness 每個情境 check1／check2 退出碼都跟預期一致（有差回 1，一致回 0） |
| 沒有 gh | ✅ | test_08 |
| stale 找落後的 PR | ✅ | test_09；stale harness：head 只在 origin 分支 → `STALE 無`；另一條落後 → `STALE #6`；分支刪掉、只剩 `pull/7/head` → `STALE 無`；取不到 → `無法對帳：取不到 PR #8 的 head` 退出碼 2；headRefName 空的 → 退出碼 2；headRefName＝BASE → `STALE 無`。只有 `refs/remotes/origin/*` 變動，本機分支、HEAD、local config 都沒動 |
| next 看依賴 | ✅ | test_10 |
| next 擋所有權重疊 | ✅ | test_11；SetupHK 全部改成未勾：1.9／1.13／1.16 印 `WAIT … 與 1.6 重疊` |
| next 冪等 | ✅ | test_12；SetupHK 原檔：merged／finished／running 都印 `SKIP` |
| next 序列化 schema task | ✅ | test_13 |
| next 套上限 | ✅ | test_14、test_17；SetupHK 原檔 `NEXT READY 0｜在飛 6｜上限 3` |
| next 缺所有權 | ❌ | test_15、test_16、test_19 過；mutation M8（只看第一條子行）、M9（遇到沒縮排的行就切斷）都會紅。但重複 N.M 的情況會把缺所有權的區塊印成 READY（BLOCKER 2） |

### 所有權：30 種怪格式，check 與 next 並排跑

路徑含空白（`own cases/…`）。30 種裡 26 種一致：CRLF、tab 縮排、全形空白縮排、NBSP 縮排、純 CR、BOM、空檔、`* [ ]`、`+ ` 子項、`### ` 切斷、`#tag`（沒空白）、縮排的 `## `、fenced code 裡的 `#`、`` ` ` ``、` `` `、行內 `｜所有權：` 空值加更深子項、`**所有權：**`（冒號在粗體內）、`所有權 ：`、三層巢狀、巢狀非 bullet、巢狀數字清單、`1.1.2`、`1.1:`、巢狀 task、行內半形之後接全形、`[X]`。
不一致的 4 種、2 類：
- `- [ ] 1.1`／`- [ ] 1.1 `：check 判格式錯，next `READY`（FOLLOWUP 第 1 條）。
- 重複 N.M（兩種順序）：check 判缺所有權，next 印兩行 `READY 1.1`（BLOCKER 2）。

SetupHK `docs/changes/system-completion/tasks.md` 複本：原檔兩邊都綠；全部改成未勾之後，兩邊都只標 3.1、5.1 缺所有權，完全一致。

### 回歸

`git diff d4e8d16 d4456c2 -- test/dispatch_state.test.py` 刪掉的測試行只有 test_06 的 1.2 列（`running` 改成 `failed`），這是配合 spec 新規則 (b)，而且 `closed #8` 的斷言還在，沒有變弱。其他都是新增。

## 實跑

| 指令 | 退出碼 |
|---|---|
| `git fetch` 兩條分支、`worktree add --detach`、`merge --no-ff` | 0 |
| `python3 test/dispatch_state.test.py`（19 項） | 0 |
| `python3 tools/check_docs.py .` | 0 |
| `python3 tools/spec_merge.py check .` | 0 |
| `python3 test/spec_merge.test.py`（27 項） | 0 |
| `python3 test/test_skills.py`（10 支） | 0 |
| `node test/guard-bash.test.mjs` | 0 |
| mutation M1–M9、M1+M3、M2+M3（臨時 worktree，跑完還原，`git status` 乾淨） | M1–M4、M6、M1+M3、M2+M3 為 0（沒抓到）；M5、M7、M8、M9 為 1 |
| 所有權 fuzz 30 例（`spec_merge.py check` 對 `dispatch_state.py next`） | 見上 |
| SetupHK 複本：`check`、`next`、`upsert-run`、`sync --base main`（含 CRLF 版） | 見上 |
| sync harness 16 個情境（假 gh） | 見逐條 |
| stale harness（bare origin、`refs/pull/7/head`、壞 URL） | 見逐條 |
| `worktree remove --force`、`worktree prune`；刪掉臨時目錄 | 0 |

所有指令都包了 `perl -e 'alarm N; exec @ARGV'`。沒有起服務，沒有 push，也沒有在 GitHub 上留言。主工作目錄只多了這份報告；SetupHK 只讀取，資料都先複製到臨時目錄。
