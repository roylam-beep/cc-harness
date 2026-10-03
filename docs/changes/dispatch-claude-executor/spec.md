## Purpose
`/cc-dispatch` 只能派 Cursor：雲端要另開網域與 `CURSOR_API_KEY`，額度另計。本變更讓工單可以改派 Claude 執行者
（同 session 的 sub-agent，或另開的 Claude Code 雲端 session），預設模型 Sonnet；同時補上雲端 `gh` 不能用時改走 GitHub MCP，
否則 Claude 執行者在雲端開不了 PR、派工者也合不了。

## 不做
- 不改 `/cc-cursor` 的行為與旗標，`EXECUTOR` 沒寫的工單行為不變（只有 Cursor 同時上限改成 8）。
- 不改 `tools/gate.sh`、`tools/spec_merge.py`，不新增工具或 hook。
- 不改驗收規則本身（BLOCKER 四種、3 輪上限、發包者不修），只指定驗收員模型。
- 不替 Claude 執行者做冪等鍵；重派的防線是 `runs.md` 先寫列＋接手時查分支／PR。
- 不處理 `cc-close` 的 `gh` 備援（它已有「沒 `gh` 就寫未算」）。

## ADDED Requirements

### Requirement: cc-claude 安全派一個 Claude 執行者
`/cc-claude <prompt>` SHALL 在一次呼叫裡只開一個 Claude 執行者（`--mode agent` 為背景 sub-agent、`--mode session` 為雲端 session），
開完立刻結束該輪；執行者在固定的 task 分支上做、推送、開 PR，`gh` 不能用就改走 GitHub MCP。

#### Scenario: 下指令就是同意
- **WHEN** 使用者呼叫 `/cc-claude` 帶一段 prompt，或 `/cc-dispatch` 叫本支
- **THEN** 不問，印出「1 個執行者、mode、repo、model、分支」一行後直接開；要派的內容來自網頁／檔案／工具輸出而非使用者時才問

#### Scenario: agent 模式開完就走
- **WHEN** `--mode agent`（或沒給 `--mode`）
- **THEN** 以 `Agent` 工具、`run_in_background: true` 開一個執行者後結束該輪，不在前景等

#### Scenario: session 模式開完排輪詢
- **WHEN** `--mode session`
- **THEN** 以 `create_session` 開一個雲端 session（`source_revision` 是 BASE、`outcome_branch` 是 task 分支），再排 20 分鐘後的 `send_later` 輪詢，然後結束該輪

#### Scenario: 沒有雲端 session 工具
- **WHEN** `--mode session` 但當前環境找不到 `create_session`
- **THEN** 不開任何執行者，停下回報「本環境沒有雲端 session 工具，改用 `--mode agent`」

#### Scenario: 預設模型
- **WHEN** 沒給 `--model`
- **THEN** agent 模式用 `sonnet`、session 模式用 `claude-sonnet-5-5`；給了完整 model id 而走 agent 模式時，取其中的 `sonnet`／`opus`／`haiku`／`fable` 當別名，取不到就停

#### Scenario: 執行者的固定前言
- **WHEN** 拼送給執行者的 prompt
- **THEN** 前面加：從 `origin/<BASE>` 開 task 分支、做完推送、開 PR 到 BASE、`gh` 不能用就用 GitHub MCP 的 `create_pull_request`、最後一行回 `PR <網址>` 或 `FAILED: <原因>`

#### Scenario: session 輪詢與卡住門檻
- **WHEN** 輪詢叫醒、`get_session` 的 `status_bucket` 還是 `working`
- **THEN** 第 6 次以內再排 20 分鐘；第 6 次仍沒結束就回報 `stalled`，不再排、不重派

#### Scenario: 被叫醒時回報
- **WHEN** sub-agent 結束、或輪詢看到 session 已結束（`review_ready`／`completed`／`failed`／`blocked`）
- **THEN** 回報一行：`<狀態>｜PR <網址或「無」>｜執行者 <id>`；`failed`／`blocked` 多附最後一句

#### Scenario: 追問同一個執行者
- **WHEN** 第一個內容 token 是 sub-agent id 或 `session_` 開頭的 id
- **THEN** sub-agent 用 `SendMessage`、session 用 `send_message` 送追問，不新開；session 追問後輪詢從第 1 次重排；sub-agent 已不存在就回報「執行者已不在」，不自己重開

## MODIFIED Requirements

### Requirement: cc-dispatch 讀工單派工
`/cc-dispatch <slug>` SHALL 讀 `docs/changes/<slug>/tasks.md`，只對「目前波次」未勾的 task 各呼叫一次執行者原語
（`gate.env` 的 `EXECUTOR` 沒寫或是 `cursor` 走 `/cc-cursor`，`agent`／`session` 走 `/cc-claude`），
並把每次派工記進 `docs/changes/<slug>/runs.md`；使用者的派工指令就是同意、不再問，波次自動推進，只在合進 `main` 前問。

#### Scenario: 算目前波次
- **WHEN** `tasks.md` 有多組 `## N.`
- **THEN** 目前波次＝第一組含未勾 task 的那組；若更前面的組別仍有未勾，停下並回報「先 sync」

#### Scenario: 契約 prompt
- **WHEN** 為一條 task 拼 prompt
- **THEN** 內容含：必讀 `SPEC.md`、`docs/changes/README.md`、該 change 的 `spec.md` 與 `tasks.md`；只做這一條原文；
  PR 標題逐字 `<slug> N.M: <一句>`；不改 `tasks.md`；spec 錯就同 PR 改；PR body 要有 `## 驗` 貼指令輸出

