# docs/changes/ — 一個變更一個資料夾（給任何 agent 讀的契約）

系統「現在做什麼」的唯一來源是 repo 根的 `SPEC.md`。要改行為，先在這裡開 `docs/changes/<slug>/`：
`spec.md`（要變成什麼）＋ `tasks.md`（怎麼切成 PR）。**開工前必讀**：`SPEC.md`、本檔、該資料夾兩個檔。

## spec.md（delta，只寫差異）

```
## Purpose            一兩句：為什麼要做。新 SPEC.md 會用它當 Purpose。
## 不做               本變更明確不碰的東西，逐條。這節是 scope 的防線，寧多勿少。
## ADDED Requirements     新行為
## MODIFIED Requirements  改既有行為——整塊複製再改，Scenario 只能多不能少
## REMOVED Requirements   刪行為——只要 `### Requirement: <名>` 那行
```

- 每條 `### Requirement: <名>` 接一句 SHALL／MUST，底下 **至少一個** `#### Scenario: <名>`，
  情境用 `- **WHEN** …`／`- **THEN** …`（可加 `- **GIVEN**`、`- **AND**`）。
- 只寫**可觀察行為**：實作可以換而行為不變的東西（類別名、函式庫、步驟）不寫。設計決策進 `docs/decisions.md`。
- 名稱是識別碼：trim 後逐字比對、大小寫敏感。改名＝REMOVED 舊名＋ADDED 新名。
- 情境是驗收，不是散文：一條情境就是一個可以打勾打叉的測試。
- **Requirement 本文每個可觀察子句**（逗號／頓號分開的每個行為）至少對到一條 Scenario 的 THEN；對不到就拆 Requirement 或補 Scenario。
  只驗骨架（「有三個按鈕」）不算驗到行為（「切到香港會顯示香港假期」）——全閘綠但產品沒做完就是從這裡漏的。
- code fence 內不要放 `###`／`####` 開頭的行（解析是逐行的）。

## tasks.md（PR 切割表）

```
## 1. <波次>          同一組可併發；下一組等上一組全部合併
- [ ] 1.1 <做到什麼結果> ｜驗：<指令或可觀察行為>
## 2. <波次>
- [ ] 2.1 …
```

- **一條 task ＝ 一個 PR ＝ 最小可獨立變綠的變更**（測試與實作同一個 PR），不是最小編輯。
- 寫「結果＋怎麼驗」，不寫步驟。
- **同一波不准有讀寫依賴**：task 要讀別條 task 會產生的檔 → 放後一波；同一波各 task 的所有權不得交集。
- **「驗：」要能讓反例變紅**，只驗格式不夠：外部事實資料（法定假日、價目…）要比對存進 `test/fixtures/` 的來源原檔；
  UI task 的 `gate.env` 要有一條瀏覽器冒煙（headless 開頁、點主要按鈕），repo 沒有這類工具就照實寫「缺」。
  `/cc-dispatch from-plan` 只轉寫計畫：計畫沒給這種驗法就照寫、在回報標 `[驗法弱]`；人或 `/cc-close` 起草工單時才主動補。
- 測試不准用 skip 表達「依賴還沒到」——skip 在閘上等於通過。依賴沒到＝工單切錯，回報發包者。
- PR 標題固定 `<slug> N.M: <一句>`。**執行者不改 `tasks.md`**，勾由合併者依已合併 PR 補
  （`gh pr list --state merged --search "<slug> N.M"`），多人併發才不會搶同一個檔。
- 實作中發現 spec 寫錯：**同一個 PR 內改 `spec.md`**。spec 跟著現實走，不留到事後補。
  spec 沒寫、但執行者做了決定的介面約定（參數範圍、檔案格式、資料放哪）也算，寫進 `spec.md`，不只寫在 `## 學到的`。
- PR body 固定有 `## 驗`：貼上「驗：」那句指令的實際輸出。可選 `## 學到的`，一行一條。
- `runs.md`（若存在）是派工帳本：哪條 task 交給哪個 agent、PR 在哪。執行者不動它。
- task 行可加 `｜所有權：<路徑>、<路徑>`：執行者只改這些檔，**外加本 change 的 `spec.md`**（寫錯或補介面約定，不必列進所有權）。
- `gate.env`（選填，可 `.` 載入的 sh）：`BASE=` 整合分支（`/cc-dispatch` 開工時預設寫 `claude/<slug>`；沒寫＝`main`，每次合併都要問）；`EXECUTOR=` 執行者（`cursor`＝`/cc-cursor`，沒寫就是它；`agent`／`session`＝`/cc-claude` 的 sub-agent／雲端 session）；`EXECUTOR_MODEL=` 執行者模型（沒寫：Cursor 用其預設、Claude 用 Sonnet）；`GATE_1=`、`GATE_2=`… 從 1 連號的驗收指令，
  逐條都跑、只看退出碼；`GATE_TIMEOUT=` 單條秒數上限（預設 600）。由 `tools/gate.sh <change-dir> <PR#>` 讀。
- `reviews/PR-<n>-r<k>.md`：第 n 號 PR 第 k 輪的驗收全文，檔頭 `VERDICT:`、`BLOCKERS:` 兩行。

## 派工（`/cc-dispatch`）

```
MAX_CONCURRENT=8          同時跑的 Cursor agent 上限；超過的記 queued，一個結束再開下一個
MAX_CONCURRENT_CLAUDE=3   同時跑的 Claude 執行者上限（sub-agent 吃派工 session 自己的額度與速率）
```

- 要調就改這兩行，`/cc-dispatch` 每次派工從這裡讀（找不到：Cursor 用 8、Claude 用 3）。沒有 429 實測前不加別的節流參數。

## 關閉（tasks 全勾之後）

```bash
python3 scripts/spec_merge.py docs/changes/<slug>            # 看 diff
python3 scripts/spec_merge.py docs/changes/<slug> --apply    # 併進 SPEC.md
mkdir -p docs/archive/changes && git mv docs/changes/<slug> docs/archive/changes/$(date +%F)-<slug>
```

本機裝了 harness 的 pre-commit hook 時，`git commit` 會跑 `spec_merge.py check`（格式錯、Requirement 沒情境、task 行不合格式都會擋）。
hook 不隨 clone 走：cloud agent 那邊沒有，要靠 `gate.env` 的 `GATE_2="python3 scripts/spec_merge.py check ."` 或 CI。
進行中變更超過 3 個只警告——先收一個再開。
