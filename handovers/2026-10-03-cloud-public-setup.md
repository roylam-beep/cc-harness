基準：35850d0 @ 2026-10-03T01:25:15Z
狀態：open（2026-10-03 建立）

## 狀態

cloud 主力的 R1（拆使用量層）、R2（public＋環境 Setup script）做完並實測：全新 repo `brag` 開場即有 `cc-harness:*`。
**卡在 R3**：cloud 的 Claude 還派不動 Cursor——`commands/cc-cursor.md` 的 `allowed-tools` 只有 `mcp__cursor-cloud__*`，
那個 MCP 只註冊在本機（`node ~/Documents/cursor-api/src/index.js`），cloud 沒有。從 `docs/plans/2026-09-24-cloud-orchestrator.md` R3 接。

## 工作區

分支 `claude/pstack-agent-skills-jpmfdq`，從 `origin/main` 重開；本交接單、`rounds.md` R13、decisions、BACKLOG／ICEBERG、計畫進度行
由收輪 commit 提交並開 PR。查狀態：

```bash
git status --short && git log --oneline origin/main..HEAD
```

環境 `ccharness` 的 `CURSOR_API_KEY` 是否已設 [需確認]：在該環境的 session 跑 `[ -n "$CURSOR_API_KEY" ] && echo set`（不印值）。
Network 是否放行 `api.cursor.com` [需確認]：`curl -sS -o /dev/null -w '%{http_code}' https://api.cursor.com/v0/me`（403＝被 proxy 擋）。

## 下一輪 kickoff

```
【開工：讓 cloud 的 Claude 能派 Cursor agent（R3）】
一句話背景：cc-harness 是 Claude Code 治理 plugin，已 public，cloud 環境 ccharness 用 Setup script 安裝；/cc-cursor 只認本機的 cursor-cloud MCP，cloud 派不動。
開場先跑：git rev-parse --short HEAD / git log --oneline origin/main -1 / git status --short
  本 kickoff 產生於 35850d0 之後；與實際不符以實際為準，並在回報點名差異。
必讀：handovers/2026-10-03-cloud-public-setup.md、docs/plans/2026-09-24-cloud-orchestrator.md（R3 節）、commands/cc-cursor.md
只做：
  1. add_repo roylam-beep/cursor-api（read），把 src/cursor.js＋scripts/wait-for-run.js 移植成零依賴 tools/cursor.mjs
     （子指令 create｜run｜get｜watch｜models｜repos；沿用 CURSOR_API_KEY、redact()、exit code 0/1/2、.runs/<runId>.md）。新增 ≤300 行（README 規矩 4）。
  2. cc-cursor.md 改走 node "${CLAUDE_PLUGIN_ROOT}/tools/cursor.mjs"，第 1 步加環境檢查（key 有無、models 通不通、repo 有沒有接），❌ 就停並給修法一行。
  3. test/cursor-mjs.test.mjs（mock fetch：body 形狀、409 原樣、exit code）接進 test/run-all.sh；bump version。
  4. 在 ccharness 環境真打一次 models＋repos；能通就派一條最小 task 走 /cc-dispatch。
  5. 另建每季 /cc-audit Routine（create_trigger，fresh session，cron 0 1 1 1,4,7,10 *）。
完成定義：run-all 綠；cloud session 裡 node tools/cursor.mjs models 回清單；一條真派的 PR 被 sync 打勾
不做：新增 /cc-env（/cc-cloud-env 已存在）、改名 roylam-harness、R4 驗證層、vendor 進各 repo
約束：範圍外發現→BACKLOG.md 一行並當輪 commit；key 不進對話、不進檔案
```
