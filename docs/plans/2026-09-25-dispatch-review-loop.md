> 狀態：已核准（2026-09-25，使用者於 SetupHK system-completion 那個 session 核准）；執行中，工單 `docs/changes/review-loop/`。
> 出處：原稿在 SetupHK repo 同名檔（問題是在那裡的 system-completion 支線發現的）；使用者指示改在 cc-harness 本機資料夾執行，本檔是搬過來的正本，之後只更新這一份。
> 執行對象：本 repo（整合分支 `claude/review-loop-v04`）；第二輪另含 `~/Documents/cursor-api`。

## 盤點更正（2026-09-25，接手 session 核對 cc-harness `6eb4179`；以本節為準）

1. **本機早有 checkout**：`~/Documents/3.AGENT/cc-harness`，而且它是 plugin 的 directory marketplace 來源——command 本文即時讀這個目錄。所以整合分支開在獨立 worktree `~/Documents/3.AGENT/cc-harness-review-loop`，主 checkout 維持 `main`，不然所有 session 的 `/cc-*` 會立刻換成半成品。
2. **版本**：`main` 已是 0.4.0（PR #2：R1 拆使用量層＋R2 前置），本機裝的是 0.3.4。本變更發 **0.5.0**。分支名 `claude/review-loop-v04` 照使用者核准沿用。
3. **同時上限**：0.3.6 起已從 `docs/changes/README.md`「派工」節讀 `MAX_CONCURRENT`，不是寫死 3。改成：上限＝`--max` 或 `MAX_CONCURRENT`；候選只取 `dispatch_state.py next` 算出、所有權不重疊的 task。
4. **死碼位置**是 `cc-dispatch.md:19-20`，不是 `:15`。
5. cc-harness **根目錄沒有 `AGENTS.md`**；repo 規矩在 `README.md`「規矩」三條。
6. **`test/run-all.sh` 在 `main` 就是紅的**：`check-plugin-sync.sh` 比對安裝快取 0.3.4 和 repo。這是設計如此，要 `claude plugin update cc-harness` 才會綠，屬 `~/.claude/**`，本輪不動。完成定義的「全綠」改為：PLUGIN_SYNC 以外全綠；PLUGIN_SYNC 列人工閘（使用者合併 `main` 後自己 update）。
7. **上一個 cc-harness session（雲端，PR #2）留下的計畫** `docs/plans/2026-09-24-cloud-orchestrator.md` R2–R4 未做，交集：
   - R3 會把 `cc-cursor` 從 MCP 換成 `tools/cursor.mjs`。本變更新增的 `--base`／`--name`／`--agent-id` 用同名欄位，移植時照搬。
   - R4 會讓 sync 看 CI 判 `unverified`。本變更的 `dispatch_state.py sync` 就是它的落點，這輪不先做。
   - cloud 沒有 `gh`：三支腳本沒有 `gh` 就以退出碼 2 明講，不猜。
8. **R1 留下的約束**：command 本文不得有日期（`test/test_skills.py`）、現行檔不得有 `/Users/<帳號>` 路徑、每支 command 要有 `## 防什麼`。
9. **`gate-pr.sh` 不複製進 repo**：`/cc-review` 先找 repo 的 `scripts/gate-pr.sh`，沒有就用 `${CLAUDE_PLUGIN_ROOT}/tools/gate-pr.sh`；設定從 `docs/changes/<slug>/gate.env` 讀。理由：複製會跟 plugin 走針（cc-harness BACKLOG 13 同一種病）。
10. **slug** 照 cc-harness 自己的格式：`docs/changes/review-loop/`，日期在歸檔時才加。
11. dispatch-v0 的「不做自動合併」是 `## 不做` 條款、不是 Requirement，`spec_merge` 無法 MODIFIED 它。改成 MODIFIED「cc-dispatch 讀工單派工」加一條 Scenario，加上 ADDED「cc-review」的合併權限 Scenario 一起覆蓋。
12. lint `problems?` 那個坑：`gate-pr.sh` 一律用指令退出碼判紅綠，不 grep 輸出。

