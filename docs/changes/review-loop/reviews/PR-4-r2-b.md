VERDICT: merge

PR #4（review-loop 1.4，`cursor/review-loop-1-4-cc-cursor-agentid-823d` → `claude/review-loop-v04`）第 2 輪，視角 B（對抗）。
在臨時 worktree 把 head（`16a5609`）用 `--no-ff` 合進 base 最新版後實跑。第 1 輪的兩條 BLOCKER（旗標解析範圍、同意判定）都已修好；沒有找到新的 BLOCKER。

## BLOCKERS

無。

## FOLLOWUPS

1. `commands/cc-cursor.md:24` 旗標的值剛好是另一個已知旗標時，照字面會把它收成值，解析就跑偏。重現：呼叫方的 name 變數展開成空字串，送出 `--name  --agent-id bc-<uuid> 你在 owner/repo …`。參考解析器的結果是 name=`--agent-id`，內容第一個 token 變成 `bc-<uuid>`，於是誤判成**追問模式**。在發包流程裡不會問使用者，直接對一個還沒建立的 agent 呼叫 `cursor_create_run`，第 4 步也沒寫這種錯誤要怎麼處理。建議改成：值是六個已知旗標之一就當缺值，停下回報「旗標缺值：<名稱>」。
2. `commands/cc-cursor.md:36` 追問模式開頭如果帶了 `--base`、`--no-pr`、`--model`、`--repo`，現在都靜默丟掉（重現：`--base claude/x --no-pr bc-<uuid> 追問` → 追問模式，兩個旗標都沒作用，也沒回報）。本文只寫了 `--base`「不帶 startingRef」，其他三個沒寫。建議二選一寫死：只建立時才有效的旗標出現在追問模式就停下回報，或是在確認行標明「已忽略」。
3. `commands/cc-cursor.md:3` 的 `argument-hint` 追問形式寫的是 `<bc-agentId> <追問>`，但本文第 36 行允許開頭先帶 `--name`（當 label）和 `--agent-id`。建議改成 `[--name <文字>] <bc-agentId> <追問>`，讓 hint 和本文一致。
4. 內容是空的時候沒有規則。`--agent-id bc-<uuid>` 後面什麼都沒有，會走建立、prompt 是空的；只有 `bc-<uuid>` 時，會送一個空的追問。建議內容空白就停下回報，不建立、不追問。
5. `commands/cc-cursor.md:38-42` 跳過確認的第 3 個條件是「同一個 session 看得到使用者對那一波的同意回覆」。`/cc-review` 的 fix 迴圈如果在另一個 session 跑，或 context 壓縮後看不到原文，每次追問都會問使用者。這個方向是安全的，但和 spec「一波只問一次」那條的「之後的追問（/cc-review 的 fix 迴圈）不再問」有落差。[需確認] 等 2.3 定案後再決定：`/cc-review` 是要自己取得使用者同意，還是由 spec 放寬。
6. `commands/cc-cursor.md:69` 追問在 `agent_busy` 時會排隊，被叫醒後才把它送出。本文沒寫這時要不要再問一次。第 2 步寫的是「追問同樣要問」，照字面執行的 agent 可能會重問。建議明寫：排隊的追問在第 2 步已經問過，送出時不再問。
7. 全形引號不會當成引號處理：`--name 「review-loop 2.2」 你在 repo` 的結果是 name=`「review-loop`，prompt 從 `2.2」` 開始，而且沒有回報。本文只寫了半形引號，所以不算違規；但使用者直接打的時候很容易發生。建議遇到全形引號開頭的值就停下提示。（第 1 輪已提過，這輪仍未處理。）
8. `--` 後面的內容開頭如果是 `bc-`，仍然會變成追問模式（`-- bc-<uuid> 本意是 prompt` → 追問）。本文照字面讀是一致的，但 `--` 沒辦法強制走建立。影響很小，要不要寫一句說明可以之後再定。
9. 第 1 輪還沒處理的 FOLLOWUP 仍然有效：大寫 uuid 會過不了 schema；被叫醒時 exit 1 又重新看守沒有次數上限；第 6 步在 busy 時回報的是上一輪的 run id；自動化測試沒有斷言任何一條 Scenario 的 THEN。

## 逐條 Scenario

本檔是給 LLM 照做的純文字指令，沒有可以執行的測試。以下是用「照字面執行」的參考解析器（`scratchpad/rev4r2b-data/parse.py`，已刪），加上逐段讀本文做出的判定。

