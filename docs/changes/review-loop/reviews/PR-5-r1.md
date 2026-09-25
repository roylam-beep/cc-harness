VERDICT: fix-needed

PR #5（review-loop 1.1：dispatch_state 簿記腳本），第 1 輪，視角 A（契約）。
head `cursor/review-loop-1-1-dispatch-state-0570`（d4e8d16），base `claude/review-loop-v04`（bfb3fc3）。在臨時 worktree 試合併，沒有衝突。

## BLOCKERS

1. **所有權解析跟 spec「未勾 task 缺所有權」不一致：`spec_merge check` 放行的 task，`next` 永遠印 `WAIT 缺所有權`**（`tools/dispatch_state.py:158-176`、`:209-217`）
   - 重現：拿 PR #3 的 `tools/spec_merge.py`（`open_tasks_missing_ownership`）跟本 PR 的 `parse_tasks` 解析同一段 tasks.md，下面三種寫法 spec_merge 判「有所有權」，dispatch_state 判「缺」：
     - D：task 行和 `  - 所有權：`a.py`` 中間夾一行沒縮排的文字。`:214` 的 `if nxt.strip() and not nxt[0].isspace(): break` 碰到沒縮排的行就把區塊切斷。spec 寫的是區塊「到下一條 task 或任何 `#` 開頭的標題為止」，沒說碰到沒縮排的行要停。
     - G：task 行有 `｜所有權：`a.py``，子行又寫 `- 所有權：同上`。`parse_ownership` 先看子行，拿到空清單就直接回傳，不再看 task 行上的欄位。
     - H：兩條 `- 所有權：` 子行，第一條是空值、底下沒有子項，第二條有 `` `a.py` ``。這裡只取第一條，結果是空清單。
   - 要改成：區塊只在下一條 task（`^\s*-\s*\[`）或 `#` 標題處結束，拿掉 `:214-215` 那兩行。所有權子行要有縮排才認（`OWNER_LINE`／`DEP_LINE` 要求前面至少一個空白），比照 spec 的「子行」。所有權改成把每一個認得的位置都收進來再取聯集：task 行上的 `｜所有權：`，加上區塊裡每一條 `- 所有權：`／`- **所有權**：`，各自的空值都照規則看更深一層子項。只要其中一處有反引號路徑就算有所有權，也就是 spec 說的「至少一個」。
   - 在 `test/dispatch_state.test.py` 的 test_16 補 D、G、H 三個案例，斷言 `READY 1.1`。

2. **`sync` 會把重派後的 `running` 列蓋成 `closed`／`reverted`，`next` 接著印 `READY`，同一條 task 被派第二次**（`tools/dispatch_state.py:611-642`）
   - 重現（假 gh）：tasks.md 的 `- [ ] 1.2`；runs.md 的 `| 1.2 | bc-new | run-new | running |  | revert 後重派 |`；gh 回 #7 `demo 1.2: a` 已合併、#8 `Revert "demo 1.2: a"` 晚一點合併。`sync` 輸出 `SYNC 1.2 reverted #7`，那一列被改成 `reverted | #7`，`next` 接著印 `READY 1.2`。closed 也一樣：舊 PR #8 已關閉，runs.md 是重派後的 `running` 空 PR，`sync` 把它改成 `closed #8`，`next` 印 `READY 1.2`。`merge_pr.sh` 每次合併都會跑 sync，所以任何一次合併都可能讓一條還在跑的 task 被再派一次。這正是檔頭「防什麼」說要防的事。
   - 要改成：算出的狀態是 `closed` 或 `reverted` 時，如果現有那一列是 `running`／`queued`／`finished`，而且它的 PR 欄是空的或不等於這個事件的 PR 號，代表那是事件之後的新一次派工，不要覆寫也不要列進 changes。`merged` 照舊一律寫。test_06 的 fixture 要跟著改：1.2 那列改成 `finished | #8`，才表示「就是這個 PR 被關掉」。另外補一個測試：重派後的 `running` 空 PR 列跑完 sync 不變，`next` 印 `SKIP 1.2 running`。

3. **`stale` 把沒抓到本機的 PR head 當成落後，已經跟上的 PR 也印 `STALE`**（`tools/dispatch_state.py:679-686`、`:704`）
   - 重現：本機 repo 只 fetch 過 `claude/x`。另一個 clone 在 `origin/claude/x` 之上 commit，推到 `cursor/f`。假 gh 回 open PR #5，`headRefOid` 設成那個 commit、`headRefName=cursor/f`。`stale --base claude/x` 印 `STALE #5 …`。手動 `git fetch origin cursor/f` 之後改印 `STALE 無`。`head_contains` 在 `cat-file -e` 失敗時直接回 False，`fetch_base` 也只抓 BASE。發包者的主 repo 平常只 pull BASE（`merge_pr.sh` 也是），所以實際上每條 open PR 都會被判成 STALE，違反「都不落後就印 `STALE 無`」。test_09 的 head 就建在同一個 repo，驗不到這種情況。
   - 要改成：本機沒有 `headRefOid` 時，先 `git fetch origin <headRefName>`（`gh pr list --json` 已經帶 `headRefName`）。還是沒有就不要判 STALE，印「無法對帳」並退出碼 2。test_09 補一個案例：head 只在 bare origin 的另一條分支上、本機沒 fetch，斷言印 `STALE 無`。

