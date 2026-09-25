VERDICT: merge

PR #3（review-loop 1.3）第 2 輪獨立驗收，視角 B（對抗）。受測樹＝`origin/claude/review-loop-v04`（9f14084）＋ `--no-ff` 合入 `origin/cursor/review-loop-1-3-tasks-1adc`（3b03d09），合併無衝突。

## BLOCKERS

（無）

## FOLLOWUPS

1. 測試缺口：「空值時只看**更深一層**子項」沒有會紅的案例。把 `tools/spec_merge.py` 的 `nested_has_backtick_path` 裡 `if ind <= parent_indent: break` 改成永不 break，27 項照樣全綠。建議在 `test/spec_merge.test.py` 的 test_27 `bad` 補一條：`  - 所有權：` 後面接同層的 `  - \`src/x.py\``，斷言這條 task 缺所有權。實作本身是對的，對抗案例實跑是紅。
2. 測試缺口：「更深一層子項要是 `- ` 開頭」沒有會紅的案例。把 `re.match(r"^-\s+", content) and` 拿掉，27 項照樣全綠。建議補：`  - 所有權：` 後面接 `    \`src/x.py\``（段落，不是 `- `），斷言紅。實作實跑是紅。
3. 測試註解跟 fixture 對不上：test_26 註解寫「未縮排的『所有權：』…不算」，但 fixture L4 是 `所有權：\`src/c.py\``，沒有 `- `，本來就不符合 OWN_SUB，驗不到縮排要求。把 `if not line[:1].isspace(): continue` 改成 `if False:`，27 項照樣全綠。建議改成 col 0 的 `- 所有權：\`src/c.py\``，才驗得到「子行要縮排」。
4. [需確認] 1.1（PR #5）與 1.3 在文字層已經對齊：第 1 輪 B 的 followup 已處理。tasks.md 1.1 現在寫「task 行上的 `｜所有權：`」「任何 `#` 開頭的標題」，README 也從 `##` 改成「標題」。但**實作層**還有 6 處邊界不一致，實跑對照見下方「實跑」第 6 項。兩邊都不會靜默出錯：不是 check 紅，就是 `WAIT 缺所有權`，但會兩邊打架。建議在 PR #5 修，或抽成共用函式：
   - (a) PR #5 遇到 col 0 的非空行就結束區塊，1.3 不會。spec 寫的是「到下一條 task 或任何 `#` 開頭的標題為止」，比較接近 1.3 的做法。
   - (b) PR #5 的 `is_heading` 是 `lstrip().startswith("#")`，所以 `#tag` 和縮排的 `  # 註解` 都會切斷區塊；1.3 只認 col 0 的 `#{1,6}\s`。
   - (c) tab 寬度：PR #5 算 1、1.3 算 4。`\t- 所有權：` 後面接兩個空白的 `  - \`a\``，1.3 判紅、PR #5 認得 `a`。
   - (d) PR #5 只取**第一個**所有權子行，後面的就不看了。`- 所有權：無` 後面再一行 `- 所有權：\`a\``，1.3 判綠、PR #5 判缺。
   - (e) task 行上有 `｜所有權：\`a\``，底下又有 `- 所有權：無`：1.3 判綠，PR #5 判缺。
   - (f) task 行上 `｜所有權：` 留空，底下子行是 `- 依賴：\`1.2\``：1.3 當成所有權判綠，PR #5 排除依賴行後判缺。
5. [需確認] task 行上 `｜所有權：` 留空時，1.3 會把區塊裡**任何** `- ` 子項的反引號都當所有權。例如 `  - PR 標題：\`y\`` 就算數，判綠。這合 spec 字面（「看它更深一層 `- ` 子項」），但語意上太寬。建議 spec 明訂：留空的巢狀寫法只給 `- 所有權：` 子行用，task 行上的 `｜所有權：` 不能留空。
6. code fence 沒有特別處理。兩種情況：
   - col 0 的 fence 裡有 `# 註解`，會被當成標題切斷區塊，後面的 `- 所有權：` 就不算。這是假紅。
   - 縮排 fence 裡的 `- 所有權：\`a\`` 會算數。這是假綠。
   README 只警告 fence 裡不要放 `- [`。建議 README 補一句「task 區塊內不要放 code fence」，或讓 check 跳過 fence 內容。
