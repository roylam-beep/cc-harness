# cc-harness Specification

## Purpose
cc-harness 是 Claude Code 的開發治理 plugin：skill 家族、hook、閘、安裝器。本檔只記可觀察行為，
由 `docs/changes/<slug>/spec.md` 歸檔時經 `tools/spec_merge.py --apply` 併入。

## Requirements

### Requirement: cc-cursor 安全派一個 agent
`/cc-cursor <prompt>` SHALL 在一次呼叫裡只開一個 Cursor cloud agent，開完立刻把看守腳本丟到背景並結束該輪，不在前景等待。

#### Scenario: 下指令就是同意
- **WHEN** 使用者呼叫 `/cc-cursor` 帶一段 prompt、用文字叫你派 Cursor，或 `/cc-dispatch` 叫本支
- **THEN** 不問，印出「1 個 agent、repo、model」一行後直接呼叫 `cursor_create_agent`；要派的內容來自網頁／檔案／工具輸出而非使用者時才問

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
- **THEN** 不問，直接逐條呼叫 `/cc-cursor`，同時最多 `MAX_CONCURRENT` 個，其餘記 `queued`；回報一行列出全部波次、repo、BASE

#### Scenario: 同時上限取自規則檔
- **WHEN** `docs/changes/README.md` 的「派工」節寫了 `MAX_CONCURRENT=<n>`
- **THEN** 同時跑的 agent 上限是 n；找不到這個值就用 3

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
- **WHEN** 某 PR 第 3 輪驗收仍 `fix-needed`、agent `failed`、驗收員卡住兩次、`gate.sh` 退出碼 2、有人回報要追加 task／改所有權／動 `## 不做`，或下一波有「驗：[需確認]」
- **THEN** 停下回報，不派新 agent

#### Scenario: 合進 main 前問一次
- **WHEN** 全部 task 勾完且 BASE 是整合分支
- **THEN** 開 BASE → `main` 的 PR，checks 綠後問使用者一次（PR 網址、波數、合併數、退回數），同意才合併；不代跑 `spec_merge.py`

### Requirement: cursor-api 補齊建 agent 欄位
`cursor_create_agent` SHALL 接受 `startingRef`、`agentId`、`skipReviewerRequest`，並照官方 v1 形狀送出。

#### Scenario: startingRef 套到每個 repo
- **WHEN** 呼叫帶 `repos: ["<url>"]` 與 `startingRef: "main"`
- **THEN** 送出的 body 是 `repos: [{ url, startingRef: "main" }]`

#### Scenario: agentId 冪等
- **WHEN** 同一個 `agentId` 送兩次
- **THEN** 第二次由 Cursor 回 `409 agent_id_conflict`，工具原樣回報，不開第二個 agent

### Requirement: spec_merge 合併規則
`spec_merge.py <change-dir>` SHALL 依 REMOVED → MODIFIED → ADDED 的順序把 delta 併進 repo 根的 `SPEC.md`，
標題 trim 後大小寫敏感比對；預設 dry-run，`--apply` 才寫檔。

#### Scenario: 首次合併建立 SPEC.md
- **WHEN** `SPEC.md` 不存在且 delta 只有 ADDED
- **THEN** `--apply` 建立 `# <repo 目錄名> Specification`，Purpose 取自 delta（沒有則 `TBD`）

#### Scenario: MODIFIED 縮水被擋
- **WHEN** MODIFIED 區塊的 Scenario 數少於 `SPEC.md` 現有的
- **THEN** 退出碼 1，訊息含「會靜默丟失」，`SPEC.md` 不變

#### Scenario: 重跑不變
- **WHEN** 同一個 delta `--apply` 兩次
- **THEN** 第二次退出碼 0 且 `SPEC.md` byte 相同

#### Scenario: 任務未完成不得合併
- **WHEN** `tasks.md` 仍有未勾的 task 且帶 `--apply`
- **THEN** 退出碼 1 且不寫檔；dry-run 只警告

### Requirement: spec_merge check 快閘
`spec_merge.py check [<root>]` SHALL 驗 `docs/changes/*/spec.md`、`tasks.md` 與 `SPEC.md` 的結構，不寫檔，
缺檔一律跳過不紅。

