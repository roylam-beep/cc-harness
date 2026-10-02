# /cc-dispatch 全流程模擬：cal2027（2027 台灣／香港月曆）

日期：2026-10-01｜主 agent＝發包者（照 `commands/cc-dispatch.md` 逐步執行）＋觀察者｜沙盒在 session scratchpad，未對外推送。

## 結論

流程**跑得通，也收斂**：2 波、4 條 task、6 次驗收、2 條各退 1 次後合併、`spec_merge.py --apply` 歸檔，最終 main 19 測 19 過。
但這次跑出**一個會讓產品沒做完卻全綠的結構性洞**（§2 F1），而且長任務不能自主，原因是規則本身的停點設計，不是技術做不到（§2 F2）。

## 1. 跑了什麼

| 步驟 | 結果 |
|---|---|
| from-plan | 計畫檔 → `spec.md`（4 Requirement／4 Scenario）＋`tasks.md`（2 波 4 條）＋`gate.env`；`spec_merge.py check` 綠 |
| 第 1 波 | 1.1 台灣資料（PR #2）r1 merge；1.2 月曆計算（PR #3）r1 fix-needed（時區測試方向錯）→ r2 merge |
| 第 2 波 | 2.1 香港資料（PR #5）r1 merge；2.2 頁面（PR #6）r1 fix-needed（香港沒內嵌、測試 skip 不紅）→ r2 merge |
| 收輪 | sync 打勾 → 記帳經 PR 合進 main ×2 → `spec_merge.py --apply`（+4 Requirement）→ `git mv` 歸檔 |

模擬替換：Cursor cloud agent → 本機 subagent（各自 clone 假 origin）；GitHub PR → `refs/pull/N/head`＋PR 檔；
「每波同意／每次合併問使用者」→ 使用者本輪事前授權；「一波一個 session」→ 同一 session 跑完（偏離，見 F2）。
`tools/gate.sh` **原封不動可用**。

成本：12 次 subagent 呼叫（執行 4＋追問 2＋驗收 6），合計約 1.1M subagent token；每次 1–7 分鐘。

產物：沙盒 repo `…/scratchpad/sim/dispatcher`（session 結束即消失）；單檔預覽 `…/scratchpad/sim/cal2027-preview.html`。
資料來源（執行者與驗收員各自獨立查核一致）：台灣＝人事行政總處 116 年辦公日曆表 CSV（24 筆、全年放假 121 天、無補班）；
香港＝GovHK 2027 公眾假期＋政府新聞公報 2026-05-15 刊憲（17 筆，不含「每個星期日」）。

## 2. 發現（依嚴重度）

### F1｜Requirement 本文寫了行為，Scenario 只驗骨架 → 全綠但沒做完（嚴重）
- 現象：「月曆頁面」Requirement 寫「可切換台灣／香港／兩地…放假日標紅並顯示名稱…」，唯一 Scenario 只驗「三個切換鈕、12 個月區塊」。
  2.1、2.2 同波併發，2.2 開工時香港資料不存在 → 頁面內嵌 `null`、測試 skip。預演 #5＋#6 一起合：**17 過 0 紅 1 skip，香港在頁面上是空的**，
  四條全勾後 `spec_merge.py` 照樣會把「可切換香港」併進 SPEC.md。
- 誰抓到的：PR #6 驗收員——**靠的是超出規則字面的主動性**（規則只要求「逐條核對 Scenario」）。嚴格照字面執行就會漏。
- 根因三條疊加：(a) from-plan 只要求「每個可觀察結果至少一個 Scenario」，一條 Requirement 塞多個子句只配一個 Scenario 也算合格；
  (b) from-plan 沒推演同波 task 之間的資料依賴；(c) 測試用 skip 表達「依賴還沒到」，gate 只看退出碼。

### F2｜長任務不能自主：停點是規則設計出來的（嚴重，回應「長任務能不能自己做下去」）
這次 2 波 4 條，照規則要停下等人 **7 次**：每波開工同意 ×2、每次合進 main 前當輪確認 ×4（BASE＝main）、加上波次切換要開新 session ×1。
停點數 ≈ 波數＋task 數，task 越多越不能放著跑。同一 session 連跑 2 波在模擬中沒出問題（被叫醒機制正常、脈絡夠用）。