7. 看到 BOM（`﻿`）開頭時，check 仍判綠，這條不影響。只是記錄：`read()` 沒去掉 BOM。如果第一行就是 task，TASK_OK 會對不上（原本就有，不是這個 PR 引入的）。

## 逐條 Scenario

（spec.md MODIFIED「spec_merge check 快閘」，以整合分支最新版為準）

- ✅ Requirement 沒情境：既有測試照舊綠（27 項，含原本 25 項，沒有斷言被刪或放寬）。這次的 diff 只替 `OPEN` 與 test_25 的 fixture 補了所有權子行，符合 1.3 契約「既有 fixture 缺所有權的要補上」。
- ✅ task 行格式錯：既有測試照舊綠。所有權解析用 TASK_ANY 當區塊終點，格式錯的 `- [` 行照舊由 `tasks_stats` 報錯。
- ✅ 沒鋪就綠：既有測試照舊綠。
- ✅ 超量只警告：test_25 補了所有權之後仍斷言 `進行中 5 > 3`、`全勾但未歸檔`、`沒寫「驗：」`，退出碼 0。
- ✅ 未勾 task 缺所有權：test_26、test_27，另有對抗 harness 35 個案例（期望值明確的 27 個全部符合）。重點實跑結果：
  - task 行上 `｜所有權：tools/a.py`（沒有反引號）→ rc=1，`L2：task 1.1 缺所有權`
  - `- 所有權：` 空值，更深一層 `- \`a\`` → rc=0；中間隔空行也是 rc=0
  - 空值，更深一層子項沒有反引號 → rc=1
  - 空值，後面接同層子項 → rc=1；空值，先接較淺的行、再接更深的 → rc=1
  - `  - 契約：不要動所有權：以外的檔 \`a\`` → rc=1（不算）
  - `- 所有權: \`a\``（半形）→ rc=1，訊息帶「；改成全形「：」」；換成 CRLF 也一樣
  - `### 小標` 之後才寫所有權 → rc=1（不算給上一條）；`#tag`（不是標題）不切斷區塊 → rc=0
  - CRLF 版本的子行、空值巢狀 → rc=0；tab 縮排、tab 巢狀、全形空白縮排 → rc=0
  - 已勾（`[x]`／`[X]`）缺所有權 → rc=0；已勾而且寫半形 → 不查
  - `* 所有權：`、空反引號 ``` `` ```、`所有權：無`、段落反引號、所有權寫在 task 行之前 → 全部 rc=1
  - 反引號路徑含空白、同一行重複兩次、半形與全形並存 → rc=0
  - 訊息格式符合 spec：「指出行號與 N.M」＝ `docs/changes/<slug>/tasks.md L<n>：task N.M 缺所有權（…）`
- ✅ SetupHK 真實資料：把 `docs/changes/system-completion/tasks.md` 複製到臨時 repo，搭配一份最小 spec.md。SetupHK 的 spec.md 不是 delta 格式，拿來跑本來就會紅，跟這個 PR 無關。
  - 原樣 → rc=0，6 條未勾（4.1、6.1～6.5）都認得。4.1 寫的是「新增 \`…\`」，前面有字但有反引號，算數。
  - 把 20 條已勾全部改成未勾 → rc=1，只紅 3.1、5.1。對照原文，這兩條只有 `**可改 schema。**`／`**要做**：`，確實沒有所有權：紅的兩條都是真的缺。CRLF 版、tab 縮排版結果相同。
  - 刪掉全部 `**所有權**` 子行 → 26 條全紅。全部改成半形 → 24 條帶全形提示，3.1、5.1 沒有提示（它們本來就沒有所有權行），結果正確。
- ✅ README（兩份 `cmp` 相同）：task 區塊的 `所有權：` 必填、`依賴：` 選填（`無`＝不等，寫了就取代波次規則）；`gate.env` 各鍵的說明與 spec「gate-pr」一致（退出碼 2／4、`GATE_TIMEOUT` 預設 900、`cp -cR` 退路 `cp -R`）；`reviews/PR-<n>-r<k>.md`、`followups.md`、`runs.md` 由 `dispatch_state.py` 維護；`MAX_CONCURRENT=3` 那一行與說明都保留；沒有寫任何 repo 的實例。
- ✅ `commands/cc-gate.md`：寫回的 `## 0.` 缺陷 task 多了縮排的 ``所有權：`<缺陷所在檔>` `` 子行，照這個格式寫能通過新的檢查。`test_skills` 通過（沒有日期、有 `## 防什麼`）。
- ✅ 所有權：PR 只改了 5 個檔（`tools/spec_merge.py`、`test/spec_merge.test.py`、兩份 README、`commands/cc-gate.md`），都在 1.3 的所有權範圍內。
- ✅ 介面：`check` 退出碼（0／1／2）與既有輸出行首（`SPEC_MERGE CHECK OK/FAIL`、`⚠️`）都沒變。新增的只是 FAIL 清單裡的一行。