# 計畫：把「發包、驗收、合併」流程固化成可重現的工具

## Context（為什麼要做）

這一輪 SetupHK CRM 的前 10 個 PR（#8–#17）很順，每一條都完整走過同一個流程：拆工單、派給 Cursor、獨立驗收、退回修、再驗、合併。後期歪掉，證據如下：

- 發包者（Claude）開始把小修正自己做，也跳過驗收。
  - 推上一個紅燈 commit（`accc0f44`）。
  - 用沒帶參數的 `git stash apply`，把舊半成品誤套進主工作目錄。
- 手寫的 shell 簿記出錯：lint 判斷只認英文複數 `problems`；前端 PR 沒跑後端測試。
- 驗收 agent 卡住、Cursor 串流斷線、建立 agent 時回 404。發包者用「自己做」去補這些洞。
- 單一 session 撐了 21 個 PR、約 8 小時，錯誤集中出現在後半段。

現有工具的盤點（cc-harness 0.3.4）：

| 支 | 現況與缺口 |
|---|---|
| `commands/cc-dispatch.md` | 只做「派工＋sync」。寫死「分支從 main 開」、同時上限 3；沒有檔案所有權；會重複派工（不對照 runs.md）；agent 名稱全部一樣。 |
| `commands/cc-cursor.md` | 一次開一個 agent，每次都要問使用者。 |
| `commands/cc-gate.md` | 是「輪次層」的驗收，而且要開新 session 跑；沒有「每個 PR」的驗收，也沒有退回修的迴圈。 |
| 合併 | 設計上「由人合併」（`docs/archive/changes/2026-09-23-dispatch-v0/spec.md`：「不做自動合併 PR」）。 |
| 整合分支、context 管理 | 都沒有。 |

**結論**：cc-dispatch 不夠；只寫一份 kickoff prompt 也不夠。這一輪能成功的關鍵其實是「每個 PR 的驗收迴圈」，但它完全靠發包者當場記憶在跑，沒有工具守著。後期歪掉，正是因為這個迴圈沒有被固化。

**建議**：升級 cc-harness，不另外開一套新 skill。
- 補一支新指令 `/cc-review`，負責每個 PR 的驗收、退回、再驗、合併。
- 修 `/cc-dispatch`：支援整合分支、檔案所有權、冪等派工。
- 把手寫的簿記改成有測試的腳本。
- 加兩條硬規則：
  1. 發包者不寫產品程式碼。
  2. 一波一個 session。

---

## 做法

### 1. `/cc-review <slug> <PR#>`（新指令，檔案 `commands/cc-review.md`）

一個 PR 從驗收到合併的完整迴圈：

1. **閘**：跑 repo 內的 `scripts/gate-pr.sh <PR#>`（由樣板安裝，見第 4 節）。它會在臨時 worktree 把 PR 試合併到整合分支最新版，前後端檢查一律全跑。
   - 閘是紅的，就直接退回，不派驗收員。
   - 衝突則交回同一個 agent，請它 merge 整合分支後再交回。
2. **獨立驗收員**：派一個乾淨 context 的 subagent，帶上該 task 的整段工單、spec 契約、findings 編號，以及固定格式的驗收規則。
   - 驗收規則：長指令一律加逾時、服務用 nohup 並記 PID、禁止 `find /`、禁止 pkill 別人的程序。
   - 產出用 schema 強制成 `VERDICT / BLOCKERS / FOLLOWUPS`。
   - 驗收報告全文寫進 `docs/changes/<slug>/reviews/PR-<n>-r<k>.md`。**發包者只讀 VERDICT 和 BLOCKERS**，全文不進它的 context。
3. **判定**：
   - **merge**：`gh pr ready` → `gh pr merge --merge` → 在主 repo `git pull --ff-only` → 用腳本更新 runs.md 並打勾 tasks.md → commit 並 push。
   - **fix-needed**：把 BLOCKERS 加上「先 merge 整合分支」，用 `cursor_create_run` 送回**同一個** agent，並在背景監看。跑完再從第 1 步開始。
   - 同一個 PR 最多退回 3 輪。第 3 輪仍失敗就停，回報使用者，**不准發包者自己動手修**。
   - FOLLOWUPS（不擋合併的待修）自動累加到 `docs/changes/<slug>/followups.md`，收尾波次再從這裡取。
