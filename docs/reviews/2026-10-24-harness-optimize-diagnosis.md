# harness 優化診斷（2026-10-24）

> 唯讀診斷，未改任何檔、未 commit。基準：`362c34b`。
> 範圍：本 repo 的 plugin（`commands/`、`hooks/`、`tools/`、`templates/`、`test/`）、`docs/`、`BACKLOG.md`、`handovers/`，
> 以及帳號層 `~/.claude/CLAUDE.md`、`~/.claude/output-styles/eli5.md`（只讀）。
> 標 **〔帳號層，需使用者核准〕** 的條目落點在 `~/.claude/**`，依帳號 `CLAUDE.md:42-43` 要使用者點頭才能改。
> 規模用 session 輪數：小＝本輪順手、中＝約 1 輪含測試、大＝2–3 輪。

## 方法

- **plugin 本體的過度工程**：照 `commands/cc-audit.md` 的準則（五個標籤、四個問法、不准砍清單），
  由一個子 agent 審，**沒有直接用 Skill 工具叫 `/cc-harness:cc-audit`**。原因：`cc-audit.md:5` 宣告
  `disallowed-tools: Write, Edit`，而 `docs/decisions.md:403-405` 實測過「唯讀 skill 一載入，同一輪剩下的 Write 都被拒」——
  照字面叫它，本輪就寫不出這份檔（見第 A5 條）。子 agent 的行號已抽驗。
- **規則衝突與踩坑**：逐條對照帳號 `CLAUDE.md`、`eli5.md`、`docs/decisions.md`、`BACKLOG.md`、近期 `docs/reviews/`、`handovers/`。
- 標 `[待驗]` 的是推論，沒有實測。

## 最優先 3 條

1. **A1** 事後審查找到的唯一安全缺口（遠端寫入沒人擋）沒有被記在任何地方——BACKLOG 滿了就丟。
2. **A2** 冰山第 6、7 條與桌面 app 的收尾工具打架；第 6 條使用者 10-18 已決定刪，10-20 回溯又加回去，兩條決定沒對帳。
3. **B1** `test/run-all.sh` 宣稱任一項紅就整支紅，但 `guard-bash` 與 `spec_merge` 的單元測試紅了照樣印 `ALL GREEN`——修 A1 之前要先補。

次優先：**A3** `docs/decisions.md` 38 條「翻案條件／死法」沒有任何程序去檢查，`tools/gate.sh` 那條在本 repo 看起來已成立。

---

## A. 規則副作用、規則衝突、實際踩坑

### A1. 遠端寫入沒閘，而且這個缺口沒被追蹤
- **證據**：`docs/reviews/2026-10-21-blog-audit-session-postmortem.md:87-88` 建議 `guard-bash.mjs` 加「遠端寫入」一類
  （`rsync`／`scp` 目的地含 `host:`、`ssh … 'wp db import'`），並寫「`BACKLOG.md` 已滿 12 條，沒加；收輪時再排」。
  `grep -n 'rsync\|scp\|遠端寫入' BACKLOG.md docs/archive/ICEBERG.md hooks/guard-bash.mjs` 零筆。
  上限規則在 `BACKLOG.md:3`，由 `tools/check_docs.py` 守。
- **影響**：該次事故差一步蓋掉別人整個新站資料庫；同樣的指令今天在 auto mode 仍然直接放行。
  「BACKLOG 上限」這條規則的副作用是把真正重要的發現擋在門外——而佔位的是 A9 那些可能已過期的條目。
- **建議修法**：①先把這條寫進 `BACKLOG.md`（同時清掉 A9 的過期條目騰位）；②`guard-bash.mjs` 加遠端寫入類，回 `ask` 不回 `deny`；
  ③`BACKLOG.md:3` 補一句「安全相關的發現不受上限，滿了就先排水再加」。
- **規模**：①小；②中，約 1 輪含測試（`test/guard-bash.test.mjs` 要補正反例）。

