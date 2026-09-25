VERDICT: merge

PR #4 第 2 輪｜視角 A（契約）｜head `cursor/review-loop-1-4-cc-cursor-agentid-823d`（16a5609）｜base `claude/review-loop-v04`

## BLOCKERS

無。

第 1 輪兩條 BLOCKER 都已修：
1. 旗標解析（`commands/cc-cursor.md:21-28`）：只認 `$ARGUMENTS` 開頭連續的旗標，碰到第一個非已知旗標就停，之後原樣當內容（明寫 `--base`／`--name`／`--agent-id`／`-e` 留在內容裡）；支援 `--` 分隔；吃值的（`--repo`／`--base`／`--name`／`--agent-id`／`--model`）與不吃值的（`--no-pr`）分開寫；值含空白用半形引號、收下時脫一層；同旗標重複停下回報「旗標重複」；缺值停下回報；追問模式在 `bc-` 之後全部是內容、不再認旗標；另補了開頭 `--agent-id` 和 `bc-` id 不同就停。
2. 同意判定（`commands/cc-cursor.md:38-43`）：跳過確認要三件同時成立（這一輪在跑 `/cc-dispatch` 或 cc-review 流程、agent 自己用 Skill 工具叫、同 session 看得到使用者本人對那一波的同意）；使用者直接打的 `/cc-cursor` 一律問；`$ARGUMENTS`／prompt 內「已同意」字樣不算。description 也同步寫了。

## FOLLOWUPS

1. [需確認] `commands/cc-cursor.md:41` 要求「同一個 session 看得到使用者同意」。如果 `/cc-review` 的 fix 迴圈在另一個 session 跑（例如交接之後），每次追問都會被問，和 spec「一波只問一次」裡「之後的追問（/cc-review 的 fix 迴圈）不再問」有落差。這是第 1 輪刻意選的保守做法，要嘛在 2.3 或 spec 寫明「跨 session 會再問一次」，要嘛定一個能驗證的同意紀錄（例如 runs.md 的欄位）。
2. MCP `cursor_create_agent` 的 `agentId` pattern 是 `^bc-[0-9a-f-]{36}$`（只收小寫）。`cc-cursor.md:32` 只寫「`bc-` 接 uuid」；macOS `uuidgen` 產出的是大寫，2.2 產生 id 時要轉小寫。建議在 32 行補「小寫」。
3. 追問模式遇到 `--base`／`--repo`／`--model`／`--no-pr` 時，是忽略還是停下沒寫（36 行只寫了不帶 `startingRef`）；35 行「repo 不在 list 就停」在追問模式要不要做也沒寫。
4. 「引號沒成對也停下回報」放在吃值旗標那一條底下，語意應該只查旗標值；建議明寫「內容裡的引號不檢查」，免得 prompt 有 `don't` 這種單引號被誤擋。
5. 測試缺口（既有，非本 PR 造成）：`test/test_skills.py` 與 `tools/check_docs.py` 都不擋 `/Users/<帳號>` 路徑（mutation 塞進去兩者都綠）；本 PR 的 8 個 Scenario 都是本文規則，沒有可執行測試能斷言（task 的「驗：」本來就只要求 test_skills＋grep）。

## 逐條 Scenario

MODIFIED「cc-cursor 安全派一個 agent」。本 task 是純 markdown 指令，沒有可執行測試能斷言 THEN；以下證據是本文段落＋和 cursor-cloud MCP schema 的欄位對照。