## FOLLOWUPS

- `upsert-run`／`sync` 寫 runs.md 時整份重畫（`render_runs`），表格外的標題、說明、尾註會被默默刪掉（實測 `# runs`／說明段落／尾註都消失）。目前兩份實際的 runs.md 都只有表格，所以不擋；建議保留表格前後的原文，或在 README 寫明 runs.md 只能有表格。
- 空的 `- 依賴：`（冒號後什麼都沒寫）被當成 `依賴：無`（`parse_dep_value` 回空清單），會跳過波次規則直接 `READY`；`依賴：見 1.1` 也會被當成依賴 1.1。建議空值當成沒寫（走波次），不是 `N.M`／`無` 的值就印 `WAIT N.M 依賴格式錯`。
- `merge_pr.sh` 固定用 `--subject "Merge PR #<n>: <PR 標題>"`。用 `git revert -m1 <merge>` 反轉那個 merge commit，subject 會變成 `Revert "Merge PR #7: review-loop 1.2: …"`，對不上 `Revert "<slug> N.M:`。spec 只要求後者，所以不擋；要不要一起認 [需確認]。
- 錯誤訊息（`用法錯：…`、`狀態非法：…`）印在 stdout，行首不是約定的六個字。2.x 如果逐行解析 stdout，可能被干擾。建議錯誤改印 stderr，「無法對帳」照 spec 留在 stdout。
- `gh pr list --limit 200`：一個 change 的 merged 或 closed PR 超過 200 條會少算。目前規模碰不到。
- `is_heading` 把縮排的 `#` 開頭行也當標題（PR #3 只認第 0 欄的 `#{1,6}\s`），例如子項裡的 `  #註` 會切斷區塊。建議跟 BLOCKER 1 一起對齊。
- `next --base` 有收這個參數但沒用到，可以拿掉，或在檔頭註明只是為了介面一致。

## 逐條 Scenario

| # | Scenario | 判定 | 證據（測試／實跑） |
|---|---|---|---|
| 1 | upsert 建檔與只改指定欄 | ✅ | test_01：斷言表頭逐字、第二次只改狀態與 `#7`，agentId／runId／備註不變，列數仍是 1 |
| 2 | upsert 擋非法狀態 | ✅ | test_02：`--status done` 退出碼 2、byte 相同；檔不存在時不建檔。mutation M1（拿掉狀態檢查）→ test_02 紅 |
| 3 | sync 依整合分支打勾 | ✅ | test_03：假 gh 故意不照 base 過濾，`main` 的同名 PR 不勾；`1.20` 不會被 `1.2` 誤勾；`--base` 蓋過 gate.env；沒有 gate.env 時預設 `main`。M4（base 不過濾）→ test_03、test_09 紅 |
| 4 | sync 抓事後 revert | ✅ | test_04（revert PR → `reverted`；之後再合併 → `merged #9`）、test_05（origin 上較晚的 revert commit；只在本機、沒推上去的不算）。M8（拿掉 origin revert 來源）→ test_05 紅。但重派後的列會被蓋掉，見 BLOCKER 2 |
| 5 | sync 記 closed | ✅（有 BLOCKER 2） | test_06：closed #8 → runs 記 `closed`，tasks 不動；有合併的 1.3 不被 closed 蓋掉。實跑：重派後的 running 列也被蓋成 closed |
| 6 | sync --check 只比對 | ✅ | test_07：有差時退出碼 1、tasks byte 不變、runs.md 不被建立；一致時退出碼 0、印 `SYNC 一致`。M2（--check 不提早 return）→ test_07 紅 |
| 7 | 沒有 gh | ✅ | test_08：PATH 裡沒有 gh、auth 失敗、pr list 失敗，三種都退出碼 2、印 `無法對帳`、byte 不變；auth 失敗時不呼叫 `pr list`；`DISPATCH_STATE_GH` 覆寫有效。M3（gh_ready 永遠 True）→ test_08 紅 |
| 8 | stale 找落後的 PR | ❌ | test_09 只驗 head 已經在本機的情況；實跑 head 沒 fetch 時誤報 STALE（BLOCKER 3） |
| 9 | next 看依賴 | ✅ | test_10：`WAIT 1.3 依賴 1.1 未合併`、沒寫依賴的走波次（`WAIT 2.2 前波未合併`）、`依賴：無` 直接 READY；1.1 勾了之後 1.3 READY |
| 10 | next 擋所有權重疊 | ✅ | test_11：`commands/**` 對 `commands/cc-review.md` 輸出逐字符合 spec；running／finished 會佔用所有權；fnmatch 雙向比；巢狀、粗體寫法。mutation（`paths_overlap` 回 False）→ test_11、test_13 紅。M5 只拿掉 `a/**` 分支時沒紅，因為 fnmatch 的 `*` 會跨 `/`，結果仍正確 |
| 11 | next 冪等 | ✅ | test_12：running／finished／merged 印 `SKIP`，failed／stalled 印 `SKIP … 需人工`；queued 仍可 READY |
| 12 | next 序列化 schema task | ✅ | test_13：同時只有一條 schema task READY，1.1 running 時 1.2 印 `WAIT 1.2 schema 序列化`。M9 → test_13 紅 |
| 13 | next 套上限 | ✅ | test_14（`--max 2`、有 1 條 running → 1 條 READY；`MAX_CONCURRENT=2`；預設 3；最後一行格式）、test_17（finished 不佔上限）。M7（finished 算在飛）→ test_11、12、17 紅 |
| 14 | next 缺所有權 | ✅（有 BLOCKER 1） | test_15、test_16（沒寫所有權、寫半形 `所有權:`，都印 `WAIT 缺所有權`）。M6 → test_15、16 紅。但有三種寫法 spec_merge 判合格、這裡判缺（BLOCKER 1） |

