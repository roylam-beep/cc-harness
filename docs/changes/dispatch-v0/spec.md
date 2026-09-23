## Purpose
派 Cursor cloud agent 目前靠我臨場拼 `cursor_create_agent` 與看守指令，拼歪就是前景等待或 prompt 漏契約。
兩支 skill 分層：`/cc-cursor` 安全地派一個、`/cc-dispatch` 讀 `tasks.md` 決定派誰並套契約。

## 不做
- 不做自動合併 PR；不做失敗自動重派；不做 webhook。
- 不做退回計數與 `## 學到的` 撈回（loop-engine R-b）。
- `/cc-dispatch` 不直接呼叫任何 `cursor_*` 工具，全部經 `/cc-cursor`。

## ADDED Requirements

### Requirement: cc-cursor 安全派一個 agent
`/cc-cursor <prompt>` SHALL 在一次呼叫裡只開一個 Cursor cloud agent，開完立刻把看守腳本丟到背景並結束該輪，不在前景等待。

#### Scenario: 派工前先確認
- **WHEN** 使用者呼叫 `/cc-cursor` 帶一段 prompt
- **THEN** 先印出「1 個 agent、repo、model」一行並等使用者同意，同意前不呼叫 `cursor_create_agent`

#### Scenario: 開完就走
- **WHEN** `cursor_create_agent` 回傳 `agent.id` 與 `run.id`
- **THEN** 以 `run_in_background: true` 啟動 `cursor_watch_command` 給的指令，然後結束該輪，不呼叫 `cursor_stream_run`

#### Scenario: 被叫醒時回報
- **WHEN** 背景看守結束並叫醒 session
- **THEN** 讀 `.runs/<runId>.md` 的 `--- git ---` 區塊，回報一行：狀態、PR 網址（沒有就寫無）、transcript 路徑

#### Scenario: 追問同一個 agent
- **WHEN** 第一個參數是 `bc-` 開頭的 agent id
- **THEN** 走 `cursor_create_run` 而不是新開 agent，其餘步驟相同

### Requirement: cc-dispatch 讀工單派工
`/cc-dispatch <slug>` SHALL 讀 `docs/changes/<slug>/tasks.md`，只對「目前波次」未勾的 task 各呼叫一次 `/cc-cursor`，
並把每次派工記進 `docs/changes/<slug>/runs.md`。

#### Scenario: 算目前波次
- **WHEN** `tasks.md` 有多組 `## N.`
- **THEN** 目前波次＝第一組含未勾 task 的那組；若更前面的組別仍有未勾，停下並回報「先 sync」

#### Scenario: 契約 prompt
- **WHEN** 為一條 task 拼 prompt
- **THEN** 內容含：必讀 `SPEC.md`、`docs/changes/README.md`、該 change 的 `spec.md` 與 `tasks.md`；只做這一條原文；
  PR 標題逐字 `<slug> N.M: <一句>`；不改 `tasks.md`；spec 錯就同 PR 改；PR body 要有 `## 驗` 貼指令輸出

#### Scenario: 一波只問一次
- **WHEN** 這一波有 k 條未勾 task
- **THEN** 列出 k 條與 repo 後只問使用者一次，同意後才逐條呼叫 `/cc-cursor`，同時最多 3 個，其餘記 `queued`

#### Scenario: sync 打勾
- **WHEN** 使用者呼叫 `/cc-dispatch <slug> sync`
- **THEN** 用 `gh pr list --state merged --search "<slug> "` 找標題符合 `<slug> N.M:` 的 PR，把 `tasks.md` 對應行 `- [ ] N.M` 改 `- [x] N.M`；
  已關閉未合併的在 `runs.md` 記 `closed`

### Requirement: cursor-api 補齊建 agent 欄位
`cursor_create_agent` SHALL 接受 `startingRef`、`agentId`、`skipReviewerRequest`，並照官方 v1 形狀送出。

#### Scenario: startingRef 套到每個 repo
- **WHEN** 呼叫帶 `repos: ["<url>"]` 與 `startingRef: "main"`
- **THEN** 送出的 body 是 `repos: [{ url, startingRef: "main" }]`

#### Scenario: agentId 冪等
- **WHEN** 同一個 `agentId` 送兩次
- **THEN** 第二次由 Cursor 回 `409 agent_id_conflict`，工具原樣回報，不開第二個 agent