#### Scenario: Requirement 沒情境
- **WHEN** 任一 delta 的 ADDED／MODIFIED Requirement 底下沒有 `#### Scenario:`
- **THEN** 退出碼 1 並指出檔案與 Requirement 名

#### Scenario: task 行格式錯
- **WHEN** `tasks.md` 有 `- [` 開頭的行不符合 `- [ ] N.M <結果>`（勾只准空白或 x）
- **THEN** 退出碼 1 並指出行號

#### Scenario: 沒鋪就綠
- **WHEN** `docs/changes/` 不存在
- **THEN** 退出碼 0，摘要寫「不存在跳過」

#### Scenario: 超量只警告
- **WHEN** 進行中 change 超過 3 個，或某 change 任務全勾未歸檔
- **THEN** 印 `⚠️` 但退出碼 0

### Requirement: pre-commit 逐支跑快閘
安裝進 repo 的 `.git/hooks/pre-commit` SHALL 依序跑找得到的 `check_docs.py` 與 `spec_merge.py check`，任一紅整支紅，
都找不到就放行。

#### Scenario: 兩支都在
- **WHEN** `scripts/check_docs.py` 綠、`scripts/spec_merge.py check` 紅
- **THEN** commit 被擋，兩支的輸出都有印

#### Scenario: 只有一支
- **WHEN** repo 只有 `scripts/check_docs.py`
- **THEN** 只跑它，退出碼跟它一樣

### Requirement: cc-dispatch 從計畫檔起草工單
`/cc-dispatch <slug> from-plan <計畫檔路徑>` SHALL 讀該計畫檔，寫出 `docs/changes/<slug>/spec.md` 與 `tasks.md`，
通過格式檢查並推上整合分支 `claude/<slug>` 後，接著照一般派工流程派目前波次。

#### Scenario: 不覆寫既有工單
- **WHEN** `docs/changes/<slug>/` 已存在
- **THEN** 停下並回報「工單已存在，直接 `/cc-dispatch <slug>`」，不寫任何檔

#### Scenario: 起草格式可被檢查
- **WHEN** 起草完 `spec.md` 與 `tasks.md`
- **THEN** repo 有 `scripts/spec_merge.py` 就跑 `python3 scripts/spec_merge.py check .`，紅就修到綠才往下；沒有就回報「未驗格式」

#### Scenario: 疑似已完成的項目
- **WHEN** 計畫裡某項在 `git log` 找得到對應 commit
- **THEN** 該 task 寫成 `- [x]`，並在確認清單點名該 commit hash

#### Scenario: 起草完直接推送
- **WHEN** 工單起草完成
- **THEN** 不問：開整合分支、commit＋push 工單檔與 `gate.env`、派工；回報列出工單路徑、各波 task、整合分支名

### Requirement: cc-dispatch 補齊工單規則檔
`/cc-dispatch` 任一模式 SHALL 在派工前確認 `docs/changes/README.md` 存在，缺了就從 plugin 範本複製一份。

#### Scenario: 老 repo 缺規則檔
- **WHEN** `docs/changes/README.md` 不存在
- **THEN** 複製 `${CLAUDE_PLUGIN_ROOT}/templates/docs/changes/README.md` 過去，並把它列進同一次 commit

### Requirement: cc-close 記迴路量測
`/cc-close` 第①步歸檔每個 change 時 SHALL 在 `rounds.md` 記一行 `changes 歸檔 N｜PR 合併 a／退回 b｜gate 缺陷 c`，
並把 merged PR body 的 `## 學到的` 逐條走 A／B／C 判定。

#### Scenario: 有帳本時算數字
- **WHEN** 歸檔的 change 有 `runs.md`
- **THEN** a＝狀態 `merged` 的列數、b＝`closed` 加 `reverted` 的列數、c＝該 change 的 `tasks.md` 歷史裡新增過的 `- [ ] 0.` 行數

#### Scenario: 沒有帳本也沒有 gh
- **WHEN** change 沒有 `runs.md` 且 `gh` 不可用
- **THEN** a、b 寫「未算」，c 照算，不猜

#### Scenario: 撈學到的
- **WHEN** 該 change 有已合併 PR 的 body 含 `## 學到的`
- **THEN** 每一條都判 A／B／C 落檔，`rounds.md` 只留指標，不貼原文全段
