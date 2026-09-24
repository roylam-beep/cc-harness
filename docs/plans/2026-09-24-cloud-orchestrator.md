# cloud 為主力：Claude 編排、Cursor 執行

> 進度：R1 做完（季檢 Routine 延到 R2 cloud 載入 cc-* 實測通過後建）。R2–R4 未開始。

## Context

主力改到 cloud：Claude（cloud session）負責編排與驗收，Cursor cloud agent 負責寫程式。
本 session 在 cloud 實測到的現況：
- 沒有任何 cc-* skill：`claude plugin list` 空，本 repo `.claude/settings.json` 沒宣告 plugin。
- 沒有 `cursor-cloud` MCP（本機是 `node /Users/roy-mac/Documents/cursor-api/src/index.js`，cloud 沒這路徑）。
- `api.cursor.com` 被網路政策擋（proxy 403）。
- cloud 沒有 `gh` CLI，但 `cc-dispatch sync`、`cc-close` 都在用 `gh pr list`。
- container 用完回收 → transcript 消失 → `skill-usage.py` 在 cloud 量不到。

使用者定案：
1. cc-harness **改 public**，走 plugin（不 vendor）。
2. Cursor 通道用 cc-harness **內建零依賴 `tools/cursor.mjs`**。
3. **拆掉 skill 使用量統計**：它只反映「有沒有被叫用」而非「有沒有真的有效」，實績上退役條件從未真正觸發（P3 A/B 未判即作廢）。
   只留兩項反映品質與信任的指標：**常駐字元預算**、**PR 合併／退回與 gate 缺陷數**。退役判斷改成**每季一次 `/cc-audit` 人工檢視**。
4. pstack／Grok 的結論併入 R3：嚴謹步驟寫在 Cursor agent 必讀的契約裡，由 Claude 驗收，不另做 Claude 自跑的 cc-fix。

順序：先減法（R1）再公開（R2）——拆掉的檔不必再掃、不必再移植、不必再寫死法。

## R1 拆掉使用量層（1 輪）

- **拆**：`tools/skill-usage.py`；`hooks/log-harness-event.mjs` 與 `hooks/hooks.json` 的三個記帳 hook
  （UserPromptExpansion／InstructionsLoaded／PreToolUse(Skill)）；`hooks/session-start.sh` 第 1 行（使用量）；
  對應測試（`test/log-harness-event.test.mjs`、`test/test_skills.py` 裡 usage 部分）與 `test/run-all.sh` 的呼叫；
  各 `commands/*.md`「## 死法」節裡的使用次數條件（改寫見下）。
- **留**：`tools/check_docs.py` 第 7 類＋SessionStart 第 2 行（常駐字元）；`cc-close` 的 `changes 歸檔 N｜PR 合併 a／退回 b｜gate 缺陷 c`。
- **改規則**：README 規矩 2「每支帶可算死法」→「進來要寫它防的是哪個失敗」；規矩 3（改名 `ALIASES`）刪除。
  各 command 的「## 死法」節改名「## 防什麼」，一句話寫它防的失敗；`cc-gate` 那條「連續 3 次 pass 降抽查」屬品質指標，保留。
- **季檢排程**：建一個 Routine（`create_trigger`，`create_new_session_on_fire: true`，cron `0 1 1 1,4,7,10 *` UTC），
  每季在 cc-harness 開新 session 跑 `/cc-audit 本 repo 的 harness`，結果只列不改、寫進 `docs/reviews/`。
  依賴 R2（cloud 要先有 cc-*），所以 Routine 在 R2 實測通過後才建。
- `docs/decisions.md` 記定案＋理由；`check_docs.py` 若有檢查死法節的規則同步改；bump `plugin.json` version。
- BACKLOG：1（`--toolcount` 沒測試）→ stale；5（本機孤兒）→ deferred；兩行搬 `docs/archive/ICEBERG.md`。