### F3｜BASE 移動後不重閘（中，BACKLOG #15「stale-base」的實證）
同波的 PR #3、#6 都是在另一條先合進 main **之後**才合，閘卻是合併前跑的。#3 碰巧沒事；#6 的過期基底正是 F1 的觸發點。
規則第 4 步只看 `gh pr checks`；repo 沒裝 CI 時這個洞直接開著。

### F4｜BLOCKER 門檻沒定義 → 驗收不可重現（中）
PR #3 驗收員把「Scenario 外的測試弱點」（時區方向）判 BLOCKER；PR #2、#5 驗收員把同類弱點（mutation 漏 2/11、檔名錯→skip→綠）判「非阻擋」。
同一套規則，換一個驗收員結論就不同。

### F5｜非阻擋建議、`## 學到的`、介面約定都沉進檔案（中）
- 三位驗收員各自發現「skip＝靜默通過」，都寫成非阻擋，沒有機制升格成待辦。發包者照規則只讀檔頭兩行。
- `monthGrid` 的 month 是 1–12、香港不列「每個星期日」、file:// 必須內嵌資料——全是**介面約定**，只寫進 PR 的 `## 學到的`，
  `spec.md` 沒改（執行者認為「沒寫」不等於「寫錯」）。歸檔後的 SPEC.md 缺這些約定。
- `## 學到的` 有一條原本是錯的（時區推論），是 r1 驗收員擋下來的；loop engine 若做「學到的撈回」，這就是錯誤知識的傳播路徑。

### F6｜「驗：」強度不夠時沒有提示（低）
2.2 本質是 UI，計畫寫「不用瀏覽器」，from-plan 照抄。驗收員 mutation 漏掉的 4/16 全是 DOM 接線與 375px 溢出——Node 字串比對驗不到。
資料型 task（1.1、2.1）的「驗：」只驗格式，事實正確性**只有驗收員上網查一道防線**，不可重跑。

### F7｜小缺口（低）
- `templates/docs/changes/README.md` 末段宣稱「`git commit` 會自動跑 `spec_merge.py check`」——hook 不隨 git clone 傳，對 cloud agent 永遠不成立（執行者回報）。
- from-plan 不提 `gate.env`，驗收第 1 步才「沒有就建」；那時工單已合進 BASE，新建檔會撞上「記帳檔以外有改動就停」。
- 「沒有 CI」的處理：PR 合進 BASE 那串有寫（直接下一步），驗收第 4 步沒寫。
- change 進行中要追加 task（例如 2.2 執行者提議另開一條同步）沒有程序；這次因修法落在所有權內而免了。
- 一波沒跑完前，`runs.md`、`reviews/` 只在發包者本機，session 斷掉就丟。

### 運作良好的部分（不要改）
契約 prompt 逐字可用；PR 標題 `<slug> N.M:` 讓 sync 對帳零歧義；所有權 6/6 被遵守；追問迴圈每次 1 輪就收斂；
對抗型驗收員抓到 2 個真缺陷（時區測試、香港沒內嵌）；`gate.sh` 可攜。

## 3. 優化建議（依投報比排序）

