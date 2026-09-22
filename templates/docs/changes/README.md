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
## 1. <波次>          同一組可併發；下一組等上一組全部合併
- [ ] 1.1 <做到什麼結果> ｜驗：<指令或可觀察行為>
## 2. <波次>
- [ ] 2.1 …
```

- **一條 task ＝ 一個 PR ＝ 最小可獨立變綠的變更**（測試與實作同一個 PR），不是最小編輯。
- 寫「結果＋怎麼驗」，不寫步驟。
- PR 標題固定 `<slug> N.M: <一句>`。**執行者不改 `tasks.md`**，勾由合併者依已合併 PR 補
  （`gh pr list --state merged --search "<slug> N.M"`），多人併發才不會搶同一個檔。
- 實作中發現 spec 寫錯：**同一個 PR 內改 `spec.md`**。spec 跟著現實走，不留到事後補。

## 關閉（tasks 全勾之後）

```bash
python3 scripts/spec_merge.py docs/changes/<slug>            # 看 diff
python3 scripts/spec_merge.py docs/changes/<slug> --apply    # 併進 SPEC.md
git mv docs/changes/<slug> docs/archive/changes/$(date +%F)-<slug>
```

`git commit` 會自動跑 `spec_merge.py check`：格式錯、Requirement 沒情境、task 行不合格式都會擋。
進行中變更超過 3 個只警告——先收一個再開。
