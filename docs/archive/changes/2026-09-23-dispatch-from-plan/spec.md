## Purpose
老 repo 常只有 plan mode 的計畫檔（散文），沒有 `docs/changes/<slug>/tasks.md`，派工器就算計畫完整也派不出工。
讓 `/cc-dispatch` 自己把計畫檔起草成工單，並補齊契約 prompt 要求必讀的 `docs/changes/README.md`。

## 不做
- 不改計畫檔本身；不刪、不搬 `~/.claude/plans/` 底下任何檔。
- 不覆寫已存在的 `docs/changes/<slug>/`。
- 不跑 `/cc-harness`，不補 README 以外的標準件（那是 BACKLOG #13）。
- 不自動判定「已做完」：只標出疑似已完成的項目，由使用者在那一次確認裡決定。

## ADDED Requirements

### Requirement: cc-dispatch 從計畫檔起草工單
`/cc-dispatch <slug> from-plan <計畫檔路徑>` SHALL 讀該計畫檔，寫出 `docs/changes/<slug>/spec.md` 與 `tasks.md`，
通過格式檢查並推上 remote 後，接著照一般派工流程派目前波次。

#### Scenario: 不覆寫既有工單
- **WHEN** `docs/changes/<slug>/` 已存在
- **THEN** 停下並回報「工單已存在，直接 `/cc-dispatch <slug>`」，不寫任何檔

#### Scenario: 起草格式可被檢查
- **WHEN** 起草完 `spec.md` 與 `tasks.md`
- **THEN** repo 有 `scripts/spec_merge.py` 就跑 `python3 scripts/spec_merge.py check .`，紅就修到綠才往下；沒有就回報「未驗格式」

#### Scenario: 疑似已完成的項目
- **WHEN** 計畫裡某項在 `git log` 找得到對應 commit
- **THEN** 該 task 寫成 `- [x]`，並在確認清單點名該 commit hash

#### Scenario: 一次確認涵蓋推送
- **WHEN** 工單起草完成
- **THEN** 只問使用者一次：列出工單路徑、各波 task、要 commit＋push 的檔；同意後才 commit、push、派工，不同意就留在工作區不 commit

### Requirement: cc-dispatch 補齊工單規則檔
`/cc-dispatch` 任一模式 SHALL 在派工前確認 `docs/changes/README.md` 存在，缺了就從 plugin 範本複製一份。

#### Scenario: 老 repo 缺規則檔
- **WHEN** `docs/changes/README.md` 不存在
- **THEN** 複製 `${CLAUDE_PLUGIN_ROOT}/templates/docs/changes/README.md` 過去，並把它列進同一次 commit