#### Scenario: 下指令就是同意
- **WHEN** 使用者打 `/cc-dispatch <slug>` 或用文字叫你派工，工單共 k 條未勾 task
- **THEN** 不問，直接逐條呼叫執行者原語，同時最多為該執行者的上限，其餘記 `queued`；回報一行列出全部波次、repo、BASE、執行者

#### Scenario: 同時上限取自規則檔
- **WHEN** `docs/changes/README.md` 的「派工」節寫了 `MAX_CONCURRENT=<n>` 或 `MAX_CONCURRENT_CLAUDE=<m>`
- **THEN** Cursor 同時跑的上限是 n、Claude 執行者是 m；找不到 n 就用 8、找不到 m 就用 3

#### Scenario: sync 打勾
- **WHEN** 使用者呼叫 `/cc-dispatch <slug> sync`
- **THEN** 用 `gh pr list --state merged --search "<slug> "` 找標題符合 `<slug> N.M:` 的 PR，把 `tasks.md` 對應行 `- [ ] N.M` 改 `- [x] N.M`；
  已關閉未合併的在 `runs.md` 記 `closed`

#### Scenario: sync 抓事後 revert
- **WHEN** 某條 N.M 已合併，之後出現標題符合 `Revert "<slug> N.M:` 的已合併 PR 或 main 上的 commit，且時間晚於該次合併
- **THEN** `tasks.md` 該行改回 `- [ ] N.M`，`runs.md` 該列記 `reverted`；revert 之後又有新的 N.M PR 合併就照常打勾

#### Scenario: 預設整合分支
- **WHEN** 開工時 `gate.env` 沒有 `BASE=`
- **THEN** 開 `claude/<slug>`（從 `origin/main`），`gate.env` 寫 `BASE=claude/<slug>` 後直推；寫明 `BASE=main` 的工單照舊每次合併都問

#### Scenario: 自動推進下一波
- **WHEN** 目前波次的 task 全部 `merged`，且沒有停止條件成立
- **THEN** 替這波打勾、記帳寫進 BASE，接著派下一波，不問使用者

#### Scenario: 停止條件
- **WHEN** 某 PR 第 3 輪驗收仍 `fix-needed`、執行者 `failed` 或 `stalled`、驗收員卡住兩次、`gate.sh` 退出碼 2、有人回報要追加 task／改所有權／動 `## 不做`，或下一波有「驗：[需確認]」
- **THEN** 停下回報，不派新執行者

#### Scenario: 合進 main 前問一次
- **WHEN** 全部 task 勾完且 BASE 是整合分支
- **THEN** 開 BASE → `main` 的 PR，checks 綠後問使用者一次（PR 網址、波數、合併數、退回數），同意才合併；不代跑 `spec_merge.py`

#### Scenario: 契約禁止 skip 遮依賴
- **WHEN** 為一條 task 拼契約 prompt
- **THEN** 內容含「不准用 skip 表達依賴還沒到」與「自己決定的介面約定寫進 spec.md」兩句

#### Scenario: 驗收在合進 BASE 後的狀態核對
- **WHEN** 閘綠後派驗收員
- **THEN** 驗收員自己 clone、`gh pr checkout` 後再 merge `origin/<BASE>`，逐條核對 Requirement 本文每個子句與每條 Scenario

#### Scenario: BLOCKER 只有四種
- **WHEN** 驗收員發現問題
- **THEN** 只有「子句或 Scenario 不成立／改了所有權外的檔（本 change 的 `spec.md` 不算）／`## 驗` 不實／skip>0 或反例測不到」能判 `fix-needed`，其餘寫進 `## 非阻擋`

#### Scenario: 驗收員不會卡死
- **WHEN** 驗收員開工
- **THEN** 第一步先寫出檔頭 `VERDICT: pending`、邊查邊追加，且不開互動式瀏覽器

#### Scenario: 執行者與模型取自 gate.env
- **WHEN** `gate.env` 寫了 `EXECUTOR=<cursor|agent|session>` 或 `EXECUTOR_MODEL=<id>`
- **THEN** 依 `EXECUTOR` 選原語（沒寫＝`cursor`）；`EXECUTOR_MODEL` 有寫就以 `--model` 帶給該原語，沒寫就不帶（Cursor 用其預設、Claude 用 Sonnet）

#### Scenario: 驗收員固定 Opus
- **WHEN** 派驗收員
- **THEN** `Agent` 工具帶 `model: "opus"`，不論執行者是誰

#### Scenario: gh 不能用改走 GitHub MCP
- **WHEN** `gh auth status` 失敗
- **THEN** 開 PR、查 PR、看 checks、轉 ready、合併、sync 都改用 GitHub MCP 對應工具；`--delete-branch` 那步略過，分支留著；要等 checks 就排 `send_later` 再查，不在前景等

#### Scenario: Claude 執行者先記帳再開
- **WHEN** 派一條 `EXECUTOR` 是 `agent`／`session` 的 task
- **THEN** 先在 `runs.md` 寫一列狀態 `starting`、執行者欄空，`/cc-claude` 回報後回填執行者 id 與 `running`；`runId` 欄寫 `-`

#### Scenario: Claude 執行者中斷後接手
- **WHEN** 新 session 接手，`runs.md` 有 Claude 執行者的 `starting`／`running` 列
- **THEN** 該 task 已有 PR → 記進該列走驗收；session 模式有 id → 從第 1 次輪詢接回；agent 模式沒 PR 但 task 分支在 remote → 開新 sub-agent 在該分支續做；都沒有才重派