### A2. 冰山第 6、7 條與 app 收尾工具打架；第 6 條的兩次決定互相矛盾 〔帳號層，需使用者核准〕
- **證據**：
  - `~/.claude/CLAUDE.md:35` 第 6 條「結尾不接反問或新提案」；app 的 `wrap_up` 要求「有待決事項時帶一個問題＋按鈕」，
    並要求範圍外的後續工作用 session 提案卡提出——兩者正面衝突。
  - `docs/decisions.md:406`（10-18，`cc-next`）：「結尾那一問與冰山第 6 條衝突；**使用者定案刪掉第 6 條**」。
  - `docs/decisions.md:188`（10-20 回溯）：「補回……第 6 條」，沒提 406 那條決定，也沒處理它。
  - `~/.claude/CLAUDE.md:36-37` 第 7 條說「`wrap_up` 帶 `ask` 會直接結束該輪，之後的文字不顯示」，
    要求先寫正文再叫收尾工具；但 app 目前的工具說明是「收尾訊息寫在 `wrap_up` **之後**；寫在之前的可能被截成摘要」。方向相反。
  - 仲裁序 `~/.claude/CLAUDE.md:5-13` 沒有把「平台／app 的工具契約」列進去，模型只能自己權衡，而規則寫著「不要自己權衡」。
- **影響**：前一個 session 觀察到回覆下方的「下一步」方塊不再出現（app 的 `prompt_suggestions` 是 On）。
  第 6 條讓模型收尾時不帶 `ask`／`actions`，app 就只畫摘要或不畫方塊——**這個因果是推論 [待驗]**。
  第 7 條如果過時，會讓模型把交付內容寫在會被截斷的位置。
- **建議修法**：
  1. 第 6 條改成「結尾不接**開放式**反問（『還需要什麼嗎？』）；app 的 `wrap_up` 問題／按鈕、session 提案卡、skill 本文規定的提問不在此限」，
     或照 10-18 的決定直接刪。
  2. 第 7 條先實測一次：同一輪 `wrap_up` 帶 `ask` 後再寫一段字，看使用者端顯示不顯示；結果寫進 `docs/decisions.md`，再改條文。
  3. 仲裁序加一句：「宿主 app 的工具用法說明（`wrap_up`、`AskUserQuestion` 等）不是規則衝突，照工具說明」。
  4. `docs/decisions.md:406` 補一句「已被 10-20 回溯推翻」或把 188 改寫成例外，讓兩條不再互斥。
- **驗證法（判定 [待驗] 的因果）**：挑 3 個 10-20 之後、使用者回過「好／照做」的 session，看那幾輪 `wrap_up` 有沒有帶 `ask`。
  沒帶＝規則壓掉了按鈕；有帶＝問題在 app 端。（`search_session_transcripts` 看不到工具參數，要從 transcript 檔讀。）
- **規模**：小（條文改寫＋一次實測），但要使用者核准。

### A3. 38 條「翻案條件／死法」沒人檢查，至少一條看起來已經成立
- **證據**：`grep -c '翻案條件\|死法' docs/decisions.md` → 38；`grep '翻案\|死法' commands/cc-close.md` → 0（收輪程序不看它們）。
  `docs/decisions.md:27`：「**死法**：連續 3 個歸檔的 change 沒有 `reviews/` → 刪 `tools/gate.sh`、`test/gate.test.sh` 與 cc-dispatch 驗收節」；
  `find docs/archive/changes -type d -name reviews` → 0 個，共 10 個歸檔 change。
- **影響**：每條規則進來時都寫了「什麼情況要拆」，但沒有任何時點會去比對——規則只進不出，正是 `cc-audit.md` 說要防的事。
  `gate.sh` 那條若成立，等於有一支工具＋測試＋一節派工流程在白養。
  （保留：`gate.sh` 也可能在別的 repo 的派工被用到、reviews 留在那邊 [待驗]。）
- **建議修法**：`/cc-close` 第 ② 步加一行：「`grep -n '翻案條件\|死法' docs/decisions.md`，逐條判一字：未觸發／觸發→本輪處理／無法判定」，
  結果記進 `rounds.md`。`gate.sh` 那條先去派工最多的 repo 看有沒有 `reviews/`，沒有就照死法刪。
