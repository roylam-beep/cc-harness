## Purpose
cc-harness 沒有「系統做什麼」這一層：完成定義是自由文字，gate 沒有機器可讀的對照表。
本變更借 OpenSpec 的格式子集，讓每個 repo 有一份活的 `SPEC.md`，變更以 `docs/changes/<slug>/` 交付，
而且能交給遠端 agent 以原子 PR 併發執行。

## 不做
- 不裝 OpenSpec CLI，不做 stores，不做 RENAMED，不做 proposal.md／design.md。
- 不改 `tools/check_docs.py`，不動 `hooks/`。
- 不做派工器與 loop engine（PR 合併／退回計數、`## 學到的` 撈回）——下一輪。

## ADDED Requirements

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
