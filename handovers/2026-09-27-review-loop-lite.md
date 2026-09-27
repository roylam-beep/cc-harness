基準：93f2b5a @ 2026-09-27T08:38:02Z
狀態：open（2026-09-27 建立）

## 狀態

review-loop 輕量版已交（plugin 0.4.1，`93f2b5a` 已 push）。整合分支 `claude/review-loop-v04` 不合併、留 remote 存檔，PR #6 已關。
**沒有卡住的東西，但驗收節只驗了 `tools/gate.sh` 的 smoke test，沒對真 PR 跑過整條「閘 → 驗收員 → 退回／合併」。**
那要一次真派工。BACKLOG #15（cc-dispatch 三缺口）原定「跑完一波再定」：一波已在整合分支跑過，
其中「`sync` 標 stale-base」一項已被契約「先 merge origin/BASE」＋gate 退出碼 3 部分吸收，剩兩項待使用者拍板。
仍開著、不是本輪產生的：`handovers/2026-09-04-r5-p6.md`。

## 工作區

分支 `main`，歷史單線。本交接單、`rounds.md` R9、README 規矩 4、decisions 死法、BACKLOG #16、loop-rb 交接單改 closed
由**下一個 commit**（收輪 commit）提交，開場 HEAD 會比基準多一個——預期中。push 與否查：

```bash
git status --short && git log --oneline origin/main..HEAD
```

本機外掛仍是 0.3.4 時 `sh test/run-all.sh` 的 PLUGIN_SYNC 會紅：使用者在終端機跑 `claude plugin update cc-harness` 再重開 session（人工閘）。
整合分支的 20 份驗收報告與 spec／tasks 在 remote：`git show origin/claude/review-loop-v04:docs/changes/review-loop/tasks.md`。

## 下一輪 kickoff

```
【開工：用輕量版驗收迴圈真跑一條 task，然後拍板 BACKLOG #15】
一句話背景：cc-harness 是 Claude Code 治理 plugin；0.4.1 把 review-loop 收成 tools/gate.sh＋cc-dispatch「被叫醒時：驗收」，只跑過 smoke test。
開場先跑：git rev-parse --short HEAD / git log --oneline origin/main -1 / git status --short
  本 kickoff 產生於 93f2b5a 之後；與實際不符以實際為準，並在回報點名差異。
先確認本機外掛是 0.4.1（sh tools/check-plugin-sync.sh 綠）；不是就請使用者 claude plugin update cc-harness 並重開 session。
必讀：handovers/2026-09-27-review-loop-lite.md、commands/cc-dispatch.md、tools/gate.sh
只做：挑一條小 task（可用 BACKLOG #16）開 docs/changes/<slug>/（含 gate.env），經 /cc-dispatch 派 1 個 agent，
  照驗收節跑到 merge 或 3 輪停；記下哪一步卡住。之後把 BACKLOG #15 剩的兩項交給使用者拍板。
完成定義：該 change 的 tasks.md 全勾、reviews/ 至少一份、runs.md 有 agentId＋runId＋merged；#15 有使用者決定（做／砍）
不做：dispatch_state.py、merge_pr.sh、/cc-review、spec_merge 所有權檢查、SHARE_DIRS／SCHEMA_GLOB、followups.md、guard-write hook
約束：範圍外發現→BACKLOG.md 一行並當輪 commit；新增行數先訂上限（README 規矩 4）；派 agent、push、合進 main 照規矩當輪問
```
