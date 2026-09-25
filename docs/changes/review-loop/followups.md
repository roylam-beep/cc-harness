# review-loop followups（不擋合併的待修；收尾波次從這裡取）

| 來源 | 一行 |
|---|---|
| PR #3 r1 | `commands/cc-gate.md:18` 說 diff 只能碰 `docs/plans/**`，`:48` 又要寫進 `docs/changes/<slug>/tasks.md`，兩句矛盾（既有，非 1.3 造成） |
| PR #3 r1 | `tools/spec_merge.py` 讀到非 UTF-8 的 `tasks.md` 丟 traceback（rc=1），應退出碼 2 並印一行（既有） |
| PR #3 r1 | `docs/changes/README.md` 的 gate.env 節沒提 `--head` 模式、`KEEP_WT=1`、PR 模式缺 `gh` 退出碼 2（屬 gate-pr.sh 行為，1.2 合併後補） |
| PR #4 r1b | `commands/cc-cursor.md:26` MCP schema 規定 `agentId` 符合 `^bc-[0-9a-f-]{36}$`，只接受小寫。macOS `uuidgen` 產生的是大寫，大寫會卡在 schema 驗證，回的錯誤不是 404／409，不會進冪等流程。建議寫明「小寫 uuid，不符合就在確認前停下來回報」，並在交接提醒 2.2 產生時轉小寫。 |
| PR #4 r1b | `commands/cc-cursor.md:40-43` 帶了 `agentId`、卻遇到 404／409／逾時以外的錯誤（400、401、5xx），或 `cursor_get_agent` 本身逾時，都沒有規則。建議補一句「其他錯誤一律原樣回報，停，不重送」。 |
| PR #4 r1b | `commands/cc-cursor.md:43` 沒帶 `agentId` 時遇到 404，會「原樣回報，停」。但實測 404 時 agent 常常已經建立，這樣會留下一個沒人監看的 agent，使用者重試又多開一個。建議沒帶就由 cc-cursor 自己產生一個小寫 `bc-<uuid>`，每次都走冪等。[需確認] spec 沒要求。 |
| PR #4 r1b | `commands/cc-cursor.md:46,61` 遇到 `agent_busy` 時，第 6 步回報的 run id 是上一輪的；被叫醒時也先回報上一輪那一行，再送排隊的追問。`/cc-review` 可能把上一輪結束誤當成 fix 輪結束，拿舊的 head 跑閘；`/cc-dispatch` 也可能把舊 runId 記進 runs.md。建議兩處回報都標明「上一輪（busy 等待），追問尚未送出」。[需確認] 要等 2.3 寫好才看得出實際影響。 |
| PR #4 r1b | `commands/cc-cursor.md:57`「exit 1 而且 run 還在跑就重新監看」沒有次數上限。看守一直 exit 1 時會無限重接。建議加上限，例如 3 次，超過就照 exit 2 處理。 |
| PR #4 r1b | `commands/cc-cursor.md:33` 寫的是 `cc-review`，沒有斜線，spec 是 `/cc-review`。等 2.3 合併後改回來（PR 已在交接點名）。 |
| PR #4 r1b | `--name` 值的引號只提到半形引號；遇到全形「」、或值裡本身有引號時怎麼辦沒寫。可以跟 BLOCKER 1 一起寫清楚。 |
| PR #4 r1b | tasks.md 1.4 的「驗：」只用 `grep -c` 數字串，沒有驗到任何 Scenario 的行為（這條驗收指令是工單本身的設計，不是這個 PR 造成的）。 |
| PR #4 r1a | 自動測試沒有斷言這 8 條 Scenario 的 THEN。`test/test_skills.py` 只查通用項目（frontmatter、日期、`## 防什麼`、`$ARGUMENTS`）；`grep -c` 只要本文任何地方有這三個字串就綠。mutation 實測：把 `argument-hint` 的三個新參數刪掉，或把 `cursor_get_agent` 從 `allowed-tools` 拿掉，test_skills 仍 exit 0，grep 仍印 7。建議之後加一個輕量的文字契約測試：argument-hint 要含 `--base`／`--name`／`--agent-id`；本文用到的 `cursor_*` 都要列在 allowed-tools；確認行要含「起點分支」。這不擋合併，因為 tasks.md 1.4 指定的「驗：」本來就只有這幾項。 |
| PR #4 r1a | 追問遇到 409 `agent_busy` 時，第 6 步回報的 run id 是上一輪的 `latestRunId`，新追問其實還沒送出。第 6 步沒有規定要註明「追問排隊中」。之後 `/cc-review`（2.3）若拿這個 run id 去記 k+1，簿記可能會錯。建議第 6 步在這種情況多印一行「追問已排隊，未送出」。[需確認] 要看 2.3 怎麼接。 |
| PR #4 r1a | 第 3 步寫「實測：建立常回 404 `Background composer not found`」。MCP 工具 schema 可以佐證 409 `agent_id_conflict` 和 `latestRunId`，但 404 那句本輪無法重現（不可連線花額度）。README 規矩 3 要求欄位語意要實測，請發包者確認有實測紀錄。[需確認] |
| PR #4 r1a | tasks.md 1.4 寫「不要把 MCP 工具名寫進規則句以外的地方」。新文字在步驟裡多處直接寫 `cursor_get_agent`。舊版本文本來就大量使用工具名，spec Scenario 也點名 `cursor_get_agent`，所以不算違規。R3 移植到 `tools/cursor.mjs` 時要一併替換。[需確認] 這句的原意範圍。 |
| PR #4 r1a | 第 3 步只在有 `latestRunId` 時才判定「已建立」；spec 寫的是「存在就當作已建立」。如果 agent 存在但還沒有 `latestRunId`，流程會重送同一個 id，拿到 409 後再查一次，查不到就停。這樣不會多開一個 agent，只是比較保守。可以考慮補一句說明這種情況。 |
| PR #4 r2b | `commands/cc-cursor.md:24` 旗標的值剛好是另一個已知旗標時，照字面會把它收成值，解析就跑偏。重現：呼叫方的 name 變數展開成空字串，送出 `--name  --agent-id bc-<uuid> 你在 owner/repo …`。參考解析器的結果是 name=`--agent-id`，內容第一個 token 變成 `bc-<uuid>`，於是誤判成**追問模式**。在發包流程裡不會問使用者，直接對一個還沒建立的 agent 呼叫 `cursor_create_run`，第 4 步也沒寫這種錯誤要怎麼處理。建議改成：值是六個已知旗標之一就當缺值，停下回報「旗標缺值：<名稱>」。 |
| PR #4 r2b | `commands/cc-cursor.md:36` 追問模式開頭如果帶了 `--base`、`--no-pr`、`--model`、`--repo`，現在都靜默丟掉（重現：`--base claude/x --no-pr bc-<uuid> 追問` → 追問模式，兩個旗標都沒作用，也沒回報）。本文只寫了 `--base`「不帶 startingRef」，其他三個沒寫。建議二選一寫死：只建立時才有效的旗標出現在追問模式就停下回報，或是在確認行標明「已忽略」。 |
| PR #4 r2b | `commands/cc-cursor.md:3` 的 `argument-hint` 追問形式寫的是 `<bc-agentId> <追問>`，但本文第 36 行允許開頭先帶 `--name`（當 label）和 `--agent-id`。建議改成 `[--name <文字>] <bc-agentId> <追問>`，讓 hint 和本文一致。 |
| PR #4 r2b | 內容是空的時候沒有規則。`--agent-id bc-<uuid>` 後面什麼都沒有，會走建立、prompt 是空的；只有 `bc-<uuid>` 時，會送一個空的追問。建議內容空白就停下回報，不建立、不追問。 |
| PR #4 r2b | `commands/cc-cursor.md:38-42` 跳過確認的第 3 個條件是「同一個 session 看得到使用者對那一波的同意回覆」。`/cc-review` 的 fix 迴圈如果在另一個 session 跑，或 context 壓縮後看不到原文，每次追問都會問使用者。這個方向是安全的，但和 spec「一波只問一次」那條的「之後的追問（/cc-review 的 fix 迴圈）不再問」有落差。[需確認] 等 2.3 定案後再決定：`/cc-review` 是要自己取得使用者同意，還是由 spec 放寬。 |
| PR #4 r2b | `commands/cc-cursor.md:69` 追問在 `agent_busy` 時會排隊，被叫醒後才把它送出。本文沒寫這時要不要再問一次。第 2 步寫的是「追問同樣要問」，照字面執行的 agent 可能會重問。建議明寫：排隊的追問在第 2 步已經問過，送出時不再問。 |
| PR #4 r2b | 全形引號不會當成引號處理：`--name 「review-loop 2.2」 你在 repo` 的結果是 name=`「review-loop`，prompt 從 `2.2」` 開始，而且沒有回報。本文只寫了半形引號，所以不算違規；但使用者直接打的時候很容易發生。建議遇到全形引號開頭的值就停下提示。（第 1 輪已提過，這輪仍未處理。） |
| PR #4 r2b | `--` 後面的內容開頭如果是 `bc-`，仍然會變成追問模式（`-- bc-<uuid> 本意是 prompt` → 追問）。本文照字面讀是一致的，但 `--` 沒辦法強制走建立。影響很小，要不要寫一句說明可以之後再定。 |
| PR #4 r2b | 第 1 輪還沒處理的 FOLLOWUP 仍然有效：大寫 uuid 會過不了 schema；被叫醒時 exit 1 又重新看守沒有次數上限；第 6 步在 busy 時回報的是上一輪的 run id；自動化測試沒有斷言任何一條 Scenario 的 THEN。 |
| PR #4 r2a | [需確認] `commands/cc-cursor.md:41` 要求「同一個 session 看得到使用者同意」。如果 `/cc-review` 的 fix 迴圈在另一個 session 跑（例如交接之後），每次追問都會被問，和 spec「一波只問一次」裡「之後的追問（/cc-review 的 fix 迴圈）不再問」有落差。這是第 1 輪刻意選的保守做法，要嘛在 2.3 或 spec 寫明「跨 session 會再問一次」，要嘛定一個能驗證的同意紀錄（例如 runs.md 的欄位）。 |
| PR #4 r2a | MCP `cursor_create_agent` 的 `agentId` pattern 是 `^bc-[0-9a-f-]{36}$`（只收小寫）。`cc-cursor.md:32` 只寫「`bc-` 接 uuid」；macOS `uuidgen` 產出的是大寫，2.2 產生 id 時要轉小寫。建議在 32 行補「小寫」。 |
| PR #4 r2a | 追問模式遇到 `--base`／`--repo`／`--model`／`--no-pr` 時，是忽略還是停下沒寫（36 行只寫了不帶 `startingRef`）；35 行「repo 不在 list 就停」在追問模式要不要做也沒寫。 |
| PR #4 r2a | 「引號沒成對也停下回報」放在吃值旗標那一條底下，語意應該只查旗標值；建議明寫「內容裡的引號不檢查」，免得 prompt 有 `don't` 這種單引號被誤擋。 |
| PR #4 r2a | 測試缺口（既有，非本 PR 造成）：`test/test_skills.py` 與 `tools/check_docs.py` 都不擋 `/Users/<帳號>` 路徑（mutation 塞進去兩者都綠）；本 PR 的 8 個 Scenario 都是本文規則，沒有可執行測試能斷言（task 的「驗：」本來就只要求 test_skills＋grep）。 |
