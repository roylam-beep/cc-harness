---
description: 收輪——三步收尾一輪工作：歸檔＋升格、收編＋排水、寫交接單。`archive` ＝只歸檔不收輪。程序本文以當前 repo 的 docs/round.md 為準，本檔是缺省版
argument-hint: "[空＝收輪｜archive＝只歸檔]（其餘文字當聚焦範圍）"
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git add:*), Bash(git commit:*), Bash(grep:*), Bash(ls:*), Bash(python3:*), Read, Glob, Grep, Write, Edit
---

收尾一輪工作。安靜做完，最後依「怎麼驗」節回報。$ARGUMENTS

**程序本文以當前 repo 的 `docs/round.md` 為準**，其次 `AGENTS.md`「收輪三步」節，
都沒有才用下方缺省三步。找到 repo 版就照那份做，本檔只補它沒寫的；不一致時照 repo 那份，
並在回報點名一句差異。

`$ARGUMENTS` 第一個字是 `archive` ＝只跑第①步＋文件檢查（`rounds.md` 該段標「archive-only，
未收輪」）；其他或空 ＝三步全跑，模式字之後的文字當聚焦範圍。要交接的是一條支線而不是
一整輪，用 `/cc-handover <slug>`。

## 約束

- 只作用於當前 repo，不讀寫 repo 外路徑。一輪動了兩個 repo 就各跑一次。
- 只寫查證過的事實：hash、分支、測試結果以指令輸出為準，不確定標 `[需確認]`。
  沒過寫沒過，跳過寫跳過，驗證過才寫「已完成」。
- 自我完備：下一輪讀不到本次對話。會過期的事實寫成查詢指令，不寫成結論。
- 收輪是整理者不是守門員：任何 session 都能 commit `BACKLOG.md`，收輪只負責收斂。
- 帳號層（`~/.claude/**`）寫入邊界看 `~/.claude/CLAUDE.md`，本檔不另立一套。

## 輸出契約（缺省三步）

**① 歸檔＋升格。** 實作筆記與檢討進 `docs/archive/rounds.md`。每條檢討先判三選一才准落檔：
**A 可反覆套用**→進 auto-load 規則檔；**B 能機器化**→升格成 gate，**同時寫明它的死法**，
寫不出來就不加；**C 一次性**→才留全文。A／B 在 `rounds.md` 只留一行指標。
耐久知識先分流出去（決策→`docs/decisions.md`；查證過的事實→`.claude/rules/`）——
會被覆寫的檔不揹耐久知識。

**② 收編＋排水。** 三處各自收斂進 kickoff、`BACKLOG.md`、或第①步的升格：`docs/plans/**`
的 gate 產出（**缺出處的規則候選一律拒絕**）、`grep -rn "狀態："` 找仍 open 的支線、
本輪的範圍外發現。接著排水：已完成的移除；滿載或超長的**整行**搬 `docs/archive/ICEBERG.md`
＋一字理由（done／stale／absorbed／deferred），**不改寫**。上限以該 repo `BACKLOG.md` 檔頭為準。

**③ 寫交接單。** 有 `handovers/` 就寫 `handovers/<session-slug>.md`（一 session 一份，
同名已存在加 `-2`，不覆寫別人那份）；沒有才退回單點 `HANDOVER.md` 整檔覆寫。
**第一行逐字固定** `基準：<git rev-parse --short HEAD> @ <ISO 時間>`——freshness hook 只吃這行。
三節：①狀態一句話＋未完成卡在哪、從哪個檔案接 ②工作區（分支、未提交檔、push 狀態）
③下一輪 kickoff prompt（code fence，骨架見下）。本輪完成了什麼屬歷史，寫 `rounds.md`。

### kickoff 骨架

```
【開工：<本輪唯一目標>】一句話背景：<repo 是什麼、上輪收在哪>
開場先跑：git rev-parse --short HEAD / git log --oneline origin/main -1 / git status --short
  本 kickoff 產生於 <短 SHA> 之後；與實際不符以實際為準，並在回報點名差異。
動 src/** 的輪次：開工前先跑 `npm run verify`（或等價指令）拿基線；紅了先停、不帶病開工。
必讀：<本交接單路徑>、<相關檔 ≤3>｜只做：<目標>｜完成定義：<可驗證條列>
不做：<已否決或排到別輪的，逐條>｜約束：範圍外發現→BACKLOG.md 一行並當輪 commit
```

**動了 `src/**` 或改了寫入治理**的輪次，檔尾再加一行「本輪產出由下一個新 session 跑
`/cc-gate <slug>` 驗收」。純文件／harness／設定輪次不要加——那是白欠一個 session。

kickoff 裡目標、完成定義、不做清單、使用者決定照舊寫死，那些不會過期。

## 怎麼驗

跑當前 repo 的文件檢查（慣例 `python3 scripts/check_docs.py .`）。沒過回第①②步繼續剪，
**不准調高上限**——正解是把規則搬到使用點（path-scoped 規則檔、腳本檔頭、`BACKLOG.md`
檔頭、`docs/round.md`），其次才下沉歸檔。repo 沒鋪就回報一行「未鋪文件檢查，已跳過」。

回報帶這幾項，不重貼任何檔案內容：判定與最重要一條、實際跑過哪些檢查／哪些沒跑、
「教訓升格：A n／B n／C n」、「BACKLOG 對帳：-N 進 ICEBERG，餘 M/上限」、
meta／產品比一行（`git log --oneline <上輪 HEAD>..HEAD | wc -l` 對 `… -- src/ | wc -l`，
寫「本輪 n 個 commit，其中 m 個碰 src/」）。

**死法**：連續 3 輪 meta commit 多於碰 `src/` 的 commit ＝收輪程序本身在製造工作，該減。