- **規模**：小（cc-close 加一步）；處理 `gate.sh` 中。

### A4. `docs/decisions.md` 自己的格式規則失守，而且有一段被拼錯位置
- **證據**：
  - `docs/decisions.md:1-3` 寫「一條一行，不敘述過程；過程與理由留在 commit 訊息」，實際 427 行、45,807 bytes，多數條目 5–10 行且含完整理由敘述。
  - `docs/decisions.md:385-394`：10-20「移除 push 前 gate」那條中間夾了 389-393 行——那是 10-18「gate 掛 push 前」的理由與翻案條件
    （`git log -L` 顯示來自 `2243482`，`5f07a1d` 插入時切開）。結果一條決定有兩組「翻案條件」，後一組描述的是已被移除的機制。
- **影響**：SSOT（唯一事實來源）讀起來會誤判現況；每次要查一條決定得讀完整段敘述。
- **建議修法**：把 389-393 搬回 10-18 那條；下次收輪對 decisions 做一次「只留現況＋翻案條件，理由改成指 commit hash」的瘦身。
- **規模**：搬回小；整份瘦身中，約 1 輪。

### A5. `cc-audit` 宣告唯讀，卻擋住「審完寫成報告檔」這個最常見的用法
- **證據**：`commands/cc-audit.md:5` `disallowed-tools: Write, Edit`；`cc-audit.md` 邊界節寫「一次性報告，不建任何檔」；
  帳號 `CLAUDE.md:30` 冰山第 2 條要求「細節不貼進對話——寫檔，回覆附路標」；`docs/decisions.md:403-405` 實測唯讀 skill 會擋掉同一輪剩下的 Write。
- **影響**：照冰山第 2 條，審查結果該寫檔；照 cc-audit 本文，不准寫檔、工具也真的寫不了。兩條規則必有一條被違反；本次診斷只能繞道用子 agent。
- **建議修法**：`cc-audit.md` 拿掉 `disallowed-tools`，改成本文一句「不改被審的檔；使用者要報告時可寫 `docs/reviews/`」（`cc-next` 已用同一招，`decisions.md:403`）。
- **規模**：小。

### A6. 規則改了不量就再改：10-18 瘦身、10-20 回溯都沒實測
- **證據**：`docs/decisions.md:191`「行為差異要新 session 才看得到，未實測」；`handovers/2026-10-20-guards-removed.md:16-27` 的下一輪工作就是「量 R16 改動的效果」，
  `git log` 之後沒有對應 commit。`~/.claude` 的 `git log -- CLAUDE.md output-styles/eli5.md` 在 10-17～10-20 之間 9 個 commit。
- **影響**：同一份偏好來回改，每次靠一兩個印象下判斷；A2 的矛盾就是這樣產生的。
- **建議修法**：帳號規則改動前先跑 handover 那份量測（抽 3 個 session 量回覆長度、看 `wrap_up` 是否帶 `ask`、是否主動畫圖），一次只改一個變數。
- **規模**：中，約 1 輪（純量測）。

### A7. 同一個「要精簡」的偏好有 4 份 〔帳號層，需使用者核准〕
- **證據**：組織指令第 2、3、8 條；`~/.claude/CLAUDE.md:28`（冰山第 1 條）；`~/.claude/CLAUDE.md:34`（第 5 條）；`~/.claude/output-styles/eli5.md:9-10`
  （自己還註明「與冰山憲法第 1 條一致」）。`docs/decisions.md:181` 早已點名「同一偏好有 3–4 份，衝突靠仲裁序解」。
- **影響**：每份措辭略不同，模型在三處之間權衡；改一處不改其他處就走針（A2、A6 都源自這裡）。
- **建議修法**：`eli5.md:9-10` 刪成一行指標「長度規則見帳號 CLAUDE.md 冰山第 1、2 條」，只留 eli5 獨有的「回覆給路徑＋3 行摘要」。
- **規模**：小。

