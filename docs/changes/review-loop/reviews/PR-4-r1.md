VERDICT: merge

驗收員：視角 A（契約）。PR #4 `review-loop 1.4: cc-cursor 起點分支與冪等 agentId`，head `cursor/review-loop-1-4-cc-cursor-agentid-823d` → base `claude/review-loop-v04`。在臨時 worktree 把 head 合進 base 最新版（`bfb3fc3`）後實跑。

## BLOCKERS

無。

## FOLLOWUPS

1. 自動測試沒有斷言這 8 條 Scenario 的 THEN。`test/test_skills.py` 只查通用項目（frontmatter、日期、`## 防什麼`、`$ARGUMENTS`）；`grep -c` 只要本文任何地方有這三個字串就綠。mutation 實測：把 `argument-hint` 的三個新參數刪掉，或把 `cursor_get_agent` 從 `allowed-tools` 拿掉，test_skills 仍 exit 0，grep 仍印 7。建議之後加一個輕量的文字契約測試：argument-hint 要含 `--base`／`--name`／`--agent-id`；本文用到的 `cursor_*` 都要列在 allowed-tools；確認行要含「起點分支」。這不擋合併，因為 tasks.md 1.4 指定的「驗：」本來就只有這幾項。
2. 追問遇到 409 `agent_busy` 時，第 6 步回報的 run id 是上一輪的 `latestRunId`，新追問其實還沒送出。第 6 步沒有規定要註明「追問排隊中」。之後 `/cc-review`（2.3）若拿這個 run id 去記 k+1，簿記可能會錯。建議第 6 步在這種情況多印一行「追問已排隊，未送出」。[需確認] 要看 2.3 怎麼接。
3. 第 3 步寫「實測：建立常回 404 `Background composer not found`」。MCP 工具 schema 可以佐證 409 `agent_id_conflict` 和 `latestRunId`，但 404 那句本輪無法重現（不可連線花額度）。README 規矩 3 要求欄位語意要實測，請發包者確認有實測紀錄。[需確認]
4. tasks.md 1.4 寫「不要把 MCP 工具名寫進規則句以外的地方」。新文字在步驟裡多處直接寫 `cursor_get_agent`。舊版本文本來就大量使用工具名，spec Scenario 也點名 `cursor_get_agent`，所以不算違規。R3 移植到 `tools/cursor.mjs` 時要一併替換。[需確認] 這句的原意範圍。
5. 第 3 步只在有 `latestRunId` 時才判定「已建立」；spec 寫的是「存在就當作已建立」。如果 agent 存在但還沒有 `latestRunId`，流程會重送同一個 id，拿到 409 後再查一次，查不到就停。這樣不會多開一個 agent，只是比較保守。可以考慮補一句說明這種情況。

## 逐條 Scenario

以下判定是：agent 照 `commands/cc-cursor.md` 本文做，能不能得到 spec 的 THEN。本檔是純文字指令，沒有可以直接執行的測試；自動化只守通用項目（見 FOLLOWUP 1）。

1. ✅ 派工前先確認：第 2 步寫明直接呼叫時印 `要開 1 個 agent｜repo｜model｜起點分支 <ref>｜名稱｜PR`，並寫「同意前不呼叫 `cursor_create_agent`」。看不出呼叫方的情況也照直接呼叫處理，也會問。
2. ✅ 開完就走：第 3 步要求回傳 `agent.id`／`run.id` 才往下；第 5 步用 `cursor_watch_command` 取得指令，以 `run_in_background: true` 執行，並寫「不呼叫 `cursor_stream_run`，不 sleep，不定時查」；第 6 步結束這一輪。
3. ✅ 被叫醒時回報：這一輪已結束時讀 `.runs/<runId>.md` 的 `--- git ---`，回報一行 `<狀態>｜PR <網址或「無」>｜transcript <路徑>`。另外補上 exit 1 但 run 仍在跑時，用同一組 id 重新背景監看；exit 2 不重派。
4. ✅ 追問同一個 agent：第 1 步先抽掉旗標，剩下的第一個 token 是 `bc-` 就是追問；第 4 步走 `cursor_create_run`，接第 5、6 步。`--agent-id` 不會被誤判成追問（本文寫「追問只認剩下內容的第一個 token」）。409 `agent_busy` 時不開新 agent、不立刻重送，等上一輪結束再送。
5. ✅ 發包指令呼叫時不再問：第 2 步第一點寫明呼叫方是 `/cc-dispatch` 或 cc-review，而且已取得這一波同意時，跳過確認直接開或追問。
6. ✅ 指定起點分支：第 1 步寫 `--base` → `startingRef`，沒給用 `main`；第 3 步欄位清單帶 `startingRef`；追問不帶。欄位名與 MCP schema `startingRef` 一致。
7. ✅ 名稱與 label：`--name` 整段同時用在 `name` 和看守 label；沒給時 name 取 prompt 前 60 字、label 取前 40 字；第 5 步 label「用第 1 步決定的那段」。
8. ✅ 冪等 agentId：`--agent-id` 原樣傳 `agentId`。404 或逾時先 `cursor_get_agent` 查同一個 id，有 `latestRunId` 就監看；沒有才用同一個 id 重送一次，不送第三次、不換 id。409 `agent_id_conflict` 視為已建立，查 `latestRunId` 後監看，不開第二個。MCP schema 佐證：`agentId` pattern `^bc-[0-9a-f-]{36}$`，說明文字寫「Re-POSTing the same id returns 409 agent_id_conflict」；`cursor_get_agent` 說明寫「including its status, repository and latestRunId」。

