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
- code fence 內不要放 `###`／`####` 開頭的行（解析是逐行的）。

## tasks.md（PR 切割表）

```
## 1. <波次>          沒寫「依賴」時：同一組可併發；下一組等上一組全部合併
- [ ] 1.1 <做到什麼結果> ｜驗：<指令或可觀察行為>
  - 所有權：<路徑>          未勾必填。值可空，空的話下一層 `- ` 列路徑；`**所有權**：` 也算
  - 依賴：<N.M、… 或 無>    選填。寫了就取代波次規則；`無`＝不等任何 task
  - <其他子行>              選填
## 2. <波次>
- [ ] 2.1 …
```

- **一條 task ＝ 一個 PR ＝ 最小可獨立變綠的變更**（測試與實作同一個 PR），不是最小編輯。
- 寫「結果＋怎麼驗」，不寫步驟。
- 一條 task 的區塊＝該行，加上它底下的縮排行，直到下一條 task 或 `##` 標題。
- `所有權：`：未勾 task 必填，列這條 PR 可以改的路徑。寫在 task 行上，或區塊裡的縮排行，都算；
  `**所有權**：` 同樣算（冒號可以在粗體外面）。冒號後面可以直接寫路徑；空著就用更深一層的 `- ` 子項列路徑。
  已勾的不查。缺了 `spec_merge.py check` 退出碼 1，並指出行號與 N.M。
- `依賴：`：選填。沒寫就沿用波次規則（同一組可併發，下一組等上一組全部合併）。
  寫了就取代波次規則：值是要等的 `N.M`（多個用 `、` 或 `,` 分隔），那些還沒勾就先不要派；`無` 等於不等任何 task。
- 其他子行選填（例如 PR 標題、契約）。
- PR 標題固定 `<slug> N.M: <一句>`。**執行者不改 `tasks.md`**，勾由合併者依已合併 PR 補
  （`gh pr list --state merged --search "<slug> N.M"`），多人併發才不會搶同一個檔。
- 實作中發現 spec 寫錯：**同一個 PR 內改 `spec.md`**。spec 跟著現實走，不留到事後補。
- PR body 固定有 `## 驗`：貼上「驗：」那句指令的實際輸出。可選 `## 學到的`，一行一條。

## gate.env 與驗收紀錄

`docs/changes/<slug>/gate.env` 是可以 `.` 載入的 sh。值含空白或 shell 特殊字元就加引號。
檔案不存在、缺 `BASE` 或 `GATE_1`，退出碼 2，印缺了什麼。

- `BASE=` 必填。整合分支名。試合併把 PR 的 head 合到 `origin/<BASE>` 最新版。PR 的 base 必須等於它，不等就退出碼 4、不建 worktree。
- `GATE_1=` … `GATE_<n>=` 從 1 連號，遇到第一個沒定義的就停。至少要有 `GATE_1`。依序執行，只看退出碼；某一條紅了，其餘照跑。
- `GATE_TIMEOUT=` 選填，單條 GATE 的秒數上限。沒設是 900。超過就中止該條、記紅，其餘照跑。
- `SHARE_DIRS=` 選填，空白分隔的相對目錄。worktree 裡這些目錄以 symlink 指回主 repo。
- `SCHEMA_GLOB=` 選填。PR 改到符合這個 glob 的檔時，`SHARE_DIRS` 改成複製（`cp -cR`，不支援就 `cp -R`），不用 symlink。

- `reviews/PR-<n>-r<k>.md`：第 n 號 PR、第 k 輪的驗收全文。
- `followups.md`：驗收帶回來、不擋合併的待修，逐條附上 PR 編號往下加。
- `runs.md` 由 `dispatch_state.py` 維護（哪條 task 交給哪個 agent、PR 在哪）。執行者不動。

## 派工（`/cc-dispatch`）

```
MAX_CONCURRENT=3      同時跑的 cloud agent 上限；超過的記 queued，一個結束再開下一個
```

- 要調就改這一行，`/cc-dispatch` 每次派工從這裡讀（找不到用 3）。沒有 429 實測前不加別的節流參數。

## 關閉（tasks 全勾之後）

```bash
python3 scripts/spec_merge.py docs/changes/<slug>            # 看 diff
python3 scripts/spec_merge.py docs/changes/<slug> --apply    # 併進 SPEC.md
mkdir -p docs/archive/changes && git mv docs/changes/<slug> docs/archive/changes/$(date +%F)-<slug>
```

`git commit` 會自動跑 `spec_merge.py check`：格式錯、Requirement 沒情境、task 行不合格式、未勾 task 缺所有權都會擋。
進行中變更超過 3 個只警告——先收一個再開。