4. **合併權限**：
   - 整合分支：閘是綠的而且 VERDICT 是 merge，就可以由 Claude 合併。
   - `main`：永遠要使用者當輪確認。
   - 這條要同步寫進 AGENTS 樣板（本輪 SetupHK 的「發包例外」就是範本），也要改寫 dispatch-v0 spec 的「不做自動合併」，只放寬到整合分支。

### 2. 修 `/cc-dispatch`（`commands/cc-dispatch.md`）

- **整合分支**：新增參數 `--base <branch>`。
  - 契約 prompt 裡的「分支從 main 開」改成用變數。
  - `cursor_create_agent` 的 `startingRef` 和 PR base 都用它。
  - 契約裡加一條：「開 PR 前、每次追問後，都先 merge 最新的整合分支」。
- **檔案所有權**：
  - `tasks.md` 每條必須有 `所有權：`，`spec_merge.py check` 在缺漏時要判紅。
  - 同一波裡，所有權有重疊就拒絕派工，並列出衝突的檔案。
  - 可以用「依賴：N.M」表達跨波的依賴。
  - 動到 schema 或 migration 的 task 一律序列化執行。
- **冪等派工**：
  - 派工前對照 `runs.md`，狀態是 running 或 finished 的 task 不再派。
  - 由 client 自己產生 `agentId=bc-<uuid>` 傳給 `cursor_create_agent`；API 已支援，重送同一個 id 會回 409。這樣 404 之後重試也不會多開一個 agent。
- **名稱與 label**：agent 的 name 和監看的 label 用 `<slug> N.M <一句>`，不再截 prompt 開頭（現在全部同名）。
- **同時上限**：由參數決定，預設等於「這一波所有權互不重疊的 task 數」。
- **一波只問一次**：保留。之後的追問（fix 迴圈）不再問。
- **修掉死碼**：`cc-dispatch.md:15` 那條「先 sync」的檢查永遠不會觸發，要修掉。

### 3. 發包者硬規則（寫進 `cc-dispatch`／`cc-review`，並在 AGENTS 樣板加一節）

- **發包者不寫產品程式碼**。
  - 就算只改一行，也要變成追問或新的 micro-task，一樣走 `/cc-review`。
  - 發包者可以寫的只有：`docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`。
- **加 hook 守住這條**（選做）：在 `hooks/` 加 PreToolUse(Edit|Write)。環境變數 `CC_ROLE=dispatcher` 時，擋住上述路徑以外的寫入；比照 `guard-bash.mjs` 的寫法，也要附測試。
- **commit 前一定跑閘**：紅的不 commit，指令串要在紅燈時停下。這條也寫進腳本（第 4 節）。

### 4. 把簿記改成腳本（`tools/`，要附測試）

| 腳本 | 用途 |
|---|---|
| `tools/gate-pr.sh`（樣板，安裝到 repo 的 `scripts/`） | 泛化本輪的腳本：整合分支名稱、前後端指令都從 `docs/changes/<slug>/gate.env` 讀；遇到 schema 變更的 PR，自動改用「自己的 worktree＋`cp -cR` 複製 node_modules」；先清掉指回自己的 `node_modules/node_modules`；lint 判斷用 `problems?`；後端一律跑。 |
| `tools/dispatch_state.py` | 子指令：`upsert-run`（更新 runs.md 某一列）、`sync`（依已合併 PR 打勾 tasks.md，整合分支也適用）、`stale`（找出 base 落後的 PR）、`next`（列出可以派的 task）。取代本輪手寫的 sed、`git stash` 那些組合指令。 |
| `tools/merge_pr.sh <PR#>` | 依序做 `ready`、`merge --merge`、`pull --ff-only`、`dispatch_state sync`、commit、push。**完全不碰 stash**；主工作目錄不乾淨就直接拒絕。 |
| 測試 | 放進 `test/run-all.sh`，用假的 gh 與 git 輸出驗證。 |

