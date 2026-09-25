VERDICT: merge

PR #3（review-loop 1.3：tasks 所有權檢查與新格式說明），第 2 輪，視角 A（契約）。
被測物：`origin/claude/review-loop-v04`（`9f14084`）試合併 `origin/cursor/review-loop-1-3-tasks-1adc`（`3b03d09`），合併無衝突。
改動檔 5 支，跟 1.3 的所有權完全一致：`tools/spec_merge.py`、`test/spec_merge.test.py`、`templates/docs/changes/README.md`、`docs/changes/README.md`、`commands/cc-gate.md`。

## BLOCKERS

（無）

第 1 輪退回的項目逐條確認：
- (1) 兩份 README：範例改成 ``- 所有權：`<路徑>`、`<路徑>` ``，說明寫明「路徑用反引號包，多個用 `、` 分隔；冒號後空著時，在更深一層的 `- ` 子項列反引號路徑」。`cmp` 兩份相同。✅
- (2) `commands/cc-gate.md:52-56`：寫回格式改成 ``  - 所有權：`<缺陷所在檔>` ``，也補了「路徑用反引號包」。✅
- (3) `tools/spec_merge.py` 收緊了四點：至少一個反引號路徑、只認行首標記（`｜所有權：`，或 `- 所有權：`／`- **所有權**：` 開頭的子行）、空值看更深一層子項、半形冒號會提示改全形。四點都有測試，mutation 也會變紅（M1、M2、M3、M5、M6）。✅
- (4) README 補了「`tasks.md` 的 code fence 內不要放 `- [` 開頭的行」。✅

## FOLLOWUPS

1. `test/spec_merge.test.py` test_27 的 `bad` fixture 缺一個案例：`  - 所有權：` 空值，後面接同層的兄弟子行，而且兄弟子行帶反引號路徑（例如 `  - 契約：\`src/a.py\``），這種要紅。實測把 `nested_has_backtick_path` 的 `if ind <= parent_indent: break` 拿掉（M8），27 項仍全綠，所以 spec 裡「更深一層」這個限制目前沒有測試守著。現在的實作行為正確（探測結果是紅），只是缺案例。
2. `test/spec_merge.test.py` test_26 `1.9 標記沒縮排` 的 fixture 是 `所有權：\`src/c.py\``，前面沒有 `- `。`OWN_SUB` 本來就不會匹配它，所以這個案例沒有驗到 `ownership_found` 裡 `if not line[:1].isspace(): continue` 那道縮排檢查。拿掉那道檢查（M9），27 項仍綠。建議改成 `- 所有權：\`src/c.py\``（沒縮排、有 dash），才真的測得到。1.1 只收縮排行，這道檢查拿掉，兩邊就會走針。
3. [需確認] task 行上的 `｜所有權：` 如果是空值（`｜所有權： ｜驗：…`），底下任何一個帶反引號的 `- ` 子行都會被當成所有權，例如 `  - 契約：\`a.py\`` 就算。照 spec 字面這樣是對的，1.1 的契約也一樣收，但語意很怪：dispatch_state 會把契約裡提到的檔當成所有權。建議行內空值只認 `- \`路徑\`` 這種純路徑子項，或在 README 註明行內不要留空值。
4. 延續第 1 輪 B 視角第 4 條：code fence 裡頂格的 `# comment` 還是會被當成標題，把區塊切斷，後面的所有權就不算（探測結果：誤紅）。README 只提醒 fence 裡不要放 `- [`，沒提 `#`。可以補一句「fence 內不要有頂格 `#` 行」，或讓解析跳過 fence。
5. [需確認] `commands/cc-gate.md`：缺陷如果不落在單一檔（例如流程或跨檔的問題），格式沒說 `所有權：` 要填什麼。填不出來，寫回的 commit 就會被 pre-commit 擋下。建議寫一句退路，例如填最相關的檔或 `docs/changes/<slug>/tasks.md`。
6. 既有問題，不是本 PR 造成的：`commands/cc-gate.md:18` 寫「diff 只能碰 `docs/plans/**`」，跟寫回 `docs/changes/<slug>/tasks.md` 矛盾（第 1 輪 A 的 FOLLOWUP 2）。

## 逐條 Scenario（spec.md MODIFIED「spec_merge check 快閘」，整合分支最新版）