特別確認項：
- (1) 所有權與依賴解析：task 行 `｜所有權：`、子行 `- 所有權：`／`- **所有權**：`、空值看子項、`｜依賴：`／`- 依賴：`、`#` 標題切斷，這些都有做。但區塊結束條件和「至少一個位置」的規則跟 spec 不一致，見 BLOCKER 1。
- (2) 上限只算 running、finished 只佔所有權：✅（test_17、M7）。
- (3) BASE 取值順序 `--base` → gate.env → main：✅（test_03 三段）。
- (4) sync 只算 base 等於 BASE 的 PR；revert 有兩種來源，取時間最晚的事件：✅（test_03～05）。
- (5) `--check` 不寫檔，退出碼 0／1：✅。
- (6) gh 不在或 auth 失敗 → 退出碼 2、印「無法對帳」、不寫檔：✅。
- (7) 非法狀態 → 退出碼 2、byte 不變：✅。
- (8) 正常輸出的行首只有 READY／WAIT／SKIP／STALE／SYNC／NEXT：✅。錯誤訊息的行首不在約定內，見 FOLLOWUP。
- (9) 只用標準庫（argparse、datetime、fnmatch、json、os、re、subprocess、sys、tempfile）；docstring 有用法、退出碼、防什麼：✅。
- 用真的 `docs/changes/review-loop/` 複本跑 `next`：
  - 照現在的 runs.md：`SKIP 1.1–1.4`、`WAIT 1.5 超過上限`、2.x／3.1 都印 `WAIT … 依賴 … 未合併`，最後一行 `NEXT READY 0｜在飛 3｜上限 3`。
  - 拿掉 runs.md、帶 `--max 10`：`READY 1.1–1.5`、2.x 等依賴。
  - 解析結果：1.x 依賴都是無、2.x 依賴正確，1.x 之間所有權不重疊。結果合理。
  - 另外用 SetupHK `system-completion` 的複本（SetupHK 的巢狀 `**所有權**` 寫法）跑，解析正常。

## 實跑

| 指令 | 退出碼 |
|---|---|
| `git fetch` 兩條分支、`git worktree add --detach`、`git merge --no-ff` PR head | 0（無衝突） |
| `git diff --name-only origin/claude/review-loop-v04...origin/cursor/review-loop-1-1-dispatch-state-0570` → `test/dispatch_state.test.py`、`tools/dispatch_state.py` | 0（是所有權的子集） |
| `python3 test/dispatch_state.test.py`（17 項 OK） | 0 |
| `python3 tools/check_docs.py .` | 0 |
| `python3 tools/spec_merge.py check .` | 0 |
| `python3 test/spec_merge.test.py`（25 項） | 0 |
| `python3 test/test_skills.py`（10 支） | 0 |
| `node test/guard-bash.test.mjs` | 0 |
| 「驗：」整句 `python3 test/dispatch_state.test.py && BASE-GATE` | 0 |
| mutation M1–M4、M6–M9、`paths_overlap` 全關（在 worktree 暫改，每次都 `git checkout` 還原） | 都紅（1），M5 沒紅，原因見上 |
| `next` 跑在 review-loop 與 SetupHK system-completion 的複本（臨時目錄） | 0 |
| 自製 probe：upsert 保留表格外原文（A）、空依賴（C）、區塊切斷（D）、task 行空所有權（F）、sync 重派覆寫（BLOCKER 2，reverted 與 closed 各一次）、stale 沒 fetch head（BLOCKER 3）、跟 PR #3 `spec_merge.py` 解析比對（D、G、H、I、J） | 0（行為如上所述） |
| 共同約束：沒有 `/Users/` 絕對路徑、沒有 `sed -i`／`readlink -f`／shell `timeout`（`timeout=` 是 Python subprocess 參數）、`py_compile` 通過 | ✅ |
