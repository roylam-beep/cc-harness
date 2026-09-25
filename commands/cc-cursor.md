---
description: 安全地派一個 Cursor cloud agent——直接呼叫先問一次，發包指令已取得這一波同意就不再問；開一個 agent、看守丟背景、立刻結束該輪，跑完被叫醒再回報。第一個參數是 agent id 就是追問同一個。它是原語，不懂 spec 層；要照工單派多個用 /cc-dispatch
argument-hint: "<prompt> [--repo <url>] [--base <ref>] [--name <文字>] [--agent-id <bc-uuid>] [--model <id>] [--no-pr]｜<bc-agentId> <追問>"
allowed-tools: Bash(git remote:*), Bash(git rev-parse:*), Bash(node:*), Bash(ls:*), Bash(sed:*), Read, mcp__cursor-cloud__cursor_create_agent, mcp__cursor-cloud__cursor_create_run, mcp__cursor-cloud__cursor_watch_command, mcp__cursor-cloud__cursor_get_run, mcp__cursor-cloud__cursor_get_agent, mcp__cursor-cloud__cursor_list_repositories, mcp__cursor-cloud__cursor_list_models
---

派一個 Cursor cloud agent。$ARGUMENTS

一次呼叫只開**一個** agent。要併行就多呼叫幾次；要照 `tasks.md` 派整波用 `/cc-dispatch`。
本 skill **不寫任何 repo 檔案**。

參數對欄位：`--base` → `startingRef`，`--name` → `name`，`--agent-id` → `agentId`。

## 為什麼要有這支

派 agent 本身一個工具就夠，會出事的是後面：站在前景等（Bash 10 分鐘就砍、MCP 呼叫 2 分鐘就被丟背景），
或 prompt 漏了 repo。這支把「派完就走、跑完再回來」寫死。

## 步驟

1. **解析參數。** 先抽掉旗標與它的值，剩下的才是內容。剩下的第一個 token 是 `bc-` 開頭 → 追問模式（第 4 步）。
   否則剩下整段是 prompt。
   - `--repo <url>`：沒給就 `git remote get-url origin` 轉成 `https://github.com/<owner>/<repo>`。
   - `--base <ref>`：欄位 `startingRef` 用它；沒給用 `main`。
   - `--name <文字>`：欄位 `name` 用整段（含空白，引號包住）。看守的 label 用同一段。沒給時 name 取 prompt 前 60 字、label 取 prompt 前 40 字。
   - `--agent-id <bc-uuid>`：欄位 `agentId` 原樣傳，格式是 `bc-` 接 uuid。這是建立時的冪等鍵，仍走第 3 步。追問只認剩下內容的第一個 token。
   - `--model <id>`：沒給就不帶。
   - `--no-pr`：沒給就 `autoCreatePR: true`。
   repo 不在 `cursor_list_repositories` 裡就停，回報「Cursor 沒接這個 repo」。
   追問模式不帶 `startingRef`（起點在建立時已經定了）。`--name` 有給就當這次看守的 label，沒給用追問前 40 字。

2. **問一次再花錢。**
   - 呼叫方是 `/cc-dispatch` 或 cc-review（驗收那支），而且它已經取得這一波的同意：跳過確認，直接開 agent 或追問。
   - 使用者直接呼叫：印一行 `要開 1 個 agent｜repo <url>｜model <id 或預設>｜起點分支 <ref>｜名稱 <文字>｜PR <是/否>`，**等使用者回一句同意**。同意前不呼叫 `cursor_create_agent`。追問同樣要問（同樣花額度），印 `要追問 1 個 agent｜<id>`。
   看不出呼叫方，或呼叫方沒寫已經同意：照直接呼叫問。

3. **開。** `cursor_create_agent` 的欄位帶 `prompt`、`repos: [url]`、`name`、`autoCreatePR`、有給才帶 `model`、`startingRef`、有 `--agent-id` 才帶 `agentId`。
   建立還收欄位 `skipReviewerRequest`；本指令沒有對應旗標，不要自己補。
   回傳要有 `agent.id` 與 `run.id`，有就用這組去第 5 步。
   帶了 `agentId` 才做下面的冪等。實測：重送同一個 id 回 409 `agent_id_conflict`；建立常回 404 `Background composer not found`，agent 其實已經在；`cursor_get_agent` 回傳的物件有 `latestRunId`。
   - **404 或呼叫逾時**：先 `cursor_get_agent` 查同一個 id。有 `latestRunId` 就當作已建立，拿它去第 5 步。沒有才用**同一個** `agentId` 再送一次。第二次拿到 `agent.id` 與 `run.id` 就去第 5 步；第二次若是 409，照下一條。第二次若又是 404 或逾時，再查一次；有 `latestRunId` 就去第 5 步，沒有就原樣回報，停。不要送第三次，不要換一個新 id。
   - **409 `agent_id_conflict`**：這顆已經在。不要開第二個，不要重送。`cursor_get_agent` 同一個 id，拿 `latestRunId` 去第 5 步。查不到就原樣回報，停。
   沒帶 `agentId` 的錯誤：原樣回報，停。

4. **追問模式**改走 `cursor_create_run({ agentId, prompt })`，拿新的 `run.id` 去第 5 步。
   回 409 `agent_busy`：上一輪還沒結束。不要開新 agent，不要立刻重送。對 `cursor_get_agent` 的 `latestRunId` 做第 5 步，這次追問留到那一輪結束再送（「被叫醒時」）。

5. **看守丟背景。** `cursor_watch_command({ agentId, runId, label })` 拿到指令，用 Bash **`run_in_background: true`** 執行。**不呼叫 `cursor_stream_run`，不 sleep，不定時查。**
   `runId` 用 `run.id`，或冪等查回的 `latestRunId`。`label` 用第 1 步決定的那段。

6. **結束這一輪。** 回報三行：agent id、run id、「跑完會叫我」。

## 被叫醒時

背景任務結束會帶著 7 行摘要回來。

- **exit 1，而且 run 還在跑**（`cursor_get_run` 顯示這一輪尚未結束）：用同一組 agentId／runId 再取一次 `cursor_watch_command`，丟背景。不重派、不追問、不換 id。
- **這一輪已結束**（exit 0，或 exit 1 且 run 已結束）：讀 `.runs/<runId>.md` 的 `--- git ---` 區塊（stdout 的 `git:` 行截斷 300 字，別靠它），回報**一行**：`<狀態>｜PR <網址或「無」>｜transcript <路徑>`。exit 1 且 run 已結束，多附 `said:` 那句。
- **exit 2（放棄）**：給 `cursor_get_run` 的查詢指令，不自動重派。

這一輪若是在等 `agent_busy`：前一輪已結束就先回報上面那一行，再把排隊的追問送出（第 4 步），然後丟新的看守。

## 防什麼

派完 agent 站在前景等被砍（Bash 10 分鐘、MCP 2 分鐘），或 prompt 漏了 repo、沒問就花額度。
重試時多開一個 agent、全部 agent 同名認不出誰是誰。
