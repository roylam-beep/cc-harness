VERDICT: fix-needed

PR #5（review-loop 1.1：dispatch_state 簿記腳本）第 1 輪，視角 B（對抗）。被測物：`origin/claude/review-loop-v04` 加上 `--no-ff` 合進來的 `origin/cursor/review-loop-1-1-dispatch-state-0570`。diff 只動 `tools/dispatch_state.py`、`test/dispatch_state.test.py`，都在所有權內。

## BLOCKERS

1. **sync 會把重派中的 task 蓋回 `closed`／`reverted`，`next` 因此又給 READY，同一條 task 會開出第二個 agent**
   - 位置：`tools/dispatch_state.py:615-642`（`plan_sync` 算 `desired` 的地方）。`closed`／`reverted` 不看該列目前的狀態與 PR，每次 sync 都會重寫。
   - 重現（假 gh，BASE=claude/x）：
     1. `#3 "review-loop 1.1: 甲"` 已關閉未合併，`sync` 後記 `closed #3`（這一步是對的）。
     2. 照正常流程重派：`upsert-run <dir> 1.1 --agent bc-new --run r-new --status running --pr 5`，而且 #5 是 open PR。
     3. 再跑 `sync`：印 `SYNC 1.1 closed #3`，列被改回 `| 1.1 | bc-new | r-new | closed | #3 |  |`（PR 也從 #5 退回 #3）；接著 `next` 印 `READY 1.1`。
     4. revert 也一樣：`#3` 合併、`#4 Revert "review-loop 1.1: 甲"` 合併，sync 記 `reverted`；重派 `--status running` 後再 sync，又變回 `reverted`，`next` 印 `READY 1.1`。
   - 後果：`merge_pr.sh` 每合一個 PR 都會跑 sync，所以只要有一條 task 在「關閉或 revert 後重派」，下一次合併別的 PR 就會把它改回可派，冪等派工失效；`sync --check` 也會一直回 1，健康檢查永遠不過。
   - 要改成：寫 `closed`／`reverted` 之前先看該列。建議規則：(a) 這條 N.M 在 BASE 上還有 open PR，就不寫；(b) 該列狀態是 `queued`／`running`，就不寫；(c) 該列 PR 有值、但不是這次事件的 PR（被關的那個，或被 revert 的那次合併），就不寫。`merged` 照舊可以蓋過任何狀態。`tasks.md` 取消勾選的邏輯不用動。
   - 測試：補上面兩個重現案例（重派後 sync，列保持 `running #5`、`next` 印 `SKIP 1.1 running`、`sync --check` 退出碼 0）。`test_06` 目前的預期是「`running`、PR 空白 → `closed #8`」，跟規則 (b) 衝突，要一起改。spec「sync 記 closed」也要補一句「該列正在重派（queued／running，或 PR 不是這個）時不蓋」，同一個 PR 改掉。

2. **stale 只 fetch BASE，沒有 fetch PR head，已經跟上 BASE 的 PR 在發包者本機也會被報成 `STALE`**
   - 位置：`tools/dispatch_state.py:679-686`（`head_contains`）與 `:704`（`cmd_stale` 只呼叫 `fetch_base`）。本機沒有 head commit 時，`cat-file -e` 失敗，程式直接當成「落後」。
   - 重現：建一個 bare origin；另一個 clone 推 `cursor/x`，內容已經包含最新的 `claude/x`；假 gh 回 `headRefOid=<那個 commit>`。在沒 fetch 過 `cursor/x` 的 dev clone 跑 `stale`，會印 `STALE #5 review-loop 1.1: 甲`。手動 `git fetch origin cursor/x` 後再跑，才印 `STALE 無`。
   - 後果：Cursor agent 每次追加 commit 之後，發包者本機都還沒有那個 head。`/cc-review` 被叫醒時第一步就跑 `stale`，會把每個剛更新的 PR 誤判成落後，違反 Scenario「stale 找落後的 PR」的「都不落後就印 `STALE 無`」。`test_09` 的 head commit 是在同一個 repo 裡做出來的，所以驗不到這個情況。
   - 要改成：比對前先 `git fetch origin <headRefName>`（`gh pr list` 已經有拿 headRefName），GitHub 上也可以改抓 `pull/<n>/head`。fetch 之後還是找不到該 commit，就不要印成 `STALE #n`：要嘛印一行不同行首的訊息，要嘛整支退出碼 2 印「無法對帳」，二選一，寫進檔頭。
   - 測試：`test_09` 加一個案例，head 由另一個 clone 推到 bare origin、本機沒 fetch，預期輸出 `STALE 無`。

## FOLLOWUPS