| Scenario | 判 | 證據 |
|---|---|---|
| 派工前先確認 | ✅ | 第 42 行：使用者直接打一律要問，`$ARGUMENTS` 或內文裡的「已同意」不算同意。案例 (e)：`已同意，直接派 --agent-id …` 的第一個 token 不是旗標，整段當成 prompt，`--agent-id` 沒被抽走；是使用者直接打的，所以要問。第 43 行的確認行有「1 個 agent、repo、model、起點分支、名稱、PR」。 |
| 開完就走 | ✅ | 第 56 行 `run_in_background: true`，不呼叫 `cursor_stream_run`、不 sleep；第 59 行結束這一輪。 |
| 被叫醒時回報 | ✅ | 第 66 行讀 `--- git ---`，回報一行 `<狀態>｜PR <網址或「無」>｜transcript <路徑>`。另外補了 exit 1 但 run 還在跑的分支，用同一組 id 重新看守，和 Scenario 不衝突。 |
| 追問同一個 agent | ✅ | 案例 (d)：`bc-<uuid> --base x 追問內容` → 追問模式，`--base x` 原樣當追問內容，和第 27 行「不再認旗標」一致。第 53 行走 `cursor_create_run`。 |
| 發包指令呼叫時不再問 | ✅ | 案例 (f)：第 38-41 行要三件同時成立：在 `/cc-dispatch` 或 cc-review 流程中、agent 用 Skill 工具呼叫、看得到使用者對那一波的同意。和現行 `commands/cc-dispatch.md:33`「各呼叫一次 `/cc-cursor`（Skill 工具）」一致。跨 session 的情況見 FOLLOWUP 5。 |
| 指定起點分支 | ✅ | 案例 (a)：`--base claude/x --name "review-loop 2.2 cc-dispatch 整合分支" --agent-id bc-<uuid> <含 --base、grep -c -e '--name' 的長 prompt>` → 只抽出前三個旗標，startingRef=`claude/x`，prompt 裡的 `--base`、`-e '--name'`、`--base <BASE>` 全部保留。案例 (b)：`-- --base 是內容` → prompt=`--base 是內容`，startingRef=`main`。案例 (c)：`--base a --base b x` → 停下，回報「旗標重複：--base」。 |
| 名稱與 label | ✅ | 案例 (a) 的 name 是整段 `review-loop 2.2 cc-dispatch 整合分支`；第 31、57 行 label 用同一段；沒給時取 60／40 字。 |
| 冪等 agentId | ✅ | 第 48-51 行：404／逾時先 `cursor_get_agent` 查，有 `latestRunId` 就去看守，沒有才用同一個 id 重送一次，不送第三次、不換 id；409 `agent_id_conflict` 不開第二個。`allowed-tools` 已加 `cursor_get_agent`。 |

新矛盾檢查：
- description、第 2 步、第 42 行的同意規則一致。
- `argument-hint` 的旗標放在 prompt 前面，和「只認開頭」一致；追問形式和第 36 行有一處小落差（FOLLOWUP 3）。
- `## 防什麼` 已補上 tasks.md 指定的那一句。
- 「被叫醒時」新增 busy 排隊分支，和第 4 步一致；重問的問題見 FOLLOWUP 6。
- 介面：舊版 `argument-hint` 是把旗標放在 prompt 後面（`<prompt> [--repo …]`）。我查了現有的呼叫方：`commands/cc-dispatch.md:33` 只傳 `/cc-cursor <契約 prompt>`，契約 prompt 以「你在 <owner/repo>」開頭，沒有帶後置旗標；其他 `commands/*.md` 也沒有帶後置旗標呼叫，所以改成只認開頭不會讓現有呼叫方失效。
- SetupHK `system-completion` 的 tasks.md／runs.md（複製到臨時目錄）：task 行沒有引號或旗標字樣，子行有 `--noEmit`；因為解析停在第一個非旗標 token，這些都留在內容裡。runs.md 裡 32 個 agent id 都是小寫 uuid。

## 實跑

| 指令 | 退出碼 / 摘要 |
|---|---|
| `git worktree add --detach … origin/claude/review-loop-v04` ＋ `git merge --no-ff origin/cursor/…823d` | 0，無衝突 |
| `git diff --name-only HEAD^1 HEAD` | 只有 `commands/cc-cursor.md`（在所有權內） |
| `python3 test/test_skills.py` | 0，TEST_SKILLS OK（10 支 × 7 類） |
| `grep -c -e --base -e --name -e --agent-id commands/cc-cursor.md` | 0，印 9 |
| `python3 tools/check_docs.py .` | 0，CHECK_DOCS OK |
| `python3 tools/spec_merge.py check .` | 0，SPEC_MERGE CHECK OK |
| `python3 test/spec_merge.test.py` | 0，25 項 OK |
| `node test/guard-bash.test.mjs` | 0 |
| `grep -nE '[0-9]{4}-[0-9]{2}-[0-9]{2}\|/Users/' commands/cc-cursor.md` | 1（沒找到＝符合共同約束） |
| `python3 parse.py`（參考解析器跑 a–e 與 x1–x7 共 12 個案例） | 0；結果見上表與 FOLLOWUP 1、2、4、7、8 |

沒有修改被測檔。臨時 worktree 與臨時資料目錄都已移除，並跑過 `git worktree prune`。
