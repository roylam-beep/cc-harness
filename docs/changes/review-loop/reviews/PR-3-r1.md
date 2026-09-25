VERDICT: fix-needed

PR #3（review-loop 1.3）第 1 輪驗收，視角 A（契約）。head `007f859`，試合併到 `origin/claude/review-loop-v04`（`f47ac10`）後驗。

## BLOCKERS

1. `docs/changes/README.md:28`、`:39`（`templates/docs/changes/README.md` 同行，兩份要一起改、改完 `cmp` 仍相同）：格式範例寫 `所有權：<路徑>`，說明寫「冒號後面可以直接寫路徑」，沒講路徑要用反引號包。可是 1.1 的 `dispatch_state.py next`／`sync` 依 tasks.md 1.1 的規定只收「`所有權：` 後面的反引號路徑」。照 README 寫的 `  - 所有權：src/a.py` 會通過 `spec_merge.py check`，但 `dispatch_state` 讀到的路徑是空的，所有權重疊偵測會靜默失效。
   - 重現：在任一 change 的 tasks.md 寫 `- [ ] 1.1 x ｜驗：y` 加一行 `  - 所有權：src/a.py`，跑 `python3 tools/spec_merge.py check .`，退出碼是 0，但這行沒有任何反引號路徑可以給 1.1 解析。
   - 改法：範例改成 ``- 所有權：`<路徑>`、`<路徑>` ``，說明那句改成「路徑用反引號包，多個用 `、` 分隔；冒號後面空著時，就在更深一層的 `- ` 子項列反引號路徑」。只改文件，`spec_merge.py` 的判定不動。
2. `commands/cc-gate.md:53`：gate 寫回 `## 0.` 缺陷 task 的格式是 `  - 所有權：<缺陷所在檔>`，沒有反引號。gate 照這個格式寫回的每一條缺陷 task，交給 `dispatch_state.py next` 時都讀不到所有權路徑，會跟動到同一個檔的 task 同時被判 `READY`。
   - 改法：改成 ``  - 所有權：`<缺陷所在檔>` ``；`:56` 那句補「路徑用反引號包」。

## FOLLOWUPS

1. [需確認] `tools/spec_merge.py:213-216`：有 `所有權：` 標記就算有，不管後面有沒有路徑。`  - 所有權：`（值空白、底下也沒有子項）會是綠的；task 行上順口寫到的「沒有所有權：之後補」也會算有。spec 只要求有標記，所以不算 BLOCKER。要收緊（至少一個反引號路徑）得先改 spec 的「未勾 task 缺所有權」Scenario。Codex 在 PR 上的 P2 留言也是同一件事。
2. `commands/cc-gate.md:18` 寫「diff 只能碰 `docs/plans/**`」，`:48` 卻又要寫進 `docs/changes/<slug>/tasks.md`，兩句互相矛盾。這個矛盾在本 PR 之前就有，不在 1.3 的範圍。
3. `code fence` 裡的 `- [ ] N.M` 範例行也會被當成 task 查所有權（實測 L10 `task 9.9 缺所有權`）。這跟既有 `tasks_stats` 逐行解析的行為一致，不是本 PR 新造成的，只是現在多一種方式變紅。要處理的話，可以在 README 補一句「tasks.md 的 code fence 內不要放 `- [` 開頭的行」。

## 逐條 Scenario（spec.md MODIFIED「spec_merge check 快閘」）

- ✅ Requirement 沒情境：`test_24_check_bad_delta_and_bad_spec_fail` 斷言退出碼 1。另外用 probe fixture 實跑，輸出是 `docs/changes/p/spec.md ADDED Requirements：Requirement「Bare」沒有 Scenario`，有指出檔案與 Requirement 名。本 PR 沒動這一塊。
- ✅ task 行格式錯：`test_23_check_bad_task_line_fails` 斷言退出碼 1 與 `tasks.md L2`。本 PR 沒改它。
- ✅ 沒鋪就綠：`test_21_check_no_changes_dir_is_green` 斷言退出碼 0 與「不存在跳過」。
- ✅ 超量只警告：`test_25_check_warnings_do_not_fail` 斷言退出碼 0、「進行中 5 > 3」、「全勾但未歸檔」。本 PR 只在 fixture 補了一行所有權，斷言沒改。
- ✅ 未勾 task 缺所有權：`test_26_unchecked_task_missing_ownership_fails`。
  - 紅的案例：斷言退出碼 1，以及 `L2：task 1.1 缺所有權`、`L3：task 1.9`（所有權沒縮排）、`L6：task 1.5`（被標題切斷）。`assertNotIn("task 1.2")` 確認已勾的不查；dry-run 退出碼 0，不受影響。
  - 綠的案例：粗體加巢狀、空值加巢狀、寫在 task 行上、已勾沒寫，退出碼都是 0。
  - mutation 8 支全部被抓到，見下面「實跑」。
  - SetupHK `system-completion/tasks.md` 的複本（6 條未勾，全用 `**所有權**：` 寫法）沒有任何一條被判缺所有權。