## 實跑

1. `git fetch`、`git worktree add --detach … origin/claude/review-loop-v04`、`git -c user.email=rev@local -c user.name=rev merge -q --no-ff --no-edit origin/cursor/review-loop-1-3-tasks-1adc` → rc=0
2. 驗收指令與 BASE-GATE（每條都包 `perl -e 'alarm 300; exec @ARGV'`）：
   - `python3 test/spec_merge.test.py` → rc=0，`SPEC_MERGE_TEST OK（27 項）`
   - `cmp templates/docs/changes/README.md docs/changes/README.md` → rc=0
   - `python3 tools/check_docs.py .` → rc=0（警告：hook 未安裝，這是 worktree 的環境，跟 PR 無關）
   - `python3 tools/spec_merge.py check .` → rc=0（本 repo 的 review-loop tasks.md 在新規則下仍綠；spec.md 字數警告原本就有）
   - `python3 test/test_skills.py` → rc=0（10 支）
   - `node test/guard-bash.test.mjs` → rc=0
3. 對抗 harness `scratchpad/adv3b/adv.py`：35 個案例，每個案例都開一個臨時 root 跑 `spec_merge.py check .`。有明確期望值的 27 個，MISMATCH 0；另外 8 個是探測用，結果寫在 FOLLOWUPS 4～7。
4. SetupHK 真實資料：原樣、全部改未勾、CRLF、tab、刪掉所有權、改半形，共 6 種跑法，結果見上方。跑完 `cmp` 確認臨時副本已還原；SetupHK repo 本身只讀、沒寫入。
5. Mutation，在自己的 worktree 裡做，每次跑完都從備份還原，最後 `cmp` 相同：
   - 標題不切區塊 → FAIL 2
   - 不要求反引號 → FAIL 1
   - 拿掉半形提示 → FAIL 1
   - 已勾也查 → FAIL 4
   - 子行不限行首 → FAIL 1
   - 行內不要求 `｜` → FAIL 1
   - 空值不看巢狀 → FAIL 2
   - **不要求縮排 → OK（存活）**
   - **巢狀不看層級 → OK（存活）**
   - **巢狀不要求 `- ` → OK（存活）**
   - 3 個存活的 mutation 對應 FOLLOWUPS 1～3。
6. 1.1 對照：用 `gh api …/contents/tools/dispatch_state.py?ref=cursor/review-loop-1-1-dispatch-state-0570` 唯讀取出 PR #5 的 `dispatch_state.py`（沒有 fetch，也沒改 ref），和 `spec_merge.open_tasks_missing_ownership` 用同一組輸入對跑 7 個邊界案例，6 個結果不同。明細見 FOLLOWUPS 4。
7. 副作用：`check` 不寫檔，worktree 的 `git status` 只多出 `tools/__pycache__/`（Python 自己產生的）；沒有動主 repo、使用者的 git 設定或其他程序。
8. 收尾：`git worktree remove --force <wt>`、`git worktree prune`，並刪掉 scratchpad 的 `adv3b/`。
