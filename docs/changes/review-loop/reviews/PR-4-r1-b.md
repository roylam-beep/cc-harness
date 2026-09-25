VERDICT: fix-needed

PR #4（review-loop 1.4，`cursor/review-loop-1-4-cc-cursor-agentid-823d` → `claude/review-loop-v04`），第 1 輪，視角 B（對抗）。

## BLOCKERS

1. `commands/cc-cursor.md:21` 旗標位置沒限定，契約 prompt 裡的旗標字樣會被抽走。
   - 怎麼重現：`/cc-dispatch` 的契約 prompt 要逐字帶 tasks.md 那一行（spec「契約 prompt」）。本工單 1.4（tasks.md:64）與 2.2（tasks.md:94）那一行本身就有 `--base`、`--name`、`--agent-id`，1.4 的「驗：」還有 `grep -c -e '--base' -e '--name' -e '--agent-id'`。照第 21 行「先抽掉旗標與它的值」字面執行，會把 `'--base'` 後面的 `-e` 當成 startingRef、`'--name'` 後面的 `-e` 當成 name，而且和 2.2 真的附上的 `--base <BASE>` 重複，文件沒說哪個算數。結果是 startingRef／name 靜默變錯，prompt 也被挖掉幾段。
   - 要改成：旗標只認 `$ARGUMENTS` 開頭連續的那幾個，遇到第一個不是已知旗標的 token 就停，之後全部原樣當內容（也可以另外支援 `--` 當分隔）。明寫哪些旗標要吃值（`--repo`／`--base`／`--name`／`--agent-id`／`--model`），哪個不吃值（`--no-pr`）。同一個旗標出現兩次就停下來回報，不要自己選一個。追問模式的 `bc-` 判定照樣看旗標後面的第一個 token。

2. `commands/cc-cursor.md:33-35` 沒有寫明「呼叫方已取得同意」怎麼判定，使用者直接呼叫也可能被跳過確認，違反 Scenario「派工前先確認」（安全面：沒問就花額度）。
   - 怎麼重現：PR body 的交接要 2.2「在上下文寫明這一波已同意」。最自然的寫法是放進傳給 `/cc-cursor` 的參數，可是使用者直接打的 `/cc-cursor` 也走同一個 `$ARGUMENTS`。使用者重派失敗 task 時，常會直接貼上當初那行 `/cc-cursor --agent-id … <含「已取得這一波同意」的 prompt>`；或是同一個 session 稍早跑過 `/cc-dispatch`，上下文已經有「這一波已同意」。照第 35 行的反面讀，「呼叫方有寫已經同意」就跳過確認，結果使用者直接呼叫卻沒被問。
   - 要改成：寫死判定。只有在這一輪 `/cc-dispatch` 或 `/cc-review` 流程裡，由 agent 自己用 Skill 工具呼叫，而且同一個 session 看得到使用者對那一波的同意回覆，才跳過確認。只要是使用者訊息本身打的 `/cc-cursor`，一律要問。`$ARGUMENTS` 或 prompt 內文裡的「已同意」字樣都不算同意。

## FOLLOWUPS

- `commands/cc-cursor.md:26` MCP schema 規定 `agentId` 符合 `^bc-[0-9a-f-]{36}$`，只接受小寫。macOS `uuidgen` 產生的是大寫，大寫會卡在 schema 驗證，回的錯誤不是 404／409，不會進冪等流程。建議寫明「小寫 uuid，不符合就在確認前停下來回報」，並在交接提醒 2.2 產生時轉小寫。
- `commands/cc-cursor.md:40-43` 帶了 `agentId`、卻遇到 404／409／逾時以外的錯誤（400、401、5xx），或 `cursor_get_agent` 本身逾時，都沒有規則。建議補一句「其他錯誤一律原樣回報，停，不重送」。
- `commands/cc-cursor.md:43` 沒帶 `agentId` 時遇到 404，會「原樣回報，停」。但實測 404 時 agent 常常已經建立，這樣會留下一個沒人監看的 agent，使用者重試又多開一個。建議沒帶就由 cc-cursor 自己產生一個小寫 `bc-<uuid>`，每次都走冪等。[需確認] spec 沒要求。
- `commands/cc-cursor.md:46,61` 遇到 `agent_busy` 時，第 6 步回報的 run id 是上一輪的；被叫醒時也先回報上一輪那一行，再送排隊的追問。`/cc-review` 可能把上一輪結束誤當成 fix 輪結束，拿舊的 head 跑閘；`/cc-dispatch` 也可能把舊 runId 記進 runs.md。建議兩處回報都標明「上一輪（busy 等待），追問尚未送出」。[需確認] 要等 2.3 寫好才看得出實際影響。
- `commands/cc-cursor.md:57`「exit 1 而且 run 還在跑就重新監看」沒有次數上限。看守一直 exit 1 時會無限重接。建議加上限，例如 3 次，超過就照 exit 2 處理。
- `commands/cc-cursor.md:33` 寫的是 `cc-review`，沒有斜線，spec 是 `/cc-review`。等 2.3 合併後改回來（PR 已在交接點名）。
- `--name` 值的引號只提到半形引號；遇到全形「」、或值裡本身有引號時怎麼辦沒寫。可以跟 BLOCKER 1 一起寫清楚。
- tasks.md 1.4 的「驗：」只用 `grep -c` 數字串，沒有驗到任何 Scenario 的行為（這條驗收指令是工單本身的設計，不是這個 PR 造成的）。