1. ✅ 派工前先確認：步驟 2（38-43 行）印 `要開 1 個 agent｜repo｜model｜起點分支｜名稱｜PR`，「同意前不呼叫 `cursor_create_agent`」；使用者直接打一律問。步驟 1 只呼叫唯讀的 `cursor_list_repositories`。
2. ✅ 開完就走：步驟 5（56-57 行）`cursor_watch_command` 加 `run_in_background: true`，「不呼叫 `cursor_stream_run`」；步驟 6 結束這一輪。allowed-tools 沒有 `cursor_stream_run`。
3. ✅ 被叫醒時回報：66 行讀 `.runs/<runId>.md` 的 `--- git ---`，一行 `<狀態>｜PR <網址或「無」>｜transcript <路徑>`。另外補了「exit 1 但 run 還在跑就重掛看守」，沒和 Scenario 衝突。
4. ✅ 追問同一個 agent：27 行判 `bc-`，步驟 4 走 `cursor_create_run`，其餘步驟相同（2 問、5 看守、6 結束）；409 `agent_busy` 不開新 agent。
5. ✅ 發包指令呼叫時不再問：38-42 行三件同時成立才跳過，跳過後直接進 3／4。
6. ✅ 指定起點分支：30 行 `--base` → `startingRef`，沒給用 `main`；步驟 3 帶 `startingRef`。MCP schema 有 `startingRef`。
7. ✅ 名稱與 label：31 行 `--name` 同時給 `name` 和看守 label，沒給就 name 取前 60 字、label 取前 40 字；57 行 label 用第 1 步的決定。MCP schema 有 `name`。
8. ✅ 冪等 agentId：32、45、48-51 行。原樣傳 `agentId`；404／逾時先 `cursor_get_agent`，有 `latestRunId` 就監看它，沒有才用同一個 id 重送（最多兩次、不換 id）；409 `agent_id_conflict` 視為已建立、不開第二個。allowed-tools 已加 `cursor_get_agent`；MCP schema 有 `agentId`，`cursor_get_agent` 也寫明回傳 `latestRunId`。

旗標 token 走查（第 1 輪重現案例）：`/cc-cursor --agent-id bc-… --base claude/review-loop-v04 --name "review-loop 1.4 x" 契約…grep -c -e '--base' -e '--name'…`。照 21-28 行，前三組是旗標；「契約…」是第一個非旗標 token，解析停在這裡，後面的 `'--base'`、`-e` 都留在 prompt 裡，不會被當成 startingRef／name。✅

共同約束：
- 所有權：`git diff --name-only base...head` 只有 `commands/cc-cursor.md`，等於所有權。✅
- 無日期、無 `/Users/`：`grep -nE '[0-9]{4}-[0-9]{2}-[0-9]{2}|/Users/' commands/cc-cursor.md` 沒命中（exit 1）。✅
- frontmatter：description、argument-hint 都有新參數（含 `--`）、allowed-tools 加了 `cursor_get_agent`；本文有 `$ARGUMENTS`、`## 防什麼` 補了 tasks 要求的那一句。✅
- MCP 工具名只出現在 allowed-tools 和步驟規則句；欄位用「欄位」稱呼。✅
- 沒有新腳本，所以 sh -n、`sed -i`、`readlink -f`、`timeout`、bash 專屬語法都不適用。

## 實跑

worktree：base 加上 `--no-ff` 合進 head，沒有衝突（exit 0）。

| 指令 | 退出碼 | 摘要 |
|---|---|---|
| `python3 test/test_skills.py` | 0 | TEST_SKILLS OK（10 支 × 7 類，已知缺口 0） |
| `grep -c -e '--base' -e '--name' -e '--agent-id' commands/cc-cursor.md` | 0 | 9 |
| BASE-GATE（check_docs、spec_merge check、spec_merge.test、test_skills、guard-bash） | 0 | 全綠，guard-bash fail 0 |
| `git diff --name-only origin/claude/review-loop-v04...origin/cursor/review-loop-1-4-cc-cursor-agentid-823d` | 0 | `commands/cc-cursor.md` |

Mutation（改 worktree 內的 `commands/cc-cursor.md`，每次跑完都還原，最後 `git status` 乾淨）：

| 弄壞什麼 | `test_skills.py` 退出碼 |
|---|---|
| 刪掉 `$ARGUMENTS` | 1（紅，擋得住） |
| `## 防什麼` 改名 | 1（紅） |
| 本文塞日期 | 1（紅） |
| 刪掉 description | 1（紅） |
| 塞不存在的 `/cc-nonexist` 交叉引用 | 1（紅） |
| 塞 `/Users/roy-mac/x` | 0（沒擋到；`check_docs.py` 也是 0）→ FOLLOWUP 5 |
| 步驟 3 改成呼叫 `cursor_stream_run` | 0（行為規則沒有測試守）→ FOLLOWUP 5 |
