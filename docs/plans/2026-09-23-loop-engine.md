# loop-engine — 派工器 `/cc-dispatch` ＋ 迴路量測（計畫，未動工）

日期 2026-09-23。前置：`docs/changes/spec-layer/` 先收輪跑通一次（BACKLOG #14 的前提）。
呼叫面：`~/.claude.json` 註冊的 `cursor-cloud` MCP（`node /Users/roy-mac/Documents/cursor-api/src/index.js`），
背景看守用同 repo 的 `scripts/wait-for-run.js`。所有事實出處在下方「實測到的限制」。

規模：**兩輪 session**（R-a 派工 v0、R-b 同步與量測），各含測試。人工閘另計：每一波派工前你要按一次「燒錢確認」。

## 目標

```
/cc-dispatch <slug>            讀 docs/changes/<slug>/tasks.md，對「目前波次」還沒勾的 task 各開一個 Cursor cloud agent
/cc-dispatch <slug> sync       用 gh 對帳：已合併 PR → 勾 tasks.md；關閉未合併 → 記退回；寫 runs.md
cc-close ①                     歸檔 change 時多記一行：changes 歸檔 N｜PR 合併 a／退回 b｜gate 缺陷 c；撈 merged PR 的 ## 學到的 走 A／B／C
```

一條 task ＝ 一個 agent ＝ 一個 PR。波次是門：上一波全部合併才開下一波。人合併，機器對帳。

## 三個要你拍板的（各兩選一，都先給建議）

1. **派工器形態**：(a) **skill `commands/cc-dispatch.md` 驅動 MCP 工具（建議）**——沿用既有 `cursor_create_agent` ＋
   `wait-for-run.js` 背景任務，harness 在背景任務結束時自動叫醒 agent，零新驗證路徑；(b) 在 cursor-api 寫 `scripts/dispatch.js`
   直接打 API——可脫離 session 跑，但要自己做節流、重試、ledger，多一套要維護的東西。
2. **帳本落點**：(a) **`docs/changes/<slug>/runs.md`（建議）**——task／agentId／runId／狀態／PR／退回理由一張表，
   跟資料夾一起歸檔，`tasks.md` 維持純契約；(b) 直接註記在 `tasks.md` 每行尾巴——少一檔，但打破「執行者不改 tasks.md」的邊界感。
3. **誰合併**：(a) **人合併，派工器只 `sync`（建議）**——政策上 auto-merge 要你明說才准，第一輪先看 PR 品質；
   (b) `gh pr merge --auto --squash` 在 CI 綠時自動合——等 a／b 數字出來、退回率夠低再開。

## 實測到的限制（設計繞著這些走）

| 限制 | 出處 | 對設計的影響 |
|---|---|---|
| `cursor_create_agent` 只有 `prompt` 必填；PR 選項只有布林 `autoCreatePR`；**沒有 base branch、沒有 webhook** | `cursor-api/src/index.js:150-165` | PR base 由 Cursor 決定（預設分支）。波次靠「上一波合併進 main 才開下一波」保證依賴 |
| 建立當下只回 `agent.id`＋`run.id`；分支名與 PR URL 要等 run 結束從 `run.git.branches[].prUrl` 取 | `src/index.js:180`；`.runs/run-00b38939-….md:93-100` | 帳本兩段寫：派工時寫 agent／run，結束時補 PR |
| 反查：`cursor_list_agents({ prUrl })` 可由 PR URL 找 agent | `src/index.js:192` | `sync` 對帳的備援 |
| `wait-for-run.js` exit 0 完成／1 失敗／2 放棄；stdout `git:` 行截斷 300 字 | `scripts/wait-for-run.js:11-23, 170-188` | PR URL 從 `.runs/<runId>.md` 的 `--- git ---` 區塊或 `cursor_get_run` 讀，不靠 stdout |
| 零併發控制、零 429 重試（`apiRequest` 只有 60s timeout） | `src/cursor.js:76`；全 repo grep 無 queue／rate | 派工器自己節流：同時最多 `MAX_CONCURRENT=3`，一個結束再開下一個 |
| `cursor_create_agent` 對真實 API 的回傳 shape **未驗證**（cursor-api BACKLOG） | `cursor-api/BACKLOG.md` | R-a 第一件事是真打一次 |
| MCP 工具目錄 session 開始時快取；改工具要新 session | `cursor-api/README.md:212-219` | 改 cursor-api 的輪次要重開 session 驗 |
| `cursor_stream_run` 上限 1800s、只在 turn 內有效 | `src/index.js:348` | 一律走背景看守，不用 stream |

## R-a：派工 v0（中，1 輪）

1. **真打一次**：在 cc-harness 開一個一次性 change（例 `docs/changes/dispatch-smoke/`，一條 task「在 README 加一行」），
   `cursor_create_agent({ prompt, repos:[<cc-harness URL>], autoCreatePR:true, name:"<slug> 1.1" })`，背景跑
   `wait-for-run.js`，確認：回傳有 `agent.id`／`run.id`；結束後 `run.git.branches[0].prUrl` 存在；PR 標題符合 `<slug> N.M:`；
   PR 內 agent 有跑 `驗：` 指令並貼結果。**這一步結果決定要不要改 cursor-api**（例：加 429 重試、暴露 base branch 若 API 支援 `[需確認]`）。