| # | 改什麼 | 改哪 | 治 | 規模 |
|---|---|---|---|---|
| S1 | from-plan：Requirement 本文**每個子句**要對到一個 Scenario，對不到就拆 Requirement 或補 Scenario；驗收第 2 步改成「核對 Requirement 本文每個子句＋每條 Scenario」 | `commands/cc-dispatch.md` from-plan 第 2 步、驗收第 2 步；`templates/docs/changes/README.md` | F1 | 小 |
| S2 | from-plan 加一步：列出每條 task **讀誰產出的檔**；同波有讀寫依賴就移到後一波，並在確認時點名 | `commands/cc-dispatch.md` from-plan 第 2 步 | F1 | 小 |
| S3 | 契約加一條：「不准用 skip 表達依賴未到；依賴未到＝工單切錯，回報」；驗收員把 skip>0 當 BLOCKER | 契約 prompt、驗收第 2 步 | F1、F5 | 小 |
| S4 | 合併前比對 BASE：`gate.sh` 印出它試合的 BASE sha，發包者合併前 `git rev-parse origin/<BASE>` 不同就重跑閘 | `tools/gate.sh`、驗收第 4 步 | F3（＝BACKLOG #15 一角） | 小 |
| S5 | 定義 BLOCKER：Scenario 或 Requirement 子句不成立／越出所有權／`## 驗` 不實／skip>0。其餘一律非阻擋 | 驗收第 2 步 | F4 | 小 |
| S6 | **整個 change 一次同意**：多波 change 預設 `gate.env` 的 `BASE=dispatch/<slug>` 整合分支，波內合併不問；只在開工問 1 次、整合分支合進 main 問 1 次。停止條件寫死：第 3 輪不過、`failed`、越權 | `commands/cc-dispatch.md` 開頭與第 3 步、驗收第 4 步 | F2 | 中 |
| S7 | 拿掉「一波一個 session」，改成「波次結束寫一行進 `runs.md`（已合、待派、下一步）」，session 斷了從 runs.md 接；每次合併後就經 PR 記帳 | `commands/cc-dispatch.md` | F2、F7 | 小 |
| S8 | 收輪（cc-close ③）掃 `reviews/*.md` 的非阻擋建議與各 PR `## 學到的`：介面約定 → 補進 SPEC.md；跨任務坑 → BACKLOG | `commands/cc-close.md` | F5 | 中 |
| S9 | from-plan 確認時點名「驗：驗不到 Requirement 的 task」（UI 沒開瀏覽器、資料只驗格式），標 `[需確認]` 讓使用者決定要不要補驗法 | from-plan 第 4 步 | F6 | 小 |
| S10 | README 改寫 hook 宣稱；`gate.env` 範本預設 `GATE_1="python3 scripts/spec_merge.py check ."`；from-plan 一併建 `gate.env` | `templates/docs/changes/README.md`、from-plan | F7 | 小 |

S1–S5、S7、S9、S10 合起來約 **1 輪 session 含測試**；S6、S8 各約 1 輪。S6 是 loop engine 的實際前置——
decisions.md:51 的條件「第一個 change 由 LLM 逐步跑通」這次在模擬中算達成（但走的是本機 subagent，不是 Cursor）。

修正狀態（2026-10-02）：S6、S7＝`c5e4b3d`／`e9d7d2f`；S4 輕量版＝`23acea6`；S1、S2、S3、S5、S8、S9、S10＝0.4.9（`docs/changes/dispatch-acceptance/`）。

## 4. 附：原始觀察
逐條紀錄在 `…/scratchpad/sim/observations.md`（42 行，session 結束即消失；要點已全部收進 §2）。

## 5. 第二次：新規則（0.4.8）＋真派 Cursor

repo：`roylam-beep/cal2027-dispatch-sim`（私人）｜整合分支 `claude/cal2027`｜同一份工單（2 波 4 條），刻意不改以便比較。

| 項目 | 第一次（舊規則、本機 subagent） | 第二次（新規則、真 Cursor） |
|---|---|---|
| 停下等使用者 | 照規則 7 次 | **1 次**（整合分支合進 main 前） |
| 執行者 | 本機 subagent | Cursor cloud agent ×4，每條 229–432s |
| 驗收第 1 輪 fix-needed | 2／4 | 0／4 |
| 香港沒進頁面（F1） | 發生，驗收員抓到 | **沒發生**——2.1 先合，2.2 照契約推前 `git merge origin/<BASE>` 才把香港內嵌進去；是時序剛好，F1 的洞仍在 |
| 最終 | 19 測全過 | 10 測全過、0 skip，PR #5（`claude/cal2027` → main）待使用者 |

新觀察：
- Cursor 4 個 PR 有 3 個開成 **draft**，`gh pr merge` 對 draft 會失敗；驗收第 4 步已補「先 `gh pr ready`」。
- 同波 PR 合進後 BASE 會變；這次每次合併前手動重跑閘，驗收第 4 步已補「BASE 有新合併就重跑閘」（S4 的輕量版）。
- 1 位驗收員開瀏覽器卡住 600s 被砍，照規則重派一次就過；重派版要求「先寫佔位檔頭、邊查邊寫、不開瀏覽器」。規則沒寫怎麼避免再卡。
- 規則要驗收員用 `isolation: "worktree"`，但發包者 session 的 cwd 不在工單 repo 時 worktree 開錯地方；這次改成驗收員自己 clone。
- 本 session 載入的仍是舊版 cc-cursor（plugin 更新要重開 session），發包者照 cc-cursor 步驟直接呼叫 `cursor_*`。
- 測試強度（F6）照舊：資料檔「日期錯、漏一筆」仍抓不到，驗收員都判非阻擋。