### A8. eli5 禁止內部代號，但 skill 的輸出格式本身就是代號 〔部分帳號層〕
- **證據**：`~/.claude/output-styles/eli5.md:15-16` 禁止原樣輸出 gate、L0–L3、紅隊、收輪、閘…，「skill 規定的輸出格式裡有也一樣」；
  `commands/cc-audit.md` 輸出格式規定以 `delete:`／`dup:`／`yagni:` 標籤開頭；`cc-root` 的 L0–L3 分級同理。
- **影響**：每次 skill 輸出都要模型臨場翻譯，翻譯品質不一；skill 與 output style 長期互相拉扯。
- **建議修法**：在源頭改 skill 的輸出格式用白話標籤（例：`delete:`→「可刪：」），eli5 那句就能刪。
- **規模**：中（要動多支 skill 的輸出節與 `test/test_skills.py` 的對應檢查）。

### A9. BACKLOG 有過期與重號條目，佔住 A1 需要的位子
- **證據**：`BACKLOG.md:18-19` 兩條都編 #18；`BACKLOG.md:23` #22 說 5 個 repo 卡在 0.4.18，
  但 `claude plugin list` 目前列出的 project scope 全是 0.4.53 [待驗：該欄位是否反映 project scope 實際載入版本]；
  `BACKLOG.md:17` #17 同一類問題。
- **影響**：上限 12 條是滿的，排水規則是「滿了才排」，所以過期條目不會自己離開。
- **建議修法**：逐 repo 驗 #22、#17，成立就移 ICEBERG（done）；重號改成 #23。
- **規模**：小。

### A10. memory 仍然零備份（10-17 審查列為第一優先，沒做、也沒追蹤） 〔帳號層，需使用者核准〕
- **證據**：`docs/reviews/2026-10-17-mods-hooks.md:12,21-28`（觀察到 memory 檔消失，列為第 1 件）；
  `~/.claude/.gitignore:27` 仍排除 `/projects/`；`~/.claude/settings.json` 沒有 `cleanupPeriodDays`；`git -C ~/.claude ls-files | grep -c memory` → 0。
  BACKLOG 與 ICEBERG 都沒有這條。
- **影響**：harness 的教訓有一部分只存在 memory，掉了就沒了。
- **建議修法**：`.gitignore` 白名單 `projects/*/memory/`（先確認 `dotclaude` remote 維持 private），或設 `cleanupPeriodDays`。
- **規模**：小。

### A11. memory 指向已刪的檔
- **證據**：`~/.claude/projects/-Users-roy-mac-Documents-3-AGENT-cc-harness/memory/MEMORY.md:7` 與
  `account-layer-write-observations.md:11` 說「邊界規則唯一權威是 `hooks/guard-userlevel.mjs` 檔頭」；該檔已在 `4f5bacd` 刪除，權威已回到帳號 `CLAUDE.md:39-46`。
- **影響**：下個 session 照 memory 去找一個不存在的檔。
- **建議修法**：兩處改指 `~/.claude/CLAUDE.md`〈帳號層寫入邊界〉（memory 可由 agent 直接改）。
- **規模**：小。

### A12. 交接單只開不關，命名兩支不一致
- **證據**：`git grep -n '狀態：open' handovers` → 10 份（共 16 份）；最新一份 `handovers/2026-10-20-guards-removed.md:14` 自承「別的 session 留下的 open 交接單本輪沒對帳」。
  檔名規則 `commands/cc-close.md:51-52`（`<session-slug>.md`）vs `commands/cc-handover.md:20`（`YYYY-MM-DD-<slug>.md`），
  `docs/reviews/2026-10-18-hardcode-audit.md:152` 已點名，未修。
  接手後怎麼處理也三處不一：`templates/handovers/README.md:7`「刪掉自己接的那份」vs `commands/cc-handover.md:41-42`「狀態改 `done`，不刪」；
  `commands/cc-handover.md:49`「14 天仍 open → 收輪標 abandoned」在 `commands/cc-close.md` 沒有對應步驟。
- **影響**：接手的 session 分不出哪份還有效；「open」狀態失去意義。
- **建議修法**：`/cc-close` 開頭把 `狀態：open` 逐份判 closed／superseded；兩支檔名規則統一成一份。
- **規模**：小。

---

## B. plugin 本體的過度工程（cc-audit 準則）