## R2 公開＋讓 cloud 有 skill（1 輪＋使用者 1 個動作）

1. 公開前掃全歷史（`git log -p --all`）：憑證樣式（`sk-`、`ghp_`、`AKIA`、`-----BEGIN`）、廣告帳號 ID（`act_\d+`、10 碼 customer id）、
   email、`/Users/roy-mac` 絕對路徑、repo／客戶名（`google-meta-ads`、`gh-monthly-report` 等）。
   清單交使用者判定：接受／改寫歷史。**有憑證就先 revoke，不只刪檔。**
2. 使用者在 GitHub 把 `roylam-beep/cc-harness` 改 public（我沒有改 visibility 的工具）。
3. 本 repo `.claude/settings.json` 加 `extraKnownMarketplaces`＋`enabledPlugins`（同 `templates/.claude/settings.json`）。
   注意：cloud 裝的是 remote `main` 版，不是工作分支。
4. 實測（新 cloud session：本 repo＋一個跑過 `/cc-harness` 的 repo）：`/cc-` 出現？SessionStart 印常駐字元那行？`guard-bash` 有攔？
   結果寫 `docs/decisions.md`，BACKLOG 11 → done。通過後建 R1 的季檢 Routine。
5. `README.md`「改了要 bump」表加一列：cloud 每次開 session 從 GitHub 重裝，push 到 `main` 就生效。

## R3 Cursor 通道（1–2 輪＋使用者 2 個設定）

0. **新增 `commands/cc-env.md`（薄、唯讀，`disallowed-tools: Write, Edit, NotebookEdit`）**。防的失敗：session 開到一半才發現派不動 Cursor。
   環境設定（網路、secret、Setup script）只能由使用者在 UI 改，所以本支只檢查＋印修法，不改任何設定。一張表，每項 ✅／❌＋❌ 的修法一行：
   | 項目 | 怎麼驗 |
   |---|---|
   | cc-harness plugin 已載入 | `${CLAUDE_PLUGIN_ROOT}` 有值且 `tools/cursor.mjs` 存在 |
   | `CURSOR_API_KEY` 有設 | `[ -n "$CURSOR_API_KEY" ]`（只判有無，不印值） |
   | Cursor API 連得到 | `node cursor.mjs models` exit 0；proxy 403 → 修法「allowed domains 加 <host>」 |
   | 當前 repo 已接 Cursor | `cursor.mjs repos` 含 `git remote get-url origin` |
   | PR 查詢通道 | `gh` 可用，或 GitHub MCP 工具在場（二擇一即綠） |
   | node ≥ 18 | `node --version`（內建 `fetch` 的前提） |
   | 當前 repo 跑過 `/cc-harness` | `.claude/settings.json` 有 `cc-harness@cc-harness` |
   `/cc-cursor`、`/cc-dispatch` 第 1 步先跑同一組檢查（引用 `cc-env.md`，不複製），任一 ❌ 就停並指向 `/cc-env`。
   不加 SessionStart 檢查：每 session 都付字元成本，而沒要派工的 session 不需要。

1. 使用者在 cloud 環境設定（session 標題列 environment 選單 → Edit）：
   - Network：allowed domains 加 Cursor API host（`api.cursor.com` [需確認：以 cursor-api 原始碼 base URL 為準]）
   - 環境變數：`CURSOR_API_KEY`（不要貼進對話）
2. `add_repo roylam-beep/cursor-api`（read），讀 `src/cursor.js`、`src/index.js`、`scripts/wait-for-run.js`，
   移植成 `tools/cursor.mjs`（零依賴、Node 內建 `fetch`）：`create｜run｜get｜watch｜models｜repos`；
   保留 `startingRef`、`agentId` 冪等、`skipReviewerRequest`（`SPEC.md`「cursor-api 補齊建 agent 欄位」）；
   `watch` 沿用 exit code（0 完成／1 失敗／2 放棄）與 `.runs/<runId>.md` 格式，寫在 `$CLAUDE_PROJECT_DIR/.runs/`，`templates/` 補 `.gitignore`。