### 5. Context 管理（你提的「上下文壓縮」）

- **一波一個 session（主要手段）**。
  - 每一波結束（或每累積約 8 個合併的 PR）時，`/cc-review` 自動寫交接單，交接單檔尾附下一波的 kickoff，然後停下，由新 session 接手。
  - 理由：本輪的錯誤集中在第 20 個 PR 之後。乾淨的新 session 比中途壓縮可靠。
- **發包者的 context 保持精簡**：驗收全文寫進檔案，只讀判定行；Cursor 的 transcript 也只讀摘要。
- **壓縮只當備援**：Claude Code 本來就會自動壓縮。在「一波的中間」壓縮之前，先把 runs.md 和 followups 寫進檔案。

### 6. 可靠度

- **監看腳本斷線**：`wait-for-run.js` 以 exit 1 結束，但 `cursor_get_run` 顯示仍是 RUNNING 時，自動重接。這條規則寫進 `/cc-review`。
- **驗收員卡住**：自動重派一次（新的 subagent）；第二次仍卡住就回報使用者，發包者不接手做。
- **模型參數**：把 cursor-api 的 `modelParams` 做完（已有交接單 `cursor-api/handovers/2026-09-25-create-agent-model-params.md`）。之後高風險的 task（資料遷移、權限）可以指定 `reasoning_effort=xhigh`。
- **wait-for-run.js 的兩個問題**：
  - 401、404 這類永久性錯誤不應該一直重連 6 小時。
  - 程式崩潰時的 exit code 要能跟「run 失敗」分開。

### 6.5 待辦、回報、effort（依本輪實際情況判斷，三個都有用，但要換做法）

- **待辦清單：要，但要放在檔案裡，而且由腳本維護**。
  - 本輪的待辦其實就是 `runs.md` 與 `tasks.md`。問題出在它們是手動更新的，後期落後好幾格。
  - 放在對話 context 裡的待辦，長 session 一定會失真。
  - 做法：`dispatch_state.py next` 算出「現在可以派的 task」，`stale` 算出「base 落後的 PR」。發包者每次被叫醒，第一步就是跑這兩個，不靠記憶。
- **定期回報：要，而且是最有效的一項**。
  - 本輪就是在做中期報告時，才發現主工作目錄被 stash 弄壞、數字不對。
  - 做法：每合併 4 個 PR（或每一波結束時），`/cc-review` 自動跑一次「健康檢查」。三項任何一項不對，就停下來回報，不繼續派工：
    1. 主工作目錄是否乾淨。
    2. 整合分支 HEAD 的前後端檢查是否全綠。
    3. `runs.md` 是否與 `gh pr list` 一致。
  - 回報寫成檔案，對話裡只放三行。
- **effort：要分層**。
  - **Cursor 的實作 agent**：MCP 目前只能帶模型 id，所以一律是 grok-4.7 的預設 High。modelParams 做完後，資料遷移、權限類的 task 改用 xhigh。
  - **驗收員**：
    - 資料遷移、權限、跨模組的 PR 用 high 以上。
    - 單頁 UI 用中等即可。
    - 改用 Workflow 的 `agent({effort})` 派驗收員，就能依 PR 類型指定。
  - **發包者本身**：這次的錯都是簿記疏忽，跟思考深度無關。所以第 5 節的「一波一個 session」和第 4 節的腳本化，比調高 effort 更有用。

### 6.6 採用《Prompting Claude Opus 5.5》的五條（寫進 cc-review／cc-dispatch 與 KICKOFF 樣板）

來源：https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5

1. **清單加上自動續做**
   - 每次被叫醒時，用 `dispatch_state.py next` 列出還沒完成的項目。有未完成項目、又沒有說明卡在哪，就繼續做。
   - 同一件事最多自動續 2–3 次；還卡住就停下來回報，不自己接手做。
   - 背景監看或 subagent 還在跑時，不算完成。
2. **固定時間點回報**
   - 每合併 4 個 PR，或每一波結束，做一次健康檢查。
   - 回報固定三段：做了什麼、發現什麼、需要你做什麼。