子 agent 照 `commands/cc-audit.md` 審 `commands/`、`hooks/`、`tools/`、`test/`、`templates/`、`types/`、`README.md`、`SPEC.md`；
B1–B4、B8–B11、B13 的行號已由本 session 再 `sed -n`／`grep -n` 抽驗；B5–B7、B12 未逐條重驗。
交接單相關兩條（範本說「刪檔」vs `cc-handover.md:41-42` 說改 `done`；`cc-handover.md:49`「14 天 open 標 abandoned」在 `cc-close.md` 沒有對應步驟）併入 A12。

### B-1. 正確性與誤導（先修）

#### B1. `test/run-all.sh` 宣稱「任一項紅就整支紅」，兩支測試紅了卻擋不住
- **證據**：`test/run-all.sh:2,4`（`set -e`）；`:23` `python3 test/spec_merge.test.py 2>&1 | tail -1`；`:34` `node test/guard-bash.test.mjs … | grep … || true`。
  沒有 pipefail 時管線退出碼取最後一段，`:34` 還多一個 `|| true`。`:31-32` 用「跑兩次、第二次取退出碼」繞過同一問題，表示 23、34 是漏修。
- **影響**：`spec_merge` 與 `guard-bash`（安全守衛）的單元測試紅了，整包仍印 `ALL GREEN`。A1 若要改 `guard-bash.mjs`，這個洞會讓回歸測試形同虛設。
- **建議修法**：照 `:31-32` 的寫法各補一行 `>/dev/null` 重跑取退出碼。
- **規模**：小。

#### B2. `commands/cc-harness.md:95` 的體檢會叫使用者刪掉現在正確的規則
- **證據**：它把 `AGENTS.md`「`/cc-gate` … 使用者叫才跑」判為舊句、指向 `/cc-gate`〈push 前〉；該節已不存在，push 前 gate 已在 `4f5bacd` 移除（`docs/decisions.md:385`），「使用者叫才跑」正是現行規則。
- **影響**：照體檢回報去改的使用者會刪掉對的規則。
- **建議修法**：刪這一行。**規模**：小。

#### B3. skill 的 description（常駐清單）與本文矛盾
- **證據**：`commands/cc-cursor.md:2`「使用者直接打一律先問」vs `:28`「不問……都已經是同意，包含花費」（也與 memory `dispatch-command-is-consent` 相反）；
  `commands/cc-gate.md:2`「缺陷當場修，最多兩輪」「verify before push」vs `:20-24`「不改被測物……想動手修就是搞錯角色」，兩句都是已作廢規則（`docs/decisions.md:374,385`）。
- **影響**：模型挑 skill 時只看 description，會照作廢規則做。
- **建議修法**：兩支 description 改成跟本文一致。**規模**：小。

#### B4. 三處說有「freshness hook／SessionStart hook 讀基準行」，實際沒有
- **證據**：`commands/cc-close.md:54`、`commands/cc-handover.md:23`、`templates/handovers/README.md:5`；`hooks/hooks.json` 只掛兩個 hook，`hooks/session-start.sh:31-35` 只算字元數。
- **影響**：大家以為交接單過期會有機器提醒，實際沒有，只開不關（A12）就是這樣累積的。
- **建議修法**：改掉「hook 會讀」的說法，基準行保留（`cc-close.md:28` 還在用）。[待驗] 個別 repo 可能有自己的 session-start。**規模**：小。

#### B5. 補勾方法互相矛盾
- **證據**：`templates/docs/changes/README.md:42` 用 `gh pr list --search` 補勾；`commands/cc-dispatch.md:137` 明說不要靠 `--search`（索引延遲會漏）。
- **影響**：照範本補勾的人會漏勾剛合併的 task，派工停在半路。
- **建議修法**：範本改成依 `gh pr view` 補勾。**規模**：小。

#### B6. `SPEC.md:9-18` 規範的是別的 repo（cursor-api MCP）的行為
- **證據**：與 `SPEC.md:4-5` 自己宣告的範圍（只記本 repo 的 tools／hook）不符。[待驗] 可能是歸檔時從別的 repo 的 change 合進來。
- **影響**：讀 SPEC 的人會以為本 repo 有這段程式；`spec_merge` 之後的 MODIFIED 會對錯對象。
- **建議修法**：移出或刪掉。**規模**：小。

