VERDICT: merge

PR #3（review-loop 1.3：tasks 所有權檢查與新格式說明），第 1 輪，視角 B（對抗）。
被測物：`origin/claude/review-loop-v04`（f47ac10）試合併 `origin/cursor/review-loop-1-3-tasks-1adc`（007f859），合併無衝突。
改動檔 5 支，全部在 1.3 所有權內：`tools/spec_merge.py`、`test/spec_merge.test.py`、`templates/docs/changes/README.md`、`docs/changes/README.md`、`commands/cc-gate.md`。

## BLOCKERS

（無）

## FOLLOWUPS

1. [需確認] 跟 1.1 的區塊定義要對齊。`tools/spec_merge.py` 認 task 行本身的 `｜所有權：`，區塊遇到任何 `#`～`######` 標題就停（和 spec 一致）。但 tasks.md 1.1 契約寫的是「task 行**之後**、下一條 task 或 `##` 標題之前的縮排行」，README L36 也寫「直到下一條 task 或 `##` 標題」。會出現兩種落差：(a) 只把所有權寫在 task 行上：check 綠，但 `dispatch_state.py next` 若沒解析 task 行本身，就會永遠卡在 `WAIT N.M 缺所有權`；(b) 區塊裡有 `### 小標` 時，check 紅，dispatch_state 卻讀得到。建議 1.1 的解析器也吃 task 行上的 inline 所有權、遇任何標題就停；README L36 的 `##` 改成「標題」。
2. [需確認] `- 所有權：` 值是空的、底下也沒有子項時，check 仍判綠（案例「empty value no children」rc=0）。spec 的字面只要求有這個標記，所以不算違規；但 dispatch_state 讀到的會是空集合，所有權重疊偵測形同失效。建議 check 要求冒號後面，或更深一層的子項，至少有一個反引號路徑。
3. 誤判綠：任何縮排行裡只要出現「所有權：」子字串就算，例如 `  - 契約：不要動所有權：以外的檔`（rc=0）。可以限縮成子行開頭是 `- 所有權：`／`- **所有權**：`，或 task 行上的 `｜所有權：`。
4. code fence 邊界：task 區塊裡如果有 fence，fence 內沒縮排的 `# comment` 會被當成標題，把區塊切斷，後面的所有權就不算（案例 rc=1，誤紅）。fence 裡的範例 task 行（`- [ ] 9.9 …`）也會被當成真 task 查所有權。這是既有 `tasks_stats` 本來就有的「不跳過 fence」行為的延伸；目前 cc-gate 寫回的格式不會把 fence 寫進 tasks.md，所以沒有實害。
5. 半形冒號 `所有權:`／`**所有權**:`／`所有權 ：` 一律不認（rc=1）。我判定**不該認**：spec 的字面就是全形 `所有權：`，而且 1.1 的解析器應該用同一套規則，放寬只會讓兩邊走針。但錯誤訊息可以加一句提示：偵測到半形冒號時，印「改成全形『：』」，省得使用者猜。
6. README 的 gate.env 節漏了 spec 裡的三項：「PR 模式下沒有 `gh` → 退出碼 2」、`--head` 模式、`KEEP_WT=1`。這三項是 1.2 的行為，README 可以補一句。
7. 既有問題，不是本 PR 造成的：tasks.md 不是 UTF-8 時，`read()` 直接丟 `UnicodeDecodeError` traceback（rc=1）。退出碼語意上應該是 2，或印一行錯誤。

## 逐條 Scenario

spec.md MODIFIED「spec_merge check 快閘」：

- ✅ Requirement 沒情境：由既有測試守（26 項全綠，沒有被刪掉或改寬的斷言；diff 裡被刪的只有兩個 fixture 字串，都改成補上 `所有權：`）。
- ✅ task 行格式錯：由既有測試守；對抗案例「巢狀 `- [ ] 1.1.1`」「子項 `[spec](spec.md)`」照舊印 `L3：task 行格式錯`。
- ✅ 沒鋪就綠：由既有測試守；`run_check` 沒有動到這條路徑。
- ✅ 超量只警告：`test_25` 的 fixture 補上所有權後仍斷言 rc=0＋三種警告；pre-commit 實測全勾時只印 ⚠️、rc=0。
- ✅ 未勾 task 缺所有權：`test_26`。實跑 mutation 8 種，其中 7 種讓測試轉紅：拿掉縮排判斷、拿掉標題截斷、拿掉粗體寫法、拿掉 task 行 inline、已勾也查、拿掉 task 截斷、整個關掉。沒被抓到的只有「接受半形冒號」，那不在 spec 內，見 FOLLOWUP 5。錯誤行格式是 `docs/changes/<slug>/tasks.md L<行>：task <N.M> 缺所有權…`，有行號也有 N.M。

對抗案例（`advB/run.py`，臨時 repo＋合法 delta spec.md）：

