基準：4388bcb @ 2026-10-16T12:57:24Z
狀態：open（2026-10-16 建立）

## 狀態

R15 收完：`/cc-pr` 上線（0.4.14）、`/cc-dispatch` 同時上限固定 8。兩件使用者還沒說動手的提案留給下一輪（見 kickoff）。
`/cc-pr` 與上限 8 都還沒在真的派工上跑過；8 個 Claude 執行者並行會不會撞 429 未驗。

## 工作區

- 分支 `main`，本輪 commit 都在本機 main；push 狀態查：`git status -sb`（本輪結束時 ahead，未 push）。
- 未提交檔：無（收輪 commit 後查 `git status --short`）。
- 未收編：`grep -ln "^狀態：open" handovers/*.md` 列出的舊支線交接單（本輪結束時 7 份，含本檔），本輪沒逐份收斂 [需確認]。
- 已裝 plugin 快取：`claude plugin list` 應為 0.4.14；`sh tools/check-plugin-sync.sh` 綠。

## 下一輪 kickoff

```
【開工：/cc-dispatch 收尾補整條分支審查】一句話背景：cc-harness 是 Claude Code 治理 plugin；R15 加了 /cc-pr、dispatch 上限固定 8。
開場先跑：git rev-parse --short HEAD / git log --oneline origin/main -1 / git status --short
  本 kickoff 產生於 4388bcb 之後；與實際不符以實際為準，並在回報點名差異。
必讀：handovers/2026-10-16-cc-pr-concurrency.md、commands/cc-dispatch.md〈自動推進〉、docs/archive/rounds.md R15
先問使用者一句再動手（R15 時使用者尚未說「動手」）。
只做：
  1. README.md「（private）」改「（public）」（gh repo view 回 PUBLIC，已查證）。
  2. cc-dispatch〈自動推進〉第 3 步：全勾後先用 Skill 工具跑內建 /code-review 審 origin/main...<BASE>，全文寫 docs/changes/<slug>/reviews/branch-r1.md；
     確認的 bug 寫成 tasks.md 新一波 ## <N+1>. 整條審查、照原流程派執行者＋閘＋Opus 驗收；只審一次；全合後才 /cc-pr 開 PR 進 main。
     不用 ## 0.（那是 /cc-gate 缺陷編號，cc-close 拿來算 gate 缺陷數）；發包者不修產品程式碼。SPEC 經 docs/changes＋spec_merge --apply。
完成定義：sh test/run-all.sh ALL GREEN；SPEC.md cc-dispatch Requirement 多一條「開 PR 進 main 前先審整條分支」Scenario。
不做：GLOSSARY.md、tasks.md 依賴欄（波次照舊）、執行者 PR 範本加三節、implementation.md 加「機械違規用 linter」、新開 cc-retro
  （retro 改法若做，是在 /cc-close ① 加「讀 session 對話紀錄」來源，另開一輪）。
約束：範圍外發現→BACKLOG.md 一行並當輪 commit（BACKLOG 已滿 12/12，先排水再加）
```