- [需確認] `load_runs` 會收進檔案裡所有 `|` 開頭的行，而且不認表頭；`render_runs` 則整檔重寫。實測：runs.md 前面有 `# runs` 和說明文字、後面有另一張表時，upsert 之後標題與說明整段消失，另一張表的 `| 項 | 值 |`、`| foo | bar |` 被補成 6 欄的假列。表頭欄位順序不同（例：`| task | 狀態 | PR | agentId | runId | 備註 |`）時，照位置對欄，`running` 被當成 agentId，`next` 對真的在跑的 1.1 印 `READY`。現有檔（本 repo、SetupHK）都是純表格、表頭跟 cc-dispatch.md 一樣，所以目前不會觸發。建議只解析第一張「表頭剛好是這 6 欄」的表：欄位順序不同就照欄名對應，不然退出碼 2；表格以外的行 byte 不動。
- runs.md 裡同一個 task 有兩列時：`upsert-run` 改的是第一列（`find_row`），`next` 讀的是最後一列（dict 後寫的蓋前面）。實測 upsert 成 `finished #9` 後，`next` 仍印 `SKIP 1.1 running`。建議遇到重複列就退出碼 2，或規定只認同一列。
- 儲存格裡手寫的 `\|` 會被拆成兩格，超過 6 欄的部分被丟掉（實測 `a \| b` 變成 `a \`）。工具自己寫入時會把 `|` 換成 `／`，所以只有手改過的檔會中。
- CRLF 的 tasks.md 跑完 sync 會整檔變成 LF：實測 321 行 CRLF 全部轉掉，不只改目標行。`apply_marks` 裡處理 `\r\n` 的那段其實跑不到，因為 `read_text` 用了預設的換行轉換。`open(..., newline="")` 讀寫就能保住。沒有結尾換行的檔跑完仍然沒有，正常。
- [需確認] 所有權重疊有兩個盲點，SetupHK 的真實資料都有用到：
  - 結尾是 `/` 的目錄寫法（SetupHK 1.13 的 `src/components/shared/`）跟它底下的檔案不算重疊。
  - 大括號 glob（SetupHK 6.2–6.4 的 `src/components/{companies,contacts,shared}/**`）不會展開，跟 `src/components/companies/X.jsx` 不算重疊。
  - 另外兩邊都是 glob 時（`a/b/**` vs `a/*/c`）也判不出重疊。
  - tasks.md 的規則只寫了 `**` 和 fnmatch，實作沒有違反規則，但下游的真實寫法會被漏判。建議把 `a/` 當成 `a/**`、先展開 `{}`，並在 spec／tasks 註明。
- `依賴：` 的值認不得時，一律當成「無」：空值和 `依賴：待定` 實測都印 `READY`。建議值不是 `無`、也抓不到任何 N.M 時，改成 `WAIT N.M 依賴格式不明`。
- task 行上的 `｜所有權：` 如果空白，會把整個區塊所有子項的反引號都收進所有權，連 `PR 標題：`d 1.4: x``、`契約：`spec.md`` 也算。1.3 的 `spec_merge check` 合併後，要確認兩邊對這種寫法的判定一致。
- `fetch_base` 失敗時沒有任何提示：origin URL 壞掉時，`stale` 照樣用舊的 `origin/<BASE>` 印 `STALE 無`，sync 也可能漏掉剛推上去的 revert commit。建議至少印一行警告。
- [需確認] `merge_pr.sh` 的合併 subject 是 `Merge PR #n: <標題>`。直接 `git revert -m1 <merge>` 產生的 subject 會是 `Revert "Merge PR #7: review-loop 1.2: …"`，不符合 `^Revert "<slug> N.M:`，所以認不到。目前只有用 GitHub「Revert」按鈕開出來的 PR 標題抓得到。要不要一起認，要在 spec 決定。
- 寫檔失敗時（例：目錄唯讀）印出 Python traceback、退出碼 1，跟 `sync --check` 的「有待改」同一個碼。建議抓 `OSError`，印一行後退出碼 2。另外 `mkstemp` 建的檔權限是 0600，runs.md 被 upsert 後會從 0644 變成 0600（git 不追蹤這個權限位元，影響小）。
- `gh pr list --limit 200`：BASE 上已合併的 PR 超過 200 個時，舊的會被截掉。`mergedAt` 解析不了的已合併 PR 也會直接被略過，不會有任何提示。
- [需確認] schema 序列化只把 `running` 算成在飛。已經 `finished`、PR 還沒合併的 migration，擋不住另一條 schema task 變成 READY；`queued` 也不佔所有權。是否符合「同一時間最多一條」的原意，要確認。

## 逐條 Scenario

| # | Scenario | 判定 | 證據 |
|---|---|---|---|
| 1 | upsert 建檔與只改指定欄 | ✅ | test_01；實測：在 SetupHK runs.md 副本上 `upsert-run 4.1 --status merged --pr 31`，`diff` 只有第 26 行變動，其餘 27 行 byte 不變；中文與 `；` 保留，`|` 轉成 `／` |
| 2 | upsert 擋非法狀態 | ✅ | test_02（退出碼 2，byte 不變；檔案不存在時也不會建檔） |
| 3 | sync 依整合分支打勾 | ✅ | test_03；實測：SetupHK 副本在 BASE=main 下 `sync`，tasks.md 只改第 257 行、runs.md 只改第 26 行；slug `review` 不會吃到 `review-loop-v2`／`review-loop` 的標題，前後空白會被 strip；同一個 N.M 有 3 個已合併 PR 時取最晚的 #6，第二次跑印 `SYNC 一致` |
| 4 | sync 抓事後 revert | ✅（有 BLOCKER 1 的副作用） | test_04、test_05；revert 本身判得對，但重派之後會被蓋回去，見 BLOCKER 1 |
| 5 | sync 記 closed | ✅（有 BLOCKER 1 的副作用） | test_06；會蓋掉正在重派的列，見 BLOCKER 1 |
| 6 | sync --check 只比對 | ✅ | test_07；200 條 task 的 fixture：sync 之後 `--check` 印 `SYNC 一致`，退出碼 0 |
| 7 | 沒有 gh | ✅ | test_08；實測：`DISPATCH_STATE_GH=nonexistent-gh` 退出碼 2；gh 回非 JSON 時 sync／stale 都印「無法對帳」、退出碼 2、tasks.md 不變；gh 回空陣列時印 `SYNC 一致`／`STALE 無` |
| 8 | stale 找落後的 PR | ❌ | test_09 只驗了 head 在本機的情況；head 不在本機時誤報，見 BLOCKER 2 |
| 9 | next 看依賴 | ✅ | test_10、test_16；SetupHK 副本：6.x 因為 4.1 未勾印 `WAIT 前波未合併`，把 4.1 改成已勾後 6.1、6.2 變 READY；本 repo：2.x、3.1 依賴都判對 |
| 10 | next 擋所有權重疊 | ✅（規則內） | test_11；邊界實測：`a/**`⊃`a/b/c.md` ✓、`a/*.md`∩`a/b.md` ✓、`a` 與 `ab/` 不重疊 ✓、`a/**` 與 `ab/c` 不重疊 ✓；目錄結尾 `/`、大括號 glob 的盲點列在 FOLLOWUPS |
| 11 | next 冪等 | ✅ | test_12；重派之後被 sync 蓋掉的問題見 BLOCKER 1 |
| 12 | next 序列化 schema task | ✅ | test_13 |
| 13 | next 套上限 | ✅ | test_14、test_17；本 repo 實測 `NEXT READY 0｜在飛 3｜上限 3`；SetupHK 把 `4.1-fix running` 算進在飛 1 |
| 14 | next 缺所有權 | ✅ | test_15、test_16（半形冒號不算）；實測：`所有權：見上面`（沒有反引號）印 `WAIT 缺所有權` |

其他檢查：
- 副作用：只寫目標 change 目錄的 tasks.md／runs.md，再加上 `git fetch`（會寫 FETCH_HEAD 和 remote-tracking ref）；不改 git 設定、不動別的 worktree。
- 共同約束：只用標準庫；檔頭有用法、退出碼表、防什麼；不需連網；測試用假 gh 和本機 bare repo。
- 回歸：diff 只新增兩個檔，沒有刪掉或放寬任何既有斷言。
- 效能：200 條 task（10 組 × 20）跑 `next` 0.04 秒、`sync` 0.09 秒；路徑含空白與中文也正常。

## 實跑

| 指令 | 退出碼 |
|---|---|
| `git fetch`＋`worktree add --detach`＋`merge --no-ff origin/cursor/review-loop-1-1-dispatch-state-0570` | 0 |
| `python3 test/dispatch_state.test.py`（17 項 OK） | 0 |
| `python3 tools/check_docs.py .` | 0 |
| `python3 tools/spec_merge.py check .` | 0 |
| `python3 test/spec_merge.test.py`（25 項） | 0 |
| `python3 test/test_skills.py`（10 支） | 0 |
| `node test/guard-bash.test.mjs` | 0 |
| `dispatch_state.py next docs/changes/review-loop`（本 repo） | 0 |
| SetupHK tasks.md／runs.md 副本：`next`、`upsert-run`、`sync --check`（1）、`sync`（0）、CRLF 與沒有結尾換行的變體 | 見上 |
| 對抗 runs.md：前後有其他內容、重複列、表頭順序不同、列太短或太長、`\|`、CRLF | 全部 0（輸出內容有問題，見 FOLLOWUPS） |
| 對抗 sync：closed 後重派、revert 後重派（BLOCKER 1）、同一 N.M 多次合併、標題空白／大小寫／slug 前綴、空陣列、非 JSON、`mergedAt` 壞掉、gh 不存在 | 0 或 2，照上面各自說明 |
| 對抗 stale：本機沒 fetch 過 head（BLOCKER 2）、fetch 失敗 | 0 |
| 效能：200 條 task 的 `next`／`sync`／`sync --check` | 0／0／0 |
| 寫檔失敗（目錄唯讀）：`upsert-run` | 1（印 traceback，原檔沒被截斷） |
