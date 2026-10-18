---
description: 寫一份給人快速審的 PR body——固定三節：圖（取代摘要段落）、改前改後的證據、Merge Danger（單向門或雙向門＋影響範圍）。開 PR、改 PR body、或 /cc-dispatch 把整合分支合進預設分支前用。只寫 body 檔，不開 PR、不改其他檔
argument-hint: "[base 分支，留空＝repo 預設分支] [--spec <spec.md 路徑>]"
allowed-tools: Read, Glob, Grep, Write, Bash(git diff:*), Bash(git log:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(git worktree:*), Bash(gh pr view:*), Bash(sh:*), Bash(ls:*), Bash(grep:*)
---

替目前分支寫 PR body。$ARGUMENTS

產物只有一個檔：`$(git rev-parse --git-dir)/pr-body.md`（在 `.git` 裡，不會被 commit，每次覆寫）。
寫完回一行檔案路徑；呼叫者用 `gh pr create … --body-file <路徑>`，或把內容當 GitHub MCP 的 `body`。
適用範圍：在裝了本 plugin 的 session 裡寫的 PR（整合分支進預設分支、手寫的 PR）。
cloud 執行者讀不到 cc-*，每條 task 的 PR 照 `docs/changes/README.md` 的 `## 驗` 規矩，不歸本支。

## 先讀

1. base＝`$ARGUMENTS` 第一個不帶 `--` 的字，沒有就用 repo 預設分支（`git symbolic-ref --short refs/remotes/origin/HEAD` 去掉 `origin/`，取不到用 `main`）。`git diff --stat origin/<base>...HEAD`、`git log --oneline origin/<base>..HEAD`。
2. spec：有 `--spec` 就讀；沒給但分支是 `claude/<slug>` 就讀 `docs/changes/<slug>/spec.md`（含 `## 不做`）。
   Merge Danger 要靠 spec 判，只看 diff 判不準。
3. 整合分支另讀 `docs/changes/<slug>/runs.md` 與 `reviews/*.md` 的檔頭兩行——每條 task 的證據已在那裡，引用，不重做。

## 範本（節名與順序固定）

```
## 改了什麼
<一張圖＋最多一句>

## 驗
| 項目 | 改前 | 改後 |
|---|---|---|
<每項一列>
<閘的整包結果一行>

## Merge Danger
- 門：<單向｜雙向>——<一句理由>
- 影響範圍：<誰會受影響、多少個呼叫點>
- 怎麼審：<掃過即可｜逐行讀 `檔:行`…>

## 學到的
<可選；一行一條，別人會再踩的坑。沒有就整節刪掉>
```

**改了什麼：圖，不寫段落。** 照 `/cc-show` 的①純文字規矩：file tree、call tree、diff 草圖、虛擬碼挑一種，
≤15 行，只留看懂這次改動要的節點；文字排不出來才用 ```` ```mermaid ````（GitHub 會畫）。節點對得上真實檔案，
沒查證的關係標 `[推測]`。圖下最多一句：這張圖要讀者看出哪件事。不用 widget、不發 Artifact——PR 頁面看不到。

**驗：每項都要改前與改後。** 來源由硬到軟：
1. 同一條指令兩邊各跑一次：`git worktree add <scratchpad>/pr-base origin/<base>`，在那裡跑改前，跑完
   `git worktree remove <scratchpad>/pr-base`；表格貼兩邊的關鍵行。最好的一列是「改前紅、改後綠」。
2. 整合分支：引用 task PR 的 `## 驗` 與驗收員的 mutation 結果（故意改壞實作時測試會紅＝改前抓得到）。
3. 純文件或設定：改前改後就是那段 diff 本身。

跑不了（要憑證、外部服務、真實客戶帳號）那格寫 `未驗：<原因>`。**不准寫「讀過程式碼，應該沒問題」**——那不是證據。
表格下一行是本 repo 整包閘的最後一行輸出（`gate.sh`、`test/run-all.sh` 之類）；沒跑就寫沒跑。

**Merge Danger：告訴審的人時間該花在哪。**
- **門**：合併後出事，`git revert` 能不能回到原樣。能＝雙向門。不能＝單向門：刪除資料、資料庫 migration
  刪欄位或改既有資料、寄出 email／訊息、對真實客戶帳號寫入（預算、出價、上下架）、對外發布。
  單向門要寫出觸發點 `檔:行` 與觸發時機（合併當下、部署時、排程跑時）。
- **影響範圍**：壞了會壞多少——一支指令、一個客戶，還是所有用到這個模組的地方。用 `grep` 數呼叫點，寫數字。
- **怎麼審**：雙向門＋範圍小 → `掃過即可`；其餘列要逐行讀的 `檔:行`，最多 5 處，最危險的排第一。

## 規矩

- 只寫那一個 body 檔：不改 repo 裡的檔、不 commit、不開 PR。`git worktree` 只建在 scratchpad，用完移除。
- 沒查證的客戶名稱、數字、外部事實標 `[需確認]`，不自己填。body 不放憑證、token、客戶識別資訊。
- 整份 body 讀完不超過一個螢幕半；細節放連結（`reviews/` 檔、task PR），不貼全文。

## 防什麼

PR body 用 commit 訊息拼湊（`--fill`），審的人得自己讀完整個 diff 才知道改了什麼、哪裡危險；
agent 宣稱「應該可以」卻沒有改前改後的證據，人只能選擇全信或全部重讀。
