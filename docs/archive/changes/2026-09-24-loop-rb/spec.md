## Purpose
派工器派得出去但回不來：`sync` 抓不到事後 revert，收輪也不記 PR 流的數字，迴路是否在轉看不出來。
R-b 補上對帳、迴路量測與節流常數，讓「派 → 合 → 退 → 學到的」每一段都留下可算的痕跡。

## 不做
- 不做 webhook、自動重派、auto-merge、跨 repo 派工、`/v0/private-workers`。
- 不改 `/cc-gate`（它已把缺陷寫回 `## 0.`）。
- 不動 BACKLOG #15 的三缺口與「一般派工不查本機領先 remote」。
- `MAX_CONCURRENT` 以外不新增節流參數（沒有 429 實測前不猜）。

## MODIFIED Requirements

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
- **THEN** 列出 k 條與 repo 後只問使用者一次，同意後才逐條呼叫 `/cc-cursor`，同時最多 `MAX_CONCURRENT` 個，其餘記 `queued`

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

## ADDED Requirements

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