#### B7. 文件與實況不符的零碎處
- `README.md:16`「三個 hook」實際兩個；`:12-26` 目錄漏 `tools/gate.sh`、`tools/spec_merge.py`、`tools/marketplace-repo.sh`、`hooks/code-path.mjs`、`SPEC.md`、`BACKLOG.md`；
  `:24,45` 稱 `run-all.sh` 為「整包閘／push 前」，`test/run-all.sh:2` 自稱「快閘（commit 前）」。
- `tools/check_docs.py:33` 建議把規則搬到 `docs/round.md`，但 `commands/cc-close.md:9` 已宣告不讀它。
- `hooks/guard-bash.mjs:5`「掛在 repo 內 `.claude/settings.json`」與同檔 `:2-3`（plugin `hooks.json` 掛）矛盾；`hooks/code-path.mjs:1` 還寫「cc-watch 在用」；`.claude-plugin/plugin.json:4` 寫「感測 hook」。
- **影響**：新讀者照 README／檔頭找東西會找錯或找不到；`check_docs.py` 的建議把人導向已廢的檔。
- **建議修法**：各改一行。**規模**：小（合併成一個 commit）。

### B-2. 過度工程（砍掉不損現有功能）

#### B8. cc-watch 整組停用後的殘骸 〔要使用者拍板〕
- **證據**：`hooks/hooks.json` 已無 `modules`（`c3ee10c`）；`test/run-all.sh` 沒有任何一行跑 `test/cc-watch.test.tsx`（`grep -rn cc-watch.test test tools` 無呼叫）；
  `hooks/code-path.mjs` 只剩 `parseList` 有活呼叫（`hooks/guard-bash.mjs:91`）；`types/index.d.ts:18-26` 只給 cc-watch 用。
  但 `docs/decisions.md:242-243` 明寫「原始碼與測試留著，要恢復就加回 modules」。
- **影響**：約 790 行、35k bytes 沒在跑也沒在測；而且測試已不被執行，留著也不保證能「加回就好」。
- **建議修法**：整組刪，`parseList` 搬進 `guard-bash.mjs`，decisions 的恢復方式改成「`git revert <刪除 commit>`」。
- **規模**：小。

#### B9. 14 支 skill 的 description 太長，每個 session 常駐
- **證據**：`commands/cc-dispatch.md:2` 775 字元，幾乎重講整個流程；`commands/cc-show.md:2` 471 字元；14 支合計約 4,800 字元。
- **影響**：每個 session 開場都先付這筆字元，且內容與本文重複，兩邊改一邊就走針（B3 就是這樣來的）。
- **建議修法**：description 只留「何時用＋一句做什麼＋EN 別名」，cc-dispatch 壓到約 150 字元。約 −1,500～−2,000 字元／session。
- **規模**：小～中（`test/test_skills.py` 若有 description 檢查要一起看）。

#### B10. `templates/AGENTS.md:12` 把派工規則裝進每個 repo 的常駐層
- **證據**：段首自寫「用 `/cc-dispatch` 派工的 repo 才適用」，約 330 字元；內容與 `commands/cc-dispatch.md:27,111` 重複。
- **影響**：沒用派工的 repo 每個 session 也付約 330 字元。
- **建議修法**：縮成一行路標。[待驗] `cc-dispatch.md:27` 寫「`templates/AGENTS.md` 允許」整合分支直推，可能要靠專案層文字覆蓋帳號層的「push 要問」——縮之前確認授權還成立。
- **規模**：小。

#### B11. `test/test_skills.py` 的死碼與空機制
- **證據**：`:123-124` 算 `can_write`、`:131-134` 是註解掉的斷言、`:135` `del can_write`；`:18-21` `KNOWN_GAPS = {}` 與 `:179-190` 的反向守護，清單一直是空的。
- **影響**：讀測試的人要先搞懂一段不會執行的邏輯。
- **建議修法**：刪死碼；`KNOWN_GAPS` 拿掉，真有缺口再加。約 −30 行。**規模**：小。