2. **`commands/cc-dispatch.md`**（frontmatter `argument-hint: "<slug> [sync]"`，`allowed-tools` 白名單：`Bash(node …/wait-for-run.js:*)`、
   `Bash(gh pr list:*)`、`Bash(gh pr view:*)`、`Bash(git log:*)`、Read、Write、Edit ＋ MCP `cursor_*`）。本文：
   - 先讀 `tasks.md`，算「目前波次」＝第一個還有未勾 task 的 `## N.`；上一波若有未勾直接停：「波次 N-1 未合完，先 sync」。
   - **燒錢閘**：列出要開的 task 清單、model、預估數量，**等你回一句確認才開**（每次派工都問，不延續）。
   - 每條 task 組 prompt（骨架見下），`cursor_create_agent`，寫 `runs.md` 一列，起背景 `wait-for-run.js --label "<slug> N.M"`。
   - 同時最多 3 個；背景任務結束叫醒後：讀 `.runs/<runId>.md` 補 PR URL 與狀態，再開佇列裡下一個。
   - exit 1（失敗）：記 `failed`＋最後 assistant 那句，**不自動重派**；exit 2（放棄）：記 `stalled`，給你 `cursor_get_run` 指令。
3. **`templates/docs/changes/README.md`** 加一節「派工」（3 行）：agent 收到的 prompt 長什麼樣、PR 標題與 body 契約
   （body 固定含 `## 驗` 貼指令輸出、可選 `## 學到的`）。
4. `test/test_skills.py` 過 7 類；skill 帶死法。

### agent prompt 骨架（自我完備，不假設它知道 cc-*）

```
你在 <repo> 工作。先讀：SPEC.md、docs/changes/README.md、docs/changes/<slug>/spec.md、docs/changes/<slug>/tasks.md。
只做這一條：<tasks.md 那一行原文>
規矩：測試與實作同一個 PR；開 PR 前跑「驗：」後面那句並把輸出貼進 PR body 的 ## 驗；
不改 tasks.md；spec.md 寫錯就在這個 PR 裡改；不碰 ## 不做 列的東西；
PR 標題逐字 `<slug> N.M: <一句>`；body 可選 ## 學到的（一行一條，寫別人會再踩的坑）。
```

## R-b：sync、波次門、迴路量測（中，1 輪）

1. **`/cc-dispatch <slug> sync`**：`gh pr list --state merged --search "<slug> " --json title,url,mergedAt,body` → 標題解析 N.M →
   勾 `tasks.md` 對應行（sed 精準到 `- [ ] N.M `）；`--state closed` 減去 merged ＝ 退回，`runs.md` 記 `reverted`；
   `git log --grep "Revert \"<slug> N.M"` 抓事後 revert。全勾就印 `spec_merge.py --apply` 的下一步。
2. **cc-close ①** 多兩件事：歸檔的每個 change 記 `changes 歸檔 N｜PR 合併 a／退回 b｜gate 缺陷 c`
   （a、b 從 `runs.md` 或 `gh` 算；c ＝ `git log -p -- docs/changes/<slug>/tasks.md | grep -c '^+- \[ \] 0\.'`）；
   `## 學到的` 從 merged PR body 撈出來，逐條進既有 A／B／C 判定，`rounds.md` 只留指標。沒 `gh` 寫「未算」。
3. **cc-gate** 不變（它已寫回 `## 0.`）。
4. 節流常數與 `MAX_CONCURRENT` 放 `docs/changes/README.md` 派工節，不進常駐檔。

## 不做

不做 webhook／inbound endpoint（Claude Code 沒有）；不做自動重派失敗的 agent；不做 auto-merge（拍板 3 選 b 才做）；
不做跨 repo 派工（一次一個 repo，`docs/changes/` 在哪就派哪）；不包 `/v0/private-workers`。

## 死法（可從檔案算）

- `/cc-dispatch`：`skill-usage.py` 60 天內呼叫 <3 次，且同期 `.runs/` 有新檔（＝你還是手動開 agent）→ 退役，回到手動 `cursor_create_agent`。
- 迴路量測行：連續 6 輪 `a＝0` → 沒在用 PR 流，砍掉那行與 `## 學到的` 撈回。
- 波次門：連續 3 個 change 都只有一個波次 → 波次概念多餘，tasks.md 改回單層清單。

## 風險與人工閘

- **燒錢**：每個 agent 都吃 Cursor 額度，派工前必問；`cursor_get_usage` 事後對帳寫進 `runs.md`。
- **PR base 控制不到**：目標 repo 預設分支就是 main 才能用；不是的 repo 先不派。
- **cursor-api 本身的驗證債**（`create_agent` 真實 shape、`cancel_run` 成功路徑、無測試）——R-a 第 1 步順手還一部分，
  改了 `src/` 就照該 repo 慣例收輪。
- **sandbox 能不能跑 `驗：`**：python3／node 版本 `[需確認]`，R-a 真打時看。
