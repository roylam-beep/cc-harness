# review-loop 期中總結與健康檢查

## 期中總結（2026-09-27，第 1 波合了 4／5）

### 做了什麼

- **工單**：`spec.md` 5 條 ADDED＋4 條 MODIFIED；`tasks.md` 3 波 9 條，每條有所有權、依賴、驗。計畫正本搬進本 repo（`docs/plans/2026-09-25-dispatch-review-loop.md`），盤點更正 12 條。
- **派工**：第 1 波 5 條全派（Cursor，grok-4.7），交回 5 個 PR（#3–#7）。
- **驗收**：每個 PR 先跑試合併閘（`gate.env` 的 9 條 GATE），綠了才派兩位獨立驗收員（A 對照契約、B 對抗實測）。報告 20 份在 `reviews/`。
- **合併進整合分支**：4 個。時間從第一個 commit 23:02 到第 4 個合併 00:07，約 65 分鐘。

| PR | task | 驗收輪數 | 第 1 輪 BLOCKER | 結果 |
|---|---|---|---|---|
| #3 | 1.3 spec_merge 所有權檢查 | 2 | 3 | merged |
| #4 | 1.4 cc-cursor 起點分支與冪等 id | 2 | 2 | merged |
| #5 | 1.1 dispatch_state 簿記腳本 | 3 | 3（第 2 輪再 2） | merged |
| #6 | 1.2 gate-pr 試合併跑閘 | 1＋第 2 輪中斷 | 5（含 2 條安全） | 已修，待重驗 |
| #7 | 1.5 AGENTS 樣板發包規則 | 2 | 1 | merged |

### 發現什麼

1. **第一輪一次就過的是 0／5。** 抓到的都不是風格問題：
   - 安全：`gate-pr.sh` 的 `SHARE_DIRS` 帶 `..` 會 `rm -rf` 到 worktree 外；Linux 的 dash 被中斷時不清 worktree。
   - 花錢：`cc-cursor` 的「呼叫方已同意」判定太鬆，使用者直接呼叫也可能跳過確認。
   - 簿記靜默出錯：`dispatch_state sync` 會把重派中的列蓋回 closed，同一條 task 會被派兩次。
   - 測試沒驗到它宣稱的東西：3 處，都是驗收員用 mutation（故意改壞程式看測試會不會紅）測出來的。
2. **中途 4 次 spec 更正，都是發包者寫的契約不夠細**：同時上限算誰、所有權怎麼認、sync 什麼時候不蓋、stale 要先 fetch。最容易走針的是「兩支工具都要做的同一個判定」（`spec_merge.py` 和 `dispatch_state.py` 都要讀所有權）。下次這類判定只寫一份。
3. **自己吃自己的狗糧成立**：`dispatch_state.py` 合併後，直接用它 sync 打勾；`next` 算出可派 2.1、2.2；`stale` 抓到 #6 落後整合分支。三個都對。
4. **發包者沒寫產品程式碼**：發包者 19 個 commit 只動 `docs/changes/**`、`docs/plans/**`；程式碼 commit 9 個全是 Cursor Agent。
5. **脆弱點**：session 中斷時，背景驗收（#6 第 2 輪）被殺，scratchpad 被清空，本輪手動用的閘腳本一起沒了（已重建）。這正是 `gate-pr.sh`、`merge_pr.sh` 要進 repo 的理由。
6. `followups.md` 已累積 140 行（有重複），收尾波次要先去重再挑。

## 健康檢查（合併滿 4 個，2026-09-27）

| 項目 | 結果 |
|---|---|
| 主工作目錄乾淨 | ✅ 0 個變動 |
| 整合分支 HEAD 閘（9 條） | ✅ GATE GREEN |
| `dispatch_state.py sync --check` | ✅ SYNC 一致（rc=0） |