3. `commands/cc-cursor.md` 改用 `node "${CLAUDE_PLUGIN_ROOT}/tools/cursor.mjs" …`，`allowed-tools` 改 `Bash(node:*)`，拿掉 `mcp__cursor-cloud__*`。
   看守用 `run_in_background: true`，**另排 `send_later` 60 分鐘兜底**（container 回收時背景看守會死 [需確認]）。本機設 `CURSOR_API_KEY` 即可共用，MCP 退役。
4. `cc-dispatch.md`、`cc-close.md`：`gh` 不可用就改用 GitHub MCP（`mcp__github__search_pull_requests`、`pull_request_read`）。
5. 測試 `test/cursor-mjs.test.mjs`（mock `fetch`：body 形狀、409 原樣回報、exit code），接進 `test/run-all.sh`。
6. 真打一次 smoke：本 repo 開一次性 change「README 加一行」，`/cc-dispatch` 派 → PR → `sync` 打勾。

## R4 驗證層（pstack／Grok 精華，1 輪）

1. `templates/docs/changes/README.md`（本 repo 同步 `docs/changes/README.md`）加〈修 bug 類 task〉：
   先重現（重現不了就停、PR 標 blocked）→ 寫會失敗的測試 → 修 → 重跑重現；
   PR body 必有修前失敗／修後通過輸出、`git diff --stat`、改 UI 附修前修後截圖；禁止改弱既有斷言、禁止 try/catch 吞錯誤。
2. `cc-dispatch.md` 契約 prompt 加一句「修 bug 類照 README〈修 bug 類 task〉」。
3. `sync` 打勾前驗證：PR 的 CI 綠，或 Claude 重跑那行 `驗：`；不過記 `unverified`、不打勾。部署類 `驗` 含 build（BACKLOG 15 → absorbed）。
   `unverified` 計入 `cc-close` 的退回數 b——這就是保留下來的信任指標。
4. 天然跨模型：`docs/changes/README.md`「派工」節加 `EXECUTOR_MODEL=<非 Claude 模型>`（與 `MAX_CONCURRENT` 同處讀），
   `cc-dispatch` 帶進 `--model`。Cursor 上另一家模型寫、Claude 驗＝對抗審查，零額外成本。可用模型以 `cursor.mjs models` 為準 [需確認]。
5. `cc-gate.md` 加兩條檢查：有沒有改弱斷言、`diff --stat` 有沒有超出 task 範圍。
6. `SPEC.md` 補 Scenario（`unverified`、`EXECUTOR_MODEL`、`gh` 退回 GitHub MCP）。

## 延後（等 R1–R4 跑出 PR 合併／退回數字再做）

- `cc-dispatch --n 2`（同題兩份，`cc-grill` 挑）
- PreCompact hook（依 README 規矩 3「欄位語意一律實測」先實測觸發時機）
- 路由入口 skill（至少兩套步驟後）

## 驗證

- 每輪 push 前：`sh test/run-all.sh`、`python3 tools/check_docs.py .`、`python3 tools/spec_merge.py check .`
- R1：`grep -rn "skill-usage\|log-harness-event\|ALIASES" --exclude-dir=archive .` 只剩 `docs/decisions.md` 歷史；新 session SessionStart 只印常駐字元一行
- R2：新 cloud session skill 清單有 cc-*；季檢 Routine 出現在 `list_triggers`
- R3：`/cc-env` 在未設 `CURSOR_API_KEY` 時該列 ❌ 且印修法、設好後全 ✅；`node tools/cursor.mjs models` 回清單；smoke PR 被 `sync` 打勾；新增 command 要 bump version
- R4：刻意的 bug task，PR body 有修前／修後輸出；CI 紅時 `sync` 記 `unverified` 且 `cc-close` 的 b 加 1