- 原有 25 項沒被改弱：`git diff` 的刪除行只有 `OPEN` fixture 和 `test_25` 的 tasks 字串，兩處都只補了一行 `  - 所有權：`，斷言一條都沒動。

其他契約項目：
- ✅ README 兩份逐字相同（`cmp` 退出碼 0）。task 區塊寫了：所有權必填、依賴選填且寫了就取代波次規則、`無`＝不等、其他子行選填。`gate.env` 的 BASE／GATE_1…連號／GATE_TIMEOUT（900）／SHARE_DIRS／SCHEMA_GLOB 都寫了，退出碼 2／4 與 spec「gate-pr」一致。`reviews/PR-<n>-r<k>.md`、`followups.md` 有寫，`runs.md` 寫明由 `dispatch_state.py` 維護。`MAX_CONCURRENT=3` 那行和說明保留。反引號沒寫明，見 BLOCKER 1。
- ✅ `spec_merge.py` 的 docstring 補了 check 的所有權規則。
- ✅ `cc-gate.md` 寫回格式多了縮排的 `所有權：` 行，本文沒有日期。沒寫反引號，見 BLOCKER 2。
- ✅ 所有權：`git diff --name-only base...head` 共 5 個檔，都在 1.3 的所有權清單裡。
- ✅ 共同約束：5 個改動檔沒有 `/Users/`、`/home/`；`cc-gate.md` 沒有 `YYYY-MM-DD`；只用 Python 標準庫（`re` 本來就有 import）；沒改任何 sh 腳本。

## 實跑

worktree 設在 scratchpad 的 `wt-rev-3-r1-A`：從 `origin/claude/review-loop-v04` detached 開，`merge --no-ff origin/cursor/review-loop-1-3-tasks-1adc`，退出碼 0，沒有衝突。

| 指令 | 退出碼 |
|---|---|
| `python3 test/spec_merge.test.py` | 0（26 項 OK） |
| `cmp templates/docs/changes/README.md docs/changes/README.md` | 0 |
| BASE-GATE（`check_docs && spec_merge check && spec_merge.test && test_skills && guard-bash`） | 0（CHECK_DOCS OK、SPEC_MERGE CHECK OK、26 項 OK、TEST_SKILLS OK 10 支、guard-bash 21 pass／0 fail） |
| SetupHK `docs/changes` 複本跑新 check | 1，原因是 SetupHK spec.md 有不允許的節；舊版 check 同樣是 1。tasks.md 沒有新增的紅 |
| probe fixture（空值、無反引號、順口提到、ASCII 冒號、fence 內） | 1。只有 ASCII 冒號與 fence 內兩條被判缺；空值、無反引號、順口提到三條都放過 |

mutation（每支都改 `tools/spec_merge.py`，跑 `test/spec_merge.test.py`，再 `git checkout` 還原；最後 `git status` 是乾淨的）：

| mutation | 結果 |
|---|---|
| M1 已勾的也查 | 紅（test_22、test_25、test_26） |
| M2 沒縮排的標記也算 | 紅（test_26） |
| M3 標題不切斷區塊 | 紅（test_26） |
| M4 不認 `**所有權**：` | 紅（test_26） |
| M5 task 行本身的標記不算 | 紅（test_26） |
| M6 縮排行的標記不算 | 紅（test_22、test_25、test_26） |
| M7 整條檢查關掉 | 紅（test_26） |
| M8 行號差 1 | 紅（test_26） |
