基準：38e0b9a @ 2026-09-23T15:02:46Z
狀態：closed（2026-09-24 R8 收輪）——kickoff 已由 R8 消化；from-plan 實跑移交 `2026-09-24-loop-rb.md`

## 狀態

`/cc-dispatch <slug> from-plan <計畫檔>` 已交（`38e0b9a`，0.3.5，已 push），工單已歸檔進 `SPEC.md`。
**沒有卡住的東西，但 from-plan 還沒對真實老 repo 跑過**——第一次用它時要確認：起草的 `spec.md` 過 `spec_merge.py check`、
`git log` 對照標 `[x]` 沒誤判、一次確認後確實 push 才派。

主線沒變：loop engine R-b，kickoff 在 `handovers/2026-09-23-loop-engine-ra.md`（仍 open），下面那份只補新基準。

## 工作區

分支 `main`，歷史單線。`rounds.md` R7 節、`SPEC.md`、change 歸檔與本交接單由**下一個 commit**（收輪 commit）提交，
開場 HEAD 會比基準多一個——預期中。push 與否查：

```bash
git status --short && git log --oneline origin/main..HEAD
```

本機外掛若還是 0.3.4，`sh test/run-all.sh` 的 PLUGIN_SYNC 段會紅（`commands/` 改了）：先 `claude plugin update cc-harness@cc-harness` 再重開 session。

## 下一輪 kickoff

```
【開工：loop engine R-b——/cc-dispatch sync 對帳、波次門、迴路量測】
一句話背景：cc-harness 是 Claude Code 治理 plugin；R6 交了 /cc-cursor、/cc-dispatch v0，R7 加了 from-plan 模式（0.3.5）。
開場先跑：git rev-parse --short HEAD / git log --oneline origin/main -1 / git status --short
  本 kickoff 產生於 38e0b9a 之後；與實際不符以實際為準，並在回報點名差異。
開工前先跑：sh test/run-all.sh 拿基線；PLUGIN_SYNC 紅 → 先 claude plugin update cc-harness@cc-harness 並重開 session。
必讀：handovers/2026-09-23-loop-engine-ra.md、docs/plans/2026-09-23-loop-engine.md（R-b 節）、commands/cc-dispatch.md
只做：計畫 R-b 第 1、2、4 條（sync 對帳含 closed／revert、cc-close ① 記「PR 合併 a／退回 b｜gate 缺陷 c」與撈 ## 學到的、節流常數進 docs/changes/README.md）
完成定義：sync 對一份含 merged／closed PR 的工單跑出正確勾選與 runs.md 狀態；python3 test/test_skills.py 與 sh test/run-all.sh 全綠；每件一個 commit
不做：webhook、自動重派、auto-merge、跨 repo 派工、/v0/private-workers（計畫「不做」節）；BACKLOG 15 的三缺口與「一般派工不查本機領先 remote」（使用者決定跑完一整波再定）
約束：範圍外發現→BACKLOG.md 一行並當輪 commit（已滿 12，進一出一）
```
