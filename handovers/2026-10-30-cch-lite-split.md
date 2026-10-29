基準：f289559 @ 2026-10-29T16:51:32Z
狀態：open（2026-10-30 建立）

## ① 狀態
本 repo 凍結在 0.5.2；工作改在 `~/Documents/3.AGENT/cch-lite`（0.6.1）與 `~/Documents/3.AGENT/rr-dispatcher`（0.2.0），都已 push、帳號層已換裝。
未完成：兩條教訓還沒落地（見 kickoff）；6 個專案層仍裝舊 cc-harness，那些 repo 裡新舊兩套並存（指令要打全名 `/cch-lite:…`）。
本 repo 其他 6 份 `handovers/*.md` 仍標 open，屬凍結前的支線，不再處理。

## ② 工作區
- 本 repo：`main`，未追蹤 `err.txt`（10-20 起就在，非本輪）；push 狀態查 `git status -sb`。
- cch-lite／rr-dispatcher／`~/.claude`：查 `git -C <路徑> status -sb`，本輪結束時三者都已 push、工作區乾淨（`~/.claude` 另有未追蹤的 `skills/article-image/scripts/__pycache__/`）。
- 仍裝舊 cc-harness 的 repo：`claude plugin list | grep -B1 -A3 cc-harness@`。

## ③ kickoff
```
【開工：cch-lite 補兩條教訓】一句話背景：cc-harness 已凍結，治理層在 roylam-beep/cch-lite（本機 ~/Documents/3.AGENT/cch-lite）。
開場先跑：git -C ~/Documents/3.AGENT/cch-lite rev-parse --short HEAD / git -C ~/Documents/3.AGENT/cch-lite log --oneline origin/HEAD -1 / git -C ~/Documents/3.AGENT/cch-lite status --short
  本 kickoff 產生於 cc-harness f289559 之後；與實際不符以實際為準，並在回報點名差異。
動程式碼的輪次：開工前先跑 sh test/run-all.sh（在 cch-lite）拿基線；紅了先停、不帶病開工。
必讀：~/Documents/3.AGENT/cc-harness/handovers/2026-10-30-cch-lite-split.md、cch-lite 的 docs/decisions.md〈拆出 cch-lite〉、cch-lite 的 test/test_skills.py｜只做：下面兩條
完成定義：
- cch-lite test/test_skills.py 多一類判定：frontmatter description 含「空白＋#」就紅，附一個會紅的負向測試；run-all 全綠
- 帳號層 CLAUDE.md〈Commit 是常態〉加一句「push 前先看 git log @{u}..HEAD，有別人的 commit 就先列給使用者」（要使用者核准才改，改完 git -C ~/.claude commit）
- cch-lite 版號 bump、claude plugin update cch-lite@cch-lite --scope user、check-plugin-sync 綠
不做：改凍結的 cc-harness 規則或程式；替 6 個 repo 換裝 cch-lite（使用者要逐個換）｜約束：範圍外發現→該 repo 的 BACKLOG.md 一行並當輪 commit
```
