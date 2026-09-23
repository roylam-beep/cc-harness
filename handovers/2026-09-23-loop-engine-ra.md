基準：f91f430 @ 2026-09-23T02:57:06Z
狀態：closed（2026-09-24 R8 收輪）——R-b 已做完，後續見 `2026-09-24-loop-rb.md`

## 狀態

loop engine **R-a 做完**：`/cc-cursor`、`/cc-dispatch` v0 已交，dispatch-v0 工單 3.1 真派一次通過（PR #1 已合併）。
**沒有卡住的東西。** 下一步是計畫的 R-b（sync 對帳、波次門、迴路量測），從
`docs/plans/2026-09-23-loop-engine.md`「R-b」節接手。

仍開著、不是本輪產生的：`handovers/2026-09-04-r5-p6.md`（gate 積壓四道、P2 三件）。
P3 A/B 觀察期 2026-09-23 已作廢（`docs/decisions.md`〈P3 A/B 作廢〉），`cc-close.md` 可以改。

## 工作區

分支 `main`，歷史單線。本交接單、`rounds.md` R6 節、`SPEC.md`、兩份 change 歸檔、
`tools/check-plugin-sync.sh` 與 0.3.4 升版由**下一個 commit**（收輪 commit）一起提交，
開場 HEAD 會比基準多一個——預期中，不是快照過期。查現況：

```bash
git status --short && git log --oneline origin/main..HEAD
```

**本機外掛還是 0.3.3**：收輪 commit 升到 0.3.4（`tools/` 改了）。開工前在終端機跑
`claude plugin update cc-harness` 再重開 session，否則 `sh test/run-all.sh` 的 PLUGIN_SYNC 段會紅。

## 下一輪 kickoff

```
【開工：loop engine R-b——/cc-dispatch sync 對帳、波次門、迴路量測】
一句話背景：cc-harness 是 Claude Code 治理 plugin；上輪交了 /cc-cursor、/cc-dispatch v0 並真派一次（PR #1）。
開場先跑：git rev-parse --short HEAD / git log --oneline origin/main -1 / git status --short
  本 kickoff 產生於 f91f430 之後；與實際不符以實際為準，並在回報點名差異。
開工前先跑：sh test/run-all.sh 拿基線；PLUGIN_SYNC 紅 → 先 claude plugin update cc-harness 並重開 session。
必讀：handovers/2026-09-23-loop-engine-ra.md、docs/plans/2026-09-23-loop-engine.md（R-b 節）、commands/cc-dispatch.md
只做：計畫 R-b 第 1、2、4 條（sync 對帳含 closed／revert、cc-close ① 記「PR 合併 a／退回 b｜gate 缺陷 c」與撈 ## 學到的、節流常數進 docs/changes/README.md）
完成定義：sync 對一份含 merged／closed PR 的工單跑出正確勾選與 runs.md 狀態；python3 test/test_skills.py 與 sh test/run-all.sh 全綠；每件一個 commit
不做：webhook、自動重派、auto-merge、跨 repo 派工、/v0/private-workers（計畫「不做」節）；BACKLOG 15 的三缺口（使用者決定跑完一整波再定）
約束：範圍外發現→BACKLOG.md 一行並當輪 commit（已滿 12，進一出一）
```