3. **effort 分層**
   - 發包者用 medium。
   - 驗收員：資料遷移、權限、跨模組的 PR 用 high 以上，其他用 medium。
   - xhigh 和 max 只留給實測過確實有差的類型。
4. **時間預算**
   - 每一波在 KICKOFF 寫明預算。發包者每次被叫醒時先看「已用時間／預算」。
   - 驗收員一律加硬逾時（例如 45 分鐘）。超時就重派一次，再超時就回報。
5. **一波之內不提早停下**
   - 把文件附的那段「standing instruction」改寫後放進 KICKOFF：一波之內不要用總結、詢問、列決策清單的方式停下來。
   - 仍要停的情況：使用者要求暫停、健康檢查不過、需要使用者拍板、不可逆動作要確認。

### 7. 大任務的 kickoff 樣板（`templates/docs/changes/KICKOFF.md`）

交付大任務時用。樣板把整個流程分成下面幾段，每段寫明要讀、要寫哪些檔：

1. **唯讀體檢**：產出 `findings.md`。
2. **決策與契約**：寫 `spec.md`，並把要使用者拍板的事集中起來問一次。
3. **拆工單**：寫 `tasks.md`，每條要有所有權、驗證方式、依賴。
4. **派工**：`/cc-dispatch --base`。
5. **驗收**：每個 PR 跑 `/cc-review`。
6. **收尾**：一波從 `followups.md` 取待修。
7. **開 PR 到 main**：由使用者合併。

---

## 要改的檔（cc-harness repo：`roylam-beep/cc-harness`，本機目前沒有 checkout）

| 動作 | 檔案 |
|---|---|
| 新增 | `commands/cc-review.md` |
| 新增 | `tools/gate-pr.sh`、`tools/dispatch_state.py`、`tools/merge_pr.sh` |
| 新增 | `templates/docs/changes/KICKOFF.md` |
| 新增（選做） | `hooks/guard-write.mjs`，以及測試 |
| 修改 | `commands/cc-dispatch.md` |
| 修改 | `commands/cc-cursor.md`（name、agentId、base 參數） |
| 修改 | `tools/spec_merge.py`（要求 `所有權：`） |
| 修改 | `templates/docs/changes/README.md`（tasks 格式、reviews、followups） |
| 修改 | AGENTS 樣板（發包例外、發包者不寫產品程式碼） |
| 修改 | `docs/archive/changes/2026-09-23-dispatch-v0/spec.md` 的「不做自動合併」：新開一個 change，寫成 MODIFIED |
| 測試 | 更新 `test/run-all.sh` |
| 發版 | 0.4.0 |

另外：`cursor-api` repo 把 modelParams 做完。這一項已有交接單。

**權限**：兩個都是帳號層或外部 repo，改動前要你核准（`~/.claude/CLAUDE.md`：skills 與 plugins 要核准）。

## 驗證

1. **plugin 自己的測試**：`test/run-all.sh` 全綠，包含新增的 `dispatch_state.py` 與 `merge_pr.sh` 假資料測試，以及 hook 測試。
2. **Dogfood**：用新流程完成 SetupHK 剩下的工作（5.1 修正、4.1、第 6 波），驗證下面幾件事：
   - 每個 PR 都有 `reviews/PR-n-rk.md`。
   - 發包者沒有任何產品程式碼的 commit（`git log --author` 檢查）。
   - runs.md 和 tasks.md 都是腳本更新的。
   - 每一波結束時都自動寫出交接單。
3. **故障演練**：
   - 故意讓驗收員卡住：確認只重派一次，然後回報使用者。
   - 故意讓閘紅：確認會退回，不會合併。
   - 模擬監看腳本斷線：確認會自動重接。

## 規模

大，約 2–3 輪 session。可以先做 **MVP**：`/cc-review`、`gate-pr.sh`、`merge_pr.sh`，再加上 cc-dispatch 的 `--base` 和所有權，約 1 輪。有了 MVP，SetupHK 剩下的工作就能用它 dogfood。hook、KICKOFF 樣板、modelParams 排在第二輪。
