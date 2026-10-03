基準：182e782 @ 2026-10-03T16:04:40Z
狀態：open（2026-10-03 建立）

## 狀態

`/cc-claude` 與 `/cc-dispatch` 的 Claude 執行者（`EXECUTOR=agent|session`）已經由 PR #8 合進 main（0.4.11），工單已歸檔到
`docs/archive/changes/2026-10-03-dispatch-claude-executor/`。**還沒真派過一次**：`docs/decisions.md` 2026-10-03 那條列的四項工具語意
（`create_session` 的 `outcome_branch`、`get_session` 的 `status_bucket`、`send_later` 叫回後能否叫起 skill、`Agent` 的模型別名）都只讀過說明。
翻案條件也在那條：首次真派與任一項不符，先修 `commands/cc-claude.md` 再派第二次。

## 工作區

本交接單、`docs/archive/rounds.md` R13、BACKLOG／ICEBERG 對帳、`SPEC.md` 合併與工單歸檔由**收輪 commit** 提交，
在 session 分支經 PR 合進 main，開場 HEAD 會比基準多一個 merge——預期中。查法：

```bash
git status --short && git log --oneline -3 origin/main
```

要使用者手動處理（雲端刪不掉分支：`git push --delete` 被遠端中斷，GitHub MCP 沒有刪分支工具）：
`claude/push-probe-1791013527`、`ccr-f643a52f-95htsn`。查還在不在：`git ls-remote --heads origin claude/push-probe-1791013527 ccr-f643a52f-95htsn`

新 skill 要 `claude plugin update cc-harness` 再開新 session 才出現在清單；查版號：
`python3 -c "import json,os;[print(x['scope'],x['version']) for x in json.load(open(os.path.expanduser('~/.claude/plugins/installed_plugins.json')))['plugins']['cc-harness@cc-harness']]"`

## 下一輪 kickoff

```
【開工：第一次用 EXECUTOR=agent 真派 Claude 執行者，順手做 BACKLOG #19】
一句話背景：cc-harness 0.4.11 讓 /cc-dispatch 能改派 Claude 執行者（/cc-claude），規則只讀過工具說明、沒真派過；上輪收在 182e782 之後的收輪 commit。
開場先跑：git rev-parse --short HEAD / git log --oneline origin/main -1 / git status --short
  本 kickoff 產生於 182e782 之後；與實際不符以實際為準，並在回報點名差異。
  再確認 plugin 版號 ≥ 0.4.11 且 skill 清單有 cc-claude；沒有就停，請使用者 update 後開新 session。
必讀：handovers/2026-10-03-dispatch-claude-executor.md、commands/cc-claude.md、docs/decisions.md 2026-10-03 那條
只做：開 docs/changes/spec-merge-overlap/（1 波 1 條 task：spec_merge check 偵測兩份進行中 change MODIFY 同一 Requirement，驗：python3 test/spec_merge.test.py），
  gate.env 寫 EXECUTOR=agent，/cc-dispatch spec-merge-overlap 跑到驗收與合進整合分支；逐項記下四項工具語意的實際行為。
完成定義：工單全勾並合進 main（合進 main 前問使用者）；decisions.md 2026-10-03 那條補「agent 模式已實測」與不符處（不符就先修 cc-claude.md）
不做：session 模式真派（agent 模式過了再排）、Cursor 路徑、BACKLOG 其他條
約束：範圍外發現→BACKLOG.md 一行並當輪 commit（已滿 12，要先排水）；合進 main 一律當輪問
```