#### B12. 重複敘述
- `hooks/guard-bash.mjs:56-66` 檔頭逐條列負向案例，與 `test/guard-bash.test.mjs` 同一份事實 → 改一行指標。
- `commands/cc-audit.md:15-16`〈為什麼有這支〉與文末〈防什麼〉同一句 → 刪前者。
- `commands/cc-explain.md:62-86`〈參考範本〉重述 `:16-51`〈寫法〉→ 留一份。
- `commands/cc-dispatch.md:63` 舊版 `MAX_CONCURRENT` 相容句（現行範本已改 `gate.env`）→ 刪；`:160` 與 `:143` 重複提醒 → 改指標。
- `README.md:82` 版控節的 cc-dispatch 說明放錯節、與 description 重複 → 刪。
- **影響**：同一事實兩份，改一份另一份就過期。
- **規模**：小（合計約 −40 行、−1k 字元）。

#### B13. 出處不明的標記 [待驗]
- `CC_REVIEWER_MODEL` 只在 `commands/cc-gate.md:13` 讀，沒有任何範本或設定檔設它（`docs/reviews/2026-10-18-hardcode-audit.md:17` 只是列名）；`harness W7.3`（`hooks/guard-bash.mjs:416`、`test/guard-bash.test.mjs:1`）、「原則 5／6」（`tools/install-hooks.sh:3`、`templates/README.md:3-4`）查不到出處。
- **影響**：讀者無法回查來源，標記本身沒提供資訊。
- **建議修法**：查到出處留，查不到拿掉。**規模**：小。

### 不列的
- 各支 `allowed-tools`：`docs/decisions.md:169,426` 實測它是「預先放行、減少權限提示」，是真功能。
- `guard-bash.mjs` 主體與測試：安全紅線＋邊界反例。
- `cc-claude`／`cc-cursor` 相近的「不問」段：skill 之間不能互相引用，不算重複。

**net（B-2）**：含 B8 約 −840 行、−40k 字元；不含 B8 約 −50 行、−4k 字元，其中每 session 常駐約 −2k 字元，每個安裝 repo 另省約 −300 字元。

---

## 總表

| # | 一句話 | 規模 | 落點 |
|---|---|---|---|
| A1 | 遠端寫入沒閘且沒被追蹤 | 小＋中 | repo |
| A2 | 冰山第 6、7 條與 app 收尾工具打架 | 小 | 帳號層 |
| A3 | 38 條翻案條件沒人檢查 | 小～中 | repo |
| A4 | decisions.md 格式失守＋一段拼錯位置 | 小～中 | repo |
| A5 | cc-audit 唯讀擋住寫報告 | 小 | repo |
| A6 | 規則改了不量就再改 | 中 | 流程 |
| A7 | 精簡偏好 4 份 | 小 | 帳號層 |
| A8 | eli5 禁代號 vs skill 輸出格式 | 中 | repo＋帳號層 |
| A9 | BACKLOG 過期／重號 | 小 | repo |
| A10 | memory 零備份 | 小 | 帳號層 |
| A11 | memory 指向已刪檔 | 小 | memory |
| A12 | 交接單只開不關、規則三處不一 | 小 | repo |
| B1 | run-all 假綠 | 小 | repo |
| B2 | 體檢叫人刪正確規則 | 小 | repo |
| B3 | description 與本文矛盾 | 小 | repo |
| B4 | 不存在的 freshness hook | 小 | repo |
| B5 | 補勾方法矛盾 | 小 | repo |
| B6 | SPEC.md 混入別 repo 規格 | 小 | repo |
| B7 | 文件與實況零碎不符 | 小 | repo |
| B8 | cc-watch 殘骸 | 小 | repo（要拍板） |
| B9 | description 太長 | 小～中 | repo |
| B10 | AGENTS 範本常駐派工規則 | 小 | repo |
| B11 | test_skills 死碼 | 小 | repo |
| B12 | 重複敘述 | 小 | repo |
| B13 | 出處不明標記 | 小 | repo |
