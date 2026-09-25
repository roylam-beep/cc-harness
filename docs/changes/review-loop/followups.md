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