- ✅ Requirement 沒情境：原本的測試沒改（diff 裡被刪的只有 `OPEN` 與 test_25 的 fixture 行，都是補上所有權），27 項全綠。
- ✅ task 行格式錯：原本的測試沒改，全綠。`TASK_OK` 只多了一個捕獲群組，沒改判定。
- ✅ 沒鋪就綠：原本的測試沒改，全綠。
- ✅ 超量只警告：test_25 補了所有權之後，仍斷言 rc=0，以及「進行中 5 > 3」「全勾但未歸檔」「沒寫「驗：」」三個字串。
- ✅ 未勾 task 缺所有權：
  - test_26 紅案例：沒標記（L2 1.1）、標題切斷（L6 1.5）、已勾不查（`assertNotIn task 1.2`），斷言訊息含 `L<n>：task N.M 缺所有權`，rc=1。綠案例：粗體＋巢狀、空值＋巢狀、行內 `｜所有權：`、已勾沒寫，rc=0。
  - test_27 紅案例：順口出現、空值沒子項、沒包反引號、行上沒有直槓、冒號在粗體內，rc=1，而且不含全形提示。半形案例（子行、行內、粗體）三條都斷言完整訊息含「；改成全形「：」」；`###` 小標切斷那條斷言訊息不含提示；已勾的半形不查。綠案例：多路徑、行內空值＋子項、粗體同行，rc=0。
  - 另外用 SetupHK `docs/changes/system-completion/tasks.md` 的**複本**跑：6 條未勾 task 全被認得，沒有任何「缺所有權」（spec.md 的節名錯誤是那個 repo 原本就有的問題，跟本檢查無關）。
  - 自己寫的探測（直接呼叫 `open_tasks_missing_ownership`）：空值後接同層兄弟子行 → 紅 ✅；沒縮排的 `- 所有權：` → 紅 ✅；tab 縮排、CRLF、中間有空行、巢狀之前有空行 → 綠 ✅；空反引號 ``` `` ``` → 紅 ✅；縮排的子 checkbox 被當成下一條 task → 紅 ✅。

Mutation（每次暫時改 worktree 裡的 `tools/spec_merge.py`，跑完就從備份還原；最後 `git status` 乾淨，27 項綠）：

| # | 弄壞什麼 | 結果 |
|---|---|---|
| M1 | 有標記就算，不要求反引號 | 紅（test_27） |
| M2 | 子行標記改成任意位置 search | 紅（test_27） |
| M3 | 空值直接算有 | 紅（test_27） |
| M4 | 標題不切斷區塊 | 紅（test_26、test_27） |
| M5 | 拿掉半形提示 | 紅（test_27） |
| M6 | 半形冒號也認 | 紅（test_27） |
| M7 | 已勾的也查 | 紅（test_22、25、26、27） |
| M8 | 巢狀不限更深一層 | **綠**（見 FOLLOWUP 1） |
| M9 | 沒縮排的行也當子行 | **綠**（見 FOLLOWUP 2） |
| M10 | 不認行內 `｜所有權：` | 紅（test_26、test_27） |

共同約束：
- `commands/cc-gate.md` 沒有 `YYYY-MM-DD` 日期；5 支改動檔都沒有 `/Users/` 絕對路徑。
- `tools/spec_merge.py` 的檔頭有用法、退出碼、新規則的說明，「防什麼」沿用原本的 docstring 結構。只用 `re`（標準庫）。
- 沒有新增 sh 腳本，不涉及 `sed -i`、`readlink -f`、`timeout`。

## 實跑

| 指令 | 退出碼 |
|---|---|
| `git fetch`、`git worktree add --detach`、`git merge --no-ff origin/cursor/review-loop-1-3-tasks-1adc` | 0 |
| `git diff --name-only origin/claude/review-loop-v04...origin/cursor/review-loop-1-3-tasks-1adc`（5 支，全部在所有權內） | 0 |
| 「驗：」整句＋BASE-GATE：`python3 test/spec_merge.test.py && cmp templates/docs/changes/README.md docs/changes/README.md && python3 tools/check_docs.py . && python3 tools/spec_merge.py check . && python3 test/spec_merge.test.py && python3 test/test_skills.py && node test/guard-bash.test.mjs`（外面包 `perl alarm 300`） | 0 |
| `python3 test/spec_merge.test.py` → `SPEC_MERGE_TEST OK（27 項）` | 0 |
| `python3 tools/spec_merge.py check .` → `SPEC_MERGE CHECK OK`（本 repo 的 review-loop tasks.md 在新檢查下是綠的） | 0 |
| `python3 test/test_skills.py` → `TEST_SKILLS OK（10 支）` | 0 |
| `node test/guard-bash.test.mjs` → pass 21／fail 0 | 0 |
| SetupHK tasks.md 複本跑 `spec_merge.py check .`：沒有任何「缺所有權」；rc=1 來自既有 spec.md 的節名 | 1（跟本檢查無關） |
| mutation 腳本 M1–M10（見上表） | 見上表 |