| 案例 | rc | 判定 |
|---|---|---|
| task 行 inline `｜所有權：` | 0 | ✅ 認 |
| `  - 所有權：` 子行 | 0 | ✅ 認 |
| `  - **所有權**：` 空值＋更深一層子項（SetupHK 寫法） | 0 | ✅ 認 |
| `**所有權：**`（冒號在粗體內） | 0 | ✅ 認 |
| 所有權寫在下一條 task 底下 | 1，L2 1.1 缺 | ✅ 不算給上一條 |
| 所有權寫在 `##`／`###` 標題之後 | 1，L2 1.1 缺 | ✅ 不算 |
| tab 縮排 | 0 | ✅ |
| 全形空白縮排 | 0 | ✅（`isspace` 認得） |
| CRLF（1.1 有、1.2 沒有） | 1，只報 L4 1.2 | ✅ 行號正確 |
| 只有 CR | 0 | ✅ |
| BOM 開頭 | 0 | ✅ |
| 已勾（`[x]`／`[X]`）缺所有權 | 0 | ✅ 不紅 |
| 沒縮排的 `所有權：` | 1 | ✅ 照 spec「縮排行」 |
| 空行之後才接縮排的所有權 | 0 | ✅ |
| 半形 `所有權:`／`**所有權**:`／`所有權 ：` | 1 | 不認，見 FOLLOWUP 5 |
| 區塊內 fence 有沒縮排的 `# comment` | 1 | 誤紅，見 FOLLOWUP 4 |
| fence 內的範例 task `9.9` | 1 | 當成真 task，見 FOLLOWUP 4 |
| 空值、沒有子項 | 0 | 見 FOLLOWUP 2 |
| 只在散文裡提到「所有權：」 | 0 | 見 FOLLOWUP 3 |
| 同一個 N.M 出現兩次、兩條都缺 | 1，L2、L3 各一行 | ✅ 不去重，逐行報 |
| 空的 tasks.md | 1（沒有任何 task） | ✅ 既有行為 |
| 路徑含空白 | 1，正確報 L2 | ✅ |
| 非 UTF-8 | 1（traceback） | 既有，見 FOLLOWUP 7 |

真實資料：SetupHK `docs/changes/system-completion/tasks.md`（321 行、26 條 task，未勾 6 條：4.1、6.1–6.5），加 `runs.md`，複製進臨時 repo 的 `docs/changes/x/`，配一份合法 delta spec.md（SetupHK 原本的 spec.md 不是 delta 格式，放進去會先因為「不允許的節」紅，跟本 PR 無關）。
- 原樣：rc=0，一條都沒紅。6 條未勾全部有 `**所有權**：`，其中 6.4 是「空值＋巢狀子項」寫法，被正確認出。已勾的 5.1 沒有所有權，也沒被報。所以不是漏抓，SetupHK 本來就沒有缺所有權的 task。
- 刪掉 6.2 的所有權行（L295）：rc=1，報 `L294：task 6.2 缺所有權`。
- 刪掉 6.1 的所有權行並轉成 CRLF：rc=1，報 `L286：task 6.1 缺所有權`。
- base 版 spec_merge.py 對原樣也是 rc=0，沒有引入回歸。

本 repo：`python3 tools/spec_merge.py check .` rc=0，`docs/changes/review-loop/tasks.md` 在新檢查下是綠的。只有 spec.md 字數的既有警告。

pre-commit（`templates/hooks/pre-commit`，本 PR 沒改）：在含空白路徑的臨時 git repo 裝上這支 hook，並把 `scripts/spec_merge.py` 換成本 PR 的版本，commit 用 `-c user.*`，沒動全域設定。
- 未勾 task 缺所有權：commit 被擋，rc=1。
- 補上 `所有權：`：commit 成功，rc=0。
- 全部已勾：只警告，commit 成功，rc=0。

共同約束：
- `commands/cc-gate.md` 沒有 `YYYY-MM-DD` 日期、沒有 `/Users/` 路徑，`test_skills.py` 綠。
- 兩份 README `cmp` 逐字相同。
- 「派工」節保留了 `MAX_CONCURRENT=3`。
- README 沒有寫某個 repo 的實例。
- 腳本只用標準庫。

副作用：只讀 tasks.md，不寫任何檔。失敗時只印報告。

## 實跑

| 指令 | 退出碼 |
|---|---|
| `git fetch -q origin claude/review-loop-v04 cursor/review-loop-1-3-tasks-1adc` | 0 |
| `git worktree add --detach <wt> origin/claude/review-loop-v04`＋`git -c user.email=rev@local -c user.name=rev merge --no-ff` | 0 |
| `python3 test/spec_merge.test.py`（26 項 OK） | 0 |
| `cmp templates/docs/changes/README.md docs/changes/README.md` | 0 |
| `python3 tools/check_docs.py .` | 0 |
| `python3 tools/spec_merge.py check .` | 0 |
| `python3 test/test_skills.py`（10 支） | 0 |
| `node test/guard-bash.test.mjs`（21 項） | 0 |
| mutation 8 種 × `python3 test/spec_merge.test.py` | 7 種 rc=1（被抓），半形那種 rc=0 |
| 對抗案例 32 個（見上表） | 見上表 |
| SetupHK tasks.md 原樣／刪 6.2／刪 6.1＋CRLF | 0／1／1 |
| base 版 spec_merge.py 對 SetupHK 原樣 | 0 |
| pre-commit：缺所有權／補上／全勾 | 1／0／0 |
| `sh test/run-all.sh` | 1，只紅在 `PLUGIN_SYNC`：本機裝的是 0.3.4 快取，比對的是安裝狀態；gate.env 註明這項不列入閘，跟本 PR 無關 |

所有指令都包了 `perl -e 'alarm N; exec @ARGV'`。mutation 做完，`tools/spec_merge.py` 已還原：`cmp` 相同，`git status` 乾淨。臨時 worktree 與臨時目錄在結束時移除並 prune。
