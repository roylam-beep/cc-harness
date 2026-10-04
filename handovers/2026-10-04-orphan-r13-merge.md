基準：4f7ab26 @ 2026-10-04T13:53:05Z
狀態：done（2026-10-04）——孤兒分支以 merge commit 合入，R13＝cloud 主力、R14＝Claude 執行者；孤兒的 #19 改 #20、#6 排水；`eacd300`

## 支線目標

把另一個 session 留在 remote、沒開 PR 的收輪 commit（分支 `claude/pstack-agent-skills-jpmfdq`，commit `7c88f0a`）合進 `main`，
解掉它跟 main 上 R13 收輪的衝突；順手收掉這輪留下的兩個小尾巴。

## 做到哪

**已完成**（都已在 main，PR #8 → `182e782`、PR #9 → `4f7ab26`）：
- `/cc-claude`、`/cc-dispatch` 的 Claude 執行者（0.4.11），工單已歸檔到 `docs/archive/changes/2026-10-03-dispatch-claude-executor/`。
- R13 收輪：`docs/archive/rounds.md` 的「R13 — 派工可改派 Claude 執行者」、BACKLOG #11 移 ICEBERG、新增 #19、交接單 `handovers/2026-10-03-dispatch-claude-executor.md`。

**未做（本支線要做的）**：

1. **合孤兒分支 `claude/pstack-agent-skills-jpmfdq`**（1 個 commit `7c88f0a`，從 `35850d0` 分出，作者是另一個雲端 session）。內容：
   `docs/archive/rounds.md` 一節 R13（cloud 主力 R1/R2 實測）、`docs/decisions.md`、`docs/plans/2026-09-24-cloud-orchestrator.md` 進度行、
   `BACKLOG.md`（也把 #11 結案）、`docs/archive/ICEBERG.md`、`handovers/2026-10-03-cloud-public-setup.md`。
   試合結果（`git merge-tree --write-tree --name-only origin/main origin/claude/pstack-agent-skills-jpmfdq`）：
   `BACKLOG.md`、`docs/archive/ICEBERG.md` 衝突；`docs/archive/rounds.md` 自動合併但會出現**兩節 R13**。
   解法（使用者尚未拍板，照這個做、回報時點名）：它那節時間較早（10/3 01:25）保留 R13，main 上「派工可改派 Claude 執行者」那節改名 R14；
   BACKLOG #11 只留一次刪除；ICEBERG #11 只留一列，理由併兩邊實測。用 merge commit，不 rebase 別人的分支。
2. **交接單的 plugin 更新指令少了 project 層**（Codex 在 PR #9 的 P2，使用者規則是 P2 不修，所以沒動）：
   `handovers/2026-10-03-dispatch-claude-executor.md` 第 23–24 行只寫 `claude plugin update cc-harness`；`docs/decisions.md` 記過 project 層安裝會蓋過 user 層。
   **要不要改由使用者決定**；不改的話，接手者開工時兩行都跑：`claude plugin update cc-harness` 與 `claude plugin update cc-harness --scope project`。
3. **刪 remote 分支（只能使用者在 GitHub 網頁做）**：雲端 `git push --delete` 會被遠端中斷，GitHub MCP 沒有刪分支工具。
   可刪：`ccr-f643a52f-95htsn`（已全進 main）、`claude/push-probe-1791013527`（推送測試）、合完後的 `claude/pstack-agent-skills-jpmfdq`。
   **不要刪** `claude/review-loop-v04`（`docs/decisions.md` 寫明留 remote 存檔）。

查現況（會過期，以輸出為準）：

```bash
git fetch --prune origin
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -v -e HEAD -e '^origin/main$' -e '^origin$'); do echo "$b 未合=$(git rev-list --count origin/main..$b)"; done
```

## 工作區

本交接單是唯一新增檔，在分支 `ccr-f643a52f-95htsn`（從 `origin/main` 4f7ab26 重開），經 PR 進 main。沒有其他未提交檔。

## 驗證狀態

- 跑過：上面的分支列舉與 `git merge-tree` 試合（輸出已摘在「做到哪」）；PR #9 合併前 `check_docs`、`spec_merge check`、`test_skills` 全綠。
- 沒跑：孤兒分支合進來後的任何檢查；`test/run-all.sh` 整套（`plugin sync` 在雲端會因安裝快取是舊版而紅，屬預期）。

## 接手 kickoff

```
【開工：把孤兒收輪分支 claude/pstack-agent-skills-jpmfdq 合進 main】
開場先跑：git rev-parse --short HEAD / git log --oneline origin/main -1 / git status --short
  本 kickoff 產生於 4f7ab26 之後；與實際不符以實際為準，並在回報點名差異。
必讀：handovers/2026-10-04-orphan-r13-merge.md、docs/archive/rounds.md 最上面兩節、BACKLOG.md 檔頭
只做：開新分支從 origin/main → git merge origin/claude/pstack-agent-skills-jpmfdq → 照交接單「做到哪」1 的解法解衝突、R13/R14 改名
  → python3 tools/check_docs.py . && python3 tools/spec_merge.py check . && python3 test/test_skills.py 全綠 → 開 PR，合進 main 前問使用者
完成定義：main 上只剩一節 R13、一節 R14；BACKLOG ≤12 條且 #11 不在；ICEBERG #11 只一列；三項檢查綠；PR 經使用者同意合併
不做：交接單第 2 點的 plugin 指令（等使用者決定）、刪分支（使用者自己做）、/cc-claude 首次真派（那是 handovers/2026-10-03-dispatch-claude-executor.md 的主線）
約束：範圍外發現→BACKLOG.md 一行（已滿 12，要先排水）；push 到 main 一律經 PR
做完：本檔狀態行改 done（日期）＋一句結果＋commit hash，不跑 /cc-close
```
