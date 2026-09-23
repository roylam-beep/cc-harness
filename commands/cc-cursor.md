---
description: 安全地派一個 Cursor cloud agent——先問一次、開 agent、看守丟背景、立刻結束該輪，跑完被叫醒再回報。給 agent id 就是追問同一個 agent。它是原語，不懂 spec 層；要照工單派多個用 /cc-dispatch
argument-hint: "<prompt> [--repo <url>] [--model <id>] [--no-pr]｜<bc-agentId> <追問>"
allowed-tools: Bash(git remote:*), Bash(git rev-parse:*), Bash(node:*), Bash(ls:*), Bash(sed:*), Read, mcp__cursor-cloud__cursor_create_agent, mcp__cursor-cloud__cursor_create_run, mcp__cursor-cloud__cursor_watch_command, mcp__cursor-cloud__cursor_get_run, mcp__cursor-cloud__cursor_list_repositories, mcp__cursor-cloud__cursor_list_models
---

派一個 Cursor cloud agent。$ARGUMENTS

一次呼叫只開**一個** agent。要併行就多呼叫幾次；要照 `tasks.md` 派整波用 `/cc-dispatch`。
本 skill **不寫任何 repo 檔案**。

## 為什麼要有這支

派 agent 本身一個工具就夠，會出事的是後面：站在前景等（Bash 10 分鐘就砍、MCP 呼叫 2 分鐘就被丟背景），
或 prompt 漏了 repo。這支把「派完就走、跑完再回來」寫死。

## 步驟

1. **解析參數。** 第一個 token 是 `bc-` 開頭 → 追問模式（第 4 步走 `cursor_create_run`）。
   否則整段是 prompt；`--repo` 沒給就 `git remote get-url origin` 轉成 `https://github.com/<owner>/<repo>`；
   `--model` 沒給就不帶（Cursor 預設）；`--no-pr` 沒給就 `autoCreatePR: true`。
   repo 不在 `cursor_list_repositories` 裡就停，回報「Cursor 沒接這個 repo」。
2. **問一次再花錢。** 印一行：`要開 1 個 agent｜repo <url>｜model <id 或預設>｜PR <是/否>`，
   **等使用者回一句同意**。沒同意不呼叫任何寫入工具。追問模式也要問（同樣花額度）。
3. **開。** `cursor_create_agent({ prompt, repos: [url], name: <prompt 前 60 字>, autoCreatePR, model?, startingRef: "main" })`。
   回傳要有 `agent.id` 與 `run.id`；沒有就把錯誤原樣回報，停。
4. **追問模式**改成 `cursor_create_run({ agentId, prompt })`，拿新的 `run.id`。
5. **看守丟背景。** `cursor_watch_command({ agentId, runId, label: <prompt 前 40 字> })` 拿到指令，
   用 Bash **`run_in_background: true`** 執行。**不呼叫 `cursor_stream_run`，不 sleep，不定時查。**
6. **結束這一輪。** 回報三行：agent id、run id、「跑完會叫我」。

## 被叫醒時

背景任務結束會帶著 7 行摘要回來。讀該 `.runs/<runId>.md` 的 `--- git ---` 區塊（stdout 的 `git:` 行截斷 300 字，別靠它），
回報**一行**：`<狀態>｜PR <網址或「無」>｜transcript <路徑>`。exit 1（失敗）就多附 `said:` 那句；
exit 2（放棄）就給 `cursor_get_run` 的查詢指令，不自動重派。

## 死法

`python3 tools/skill-usage.py --days 60` 本支少於 3 次，而同期 `/Users/roy-mac/Documents/cursor-api/.runs/` 有新檔
＝使用者仍在手動派，這層包裝沒人要，退役。