## 逐條 Scenario

| Scenario | 判 | 證據 |
|---|---|---|
| 派工前先確認 | ❌ | 第 34 行的確認行有 1 個 agent、repo、model、起點分支。但同意判定可以被參數內文觸發（BLOCKER 2）。 |
| 開完就走 | ✅ | 第 48 行 `run_in_background: true`，不呼叫 `cursor_stream_run`；第 51 行結束這一輪。 |
| 被叫醒時回報 | ✅ | 第 58 行讀 `--- git ---`，回報一行：狀態、PR 或「無」、transcript。 |
| 追問同一個 agent | ✅（有條件） | 第 21、45 行走 `cursor_create_run`。前提是旗標解析正確（BLOCKER 1）。 |
| 發包指令呼叫時不再問 | ✅（有條件） | 第 33 行有寫，但判定寫得不夠明確（BLOCKER 2）。 |
| 指定起點分支 | ❌ | 第 24 行 `--base` 對到 `startingRef`，沒帶用 `main`。但契約 prompt 內文有 `--base` 字樣時會被誤抽（BLOCKER 1）。 |
| 名稱與 label | ❌ | 第 25、49 行 name 與 label 同一段，沒帶取前 60／40 字。同 BLOCKER 1，`--name` 可能被內文誤抽。 |
| 冪等 agentId | ✅ | 第 41-42 行：404／逾時先 `cursor_get_agent`，有 latestRunId 就監看，沒有才用同一個 id 重送；409 不開第二個；不換 id、不送第三次。實測 `cursor_get_agent`（本 PR 的 agent）回傳確實有 `latestRunId` 欄位，status `IDLE`。 |

四種情境走一遍：
1. 使用者直接呼叫、帶 prompt 與 `--base`：正常會先問。但 prompt 內文有旗標字樣或「已同意」字樣時會出錯（BLOCKER 1、2）。
2. `/cc-dispatch` 帶三個旗標、create 回 404 但其實已建立：`get_agent` 查到 latestRunId → 監看，不會重開 ✅。前提是 id 是小寫（FOLLOWUP 1）。
3. create 逾時、`get_agent` 回 404：用同一個 id 重送一次；第二次回 409 → 查 → 監看；兩次都失敗就停 ✅。
4. `bc-` 開頭追問、回 409 `agent_busy`：不開新 agent，先監看上一輪，等它結束再送 ✅。但回報的 run id 容易讓呼叫方誤讀（FOLLOWUP 4）。

與 `commands/cc-dispatch.md` 現行本文：第 4 步「cc-cursor 那句確認視為已同意、不再問」跟本 PR 的跳過條件一致，沒有衝突。現行 cc-dispatch 不帶 `--base`，預設 `main`，行為跟 PR 之前一樣。

## 實跑

在臨時 worktree（`origin/claude/review-loop-v04` 加 `--no-ff` 合併 PR head，merge rc=0，diff 只有 `commands/cc-cursor.md`，在所有權內）：

- `python3 test/test_skills.py` → 0（TEST_SKILLS OK，10 支 × 7 類）
- `grep -c -e '--base' -e '--name' -e '--agent-id' commands/cc-cursor.md` → 印 7，rc 0
- `python3 tools/check_docs.py .` → 0
- `python3 tools/spec_merge.py check .` → 0
- `python3 test/spec_merge.test.py` → 0（25 項）
- `node test/guard-bash.test.mjs` → 0
- `grep -n -e '--base' -e '--name' -e '--agent-id' docs/changes/review-loop/tasks.md` → 第 64、69、94 行命中（BLOCKER 1 的證據）
- SetupHK `docs/changes/system-completion/tasks.md`（只讀）：第 320 行有 `--noEmit`，另一種會混進契約 prompt 的旗標形字樣
- MCP `cursor_get_agent bc-6c22450d-…`（唯讀）→ 有 `latestRunId`；`cursor_create_agent` schema 的 agentId pattern `^bc-[0-9a-f-]{36}$`