其他檢查：
- frontmatter：`argument-hint` 含 `--base`／`--name`／`--agent-id`；本文有 `$ARGUMENTS`；`allowed-tools` 新增 `mcp__cursor-cloud__cursor_get_agent`；本文沒用 `cursor_list_agents`，所以不必列。
- `## 防什麼` 逐字補上「重試時多開一個 agent、全部 agent 同名認不出誰是誰」。
- 無 `YYYY-MM-DD` 日期、無 `/Users/` 絕對路徑（grep exit 1＝沒找到）。
- R3 對照：本文寫欄位名 `startingRef`／`name`／`agentId`，與計畫「同名欄位，移植時照搬」一致。
- 所有權：`git diff --name-only base...head` 只有 `commands/cc-cursor.md`，等於 1.4 的所有權。
- 共同約束的腳本相關條目（sh -n、`sed -i`、`readlink -f`、`timeout`）不適用：本 PR 沒有腳本。

## 實跑

| 指令 | 退出碼 / 輸出 |
|---|---|
| `git merge --no-ff origin/cursor/review-loop-1-4-cc-cursor-agentid-823d`（在 base worktree） | 0，無衝突 |
| `git diff --name-only origin/claude/review-loop-v04...origin/cursor/...823d` | `commands/cc-cursor.md` |
| `python3 test/test_skills.py` | 0，TEST_SKILLS OK（10 支 × 7 類） |
| `grep -c -e '--base' -e '--name' -e '--agent-id' commands/cc-cursor.md` | 0，印 7 |
| `python3 tools/check_docs.py .` | 0，CHECK_DOCS OK |
| `python3 tools/spec_merge.py check .` | 0，SPEC_MERGE CHECK OK |
| `python3 test/spec_merge.test.py` | 0，25 項 OK |
| `node test/guard-bash.test.mjs` | 0 |
| `grep -nE '[0-9]{4}-[0-9]{2}-[0-9]{2}|/Users/' commands/cc-cursor.md` | 1（沒找到） |

Mutation（在 worktree 暫改 `commands/cc-cursor.md`，每次跑完都 `git checkout` 還原，最後 cmp 確認與原檔一致）：

| Mutation | test_skills 退出碼 | 結論 |
|---|---|---|
| M1 刪掉本文 `$ARGUMENTS` | 1（「有 argument-hint 但本文沒用 $ARGUMENTS」） | 抓得到 |
| M2 把 `## 防什麼` 改名 | 1（「沒有 `## 防什麼` 段」） | 抓得到 |
| M3 第 6 步插入日期 | 1（「L51 出現日期」） | 抓得到 |
| M4 插入不存在的 `~/.claude/nope-xyz` 路徑 | 0 | 抓不到（該檢查的觸發樣式有限；與本 PR 無關） |
| M5 從 argument-hint 刪掉三個新參數 | 0；grep -c 仍為 7 | 抓不到 → FOLLOWUP 1 |
| M6 從 allowed-tools 刪掉 `cursor_get_agent` | 0 | 抓不到 → FOLLOWUP 1 |
