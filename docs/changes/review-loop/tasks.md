# review-loop tasks

先讀 [spec.md](spec.md)：它是契約，每條 task 做完要讓它的 Scenario 成立。計畫原文在本 repo 的
`docs/plans/2026-09-25-dispatch-review-loop.md`（以其中「盤點更正」一節為準），這裡只放切好的 PR。

- **分支**：每條 task 從整合分支 `claude/review-loop-v04` 開分支，**PR base 也是它**，不要開到 `main`。
- **所有權**：每條只改「所有權」列出的檔；其他需要改的寫進 PR body 的 `## 交接`，不要順手改。
- **依賴**：寫了「依賴」的 task 要等那幾條合併；波次只是分組。
- **開工基準**（`6eb4179`，以下全綠）：`python3 tools/check_docs.py .`、`python3 tools/spec_merge.py check .`、
  `python3 test/spec_merge.test.py`（25 項）、`python3 test/test_skills.py`（10 支）、`node test/guard-bash.test.mjs`。
  `claude plugin validate` 與 `tools/check-plugin-*.sh` 由發包者在本機跑，cloud box 沒有 `claude` 就跳過。
- **共同約束**：
  - `commands/*.md` 本文不得出現 `YYYY-MM-DD` 形式的日期；每支要有 `## 防什麼`；有 `argument-hint` 就要用 `$ARGUMENTS`（`test/test_skills.py` 守）。
  - 現行檔不得出現 `/Users/<帳號>` 這類本機絕對路徑；plugin 內的檔用 `${CLAUDE_PLUGIN_ROOT}/…`。
  - 腳本只用：Python 3 標準庫、POSIX `sh`、`git`、`gh`、`perl`（逾時一律 `perl -e 'alarm N; exec @ARGV' …`）。
    macOS 與 Linux 都要能跑：不用 `sed -i`、`readlink -f`、`timeout`、bash 專屬語法；`cp -c` 要有退路。
  - 測試不連網、不用真的 `gh`：用 PATH 最前面的假 `gh` 腳本，和本機 bare repo 當 `origin`。每個負向 Scenario 都要有一個真的會紅的案例。
  - 腳本檔頭寫用法、退出碼表、`防什麼` 一句（比照 `tools/spec_merge.py` 的 docstring）。
- **驗證指令代號**：
  - **BASE-GATE**＝`python3 tools/check_docs.py . && python3 tools/spec_merge.py check . && python3 test/spec_merge.test.py && python3 test/test_skills.py && node test/guard-bash.test.mjs`

## 1. 腳本與原語（可以併行）

- [ ] 1.1 `tools/dispatch_state.py` 的 `upsert-run`／`sync`／`stale`／`next` 與測試 ｜驗：`python3 test/dispatch_state.test.py && BASE-GATE`
  - PR 標題：`review-loop 1.1: dispatch_state 簿記腳本`
  - 所有權：`tools/dispatch_state.py`、`test/dispatch_state.test.py`
  - 依賴：無
  - 契約：spec.md「dispatch_state 簿記」全部 14 個 Scenario，各至少一個測試。
  - task 區塊格式（`next` 與 `sync` 要讀；必須與 `spec_merge.py check` 的判定一致，見 spec.md「未勾 task 缺所有權」）：
    task 行之後、下一條 task 或任何 `#` 開頭的標題之前的縮排行都屬於它。所有權只認 task 行上的 `｜所有權：`，
    或以 `- 所有權：`／`- **所有權**：` 開頭的子行，取冒號後的反引號路徑；值是空的，就收它底下更深一層 `- ` 子項裡的反引號路徑
    （SetupHK 的寫法，見本檔 1.3 的範例）。`依賴：` 同樣認 task 行上的 `｜依賴：` 或 `- 依賴：` 子行，值是 `N.M` 清單（`、`／`,` 分隔）或 `無`。
  - 所有權重疊判定：同一路徑；`a/**` 包含 `a/` 底下任何路徑；任一邊是 glob 就用 `fnmatch` 雙向比。
  - `gh` 路徑可用環境變數 `DISPATCH_STATE_GH` 覆寫（測試用），預設 `gh`。
  - 輸出行首固定是 `READY`／`WAIT`／`SKIP`／`STALE`／`SYNC`／`NEXT`，給 `/cc-review` 與 `merge_pr.sh` 解析。

- [ ] 1.2 `tools/gate-pr.sh`：臨時 worktree 試合併到 BASE 最新版、依序跑 `gate.env` 的 GATE、以退出碼判紅綠 ｜驗：`sh test/gate-pr.test.sh && BASE-GATE`
  - PR 標題：`review-loop 1.2: gate-pr 試合併跑閘`
  - 所有權：`tools/gate-pr.sh`、`test/gate-pr.test.sh`
  - 依賴：無
  - 契約：spec.md「gate-pr 試合併跑閘」全部 9 個 Scenario，各至少一個測試。
  - `gate.env` 是可以 `.` 載入的 sh 檔：`BASE=`、`GATE_1=`…`GATE_<n>=`（從 1 連號，遇到第一個沒定義的就停）、
    選填 `GATE_TIMEOUT=`、`SHARE_DIRS=`、`SCHEMA_GLOB=`。實例見 `docs/changes/review-loop/gate.env`。
  - 取 PR 資訊：`gh pr view <n> --json baseRefName,headRefName,files`。主 repo＝`<change-dir>` 往上三層（同 `spec_merge.py`）。
  - worktree 放 `${TMPDIR:-/tmp}` 底下；`trap` 保證清掉（`git worktree remove --force` 後 `git worktree prune`）。
  - 衝突時試合併用的身分寫死 `-c user.email=gate@local -c user.name=gate`，不動使用者的 git 設定。

- [x] 1.3 `spec_merge.py check` 要求未勾 task 有所有權；`docs/changes/README.md` 寫明新格式 ｜驗：`python3 test/spec_merge.test.py && cmp templates/docs/changes/README.md docs/changes/README.md && BASE-GATE`
  - PR 標題：`review-loop 1.3: tasks 所有權檢查與新格式說明`
  - 所有權：
    - `tools/spec_merge.py`、`test/spec_merge.test.py`
    - `templates/docs/changes/README.md`、`docs/changes/README.md`（兩份內容逐字相同）
    - `commands/cc-gate.md`
  - 依賴：無
  - 契約：spec.md MODIFIED「spec_merge check 快閘」新增的「未勾 task 缺所有權」Scenario；原有 25 項測試照舊全綠，
    既有 fixture 缺所有權的要補上（已勾的不用）。`**所有權**：`＋巢狀子項（SetupHK 寫法）要被認得。
  - README 要寫清楚（只寫格式與規則，不寫某個 repo 的實例）：
    - task 區塊：`所有權：`（必填）、`依賴：`（選填；寫了就取代波次規則，`無`＝不等）、可選的其他子行。
    - `gate.env` 各鍵的意思；`reviews/PR-<n>-r<k>.md`（驗收全文）、`followups.md`（不擋合併的待修）；
      `runs.md` 由 `dispatch_state.py` 維護、執行者不動。
    - 「派工」節保留 `MAX_CONCURRENT=3` 那一行與其說明。
  - `commands/cc-gate.md`：寫回 `## 0.` 缺陷 task 的格式要多一行 `所有權：<缺陷所在檔>`，否則 1.3 合併後 gate 寫回的 task 會被 pre-commit 擋。

- [x] 1.4 `/cc-cursor` 加 `--base`、`--name`、`--agent-id`、被發包指令呼叫時不再問、404／409 冪等處理 ｜驗：`python3 test/test_skills.py && grep -c -e '--base' -e '--name' -e '--agent-id' commands/cc-cursor.md && BASE-GATE`
  - PR 標題：`review-loop 1.4: cc-cursor 起點分支與冪等 agentId`
  - 所有權：`commands/cc-cursor.md`
  - 依賴：無
  - 契約：spec.md MODIFIED「cc-cursor 安全派一個 agent」全部 8 個 Scenario。
  - 參數名與 cursor-cloud MCP 的欄位對照：`--base`→`startingRef`、`--name`→`name`、`--agent-id`→`agentId`。
    cloud-orchestrator R3 之後會換成 `tools/cursor.mjs`，欄位名一樣，所以本文寫「欄位」，不要把 MCP 工具名寫進規則句以外的地方。
  - `argument-hint` 補上新參數；`## 防什麼` 補一句「重試時多開一個 agent、全部 agent 同名認不出誰是誰」。

- [ ] 1.5 AGENTS 樣板加發包規則；`docs/decisions.md` 記合併權限放寬 ｜驗：`grep -n '整合分支' templates/AGENTS.md && BASE-GATE`
  - PR 標題：`review-loop 1.5: AGENTS 樣板發包規則`
  - 所有權：`templates/AGENTS.md`、`docs/decisions.md`
  - 依賴：無
  - 契約：spec.md「發包規則寫進 AGENTS 樣板」2 個 Scenario。
  - 樣板開頭說「七節」：放進既有的 `## 硬性規則` 底下成一小段（標明「用 `/cc-dispatch` 派工的 repo 才適用」），不要多開第八節。
    樣板是常駐載入的，新增的字要少，目前 1,333 字元，加完不超過 2,000。
  - `docs/decisions.md` 在最上面相關節加一條（日期 2026-09-25）：dispatch-v0「不做自動合併」放寬為「只准合進整合分支，`main` 由使用者」；
    理由＝SetupHK system-completion 21 個 PR 的實績，與後期發包者自己動手修、跳過驗收的失敗；翻案條件＝合進整合分支後出現未被閘擋下的紅燈。

## 2. 指令與合併腳本

- [ ] 2.1 `tools/merge_pr.sh`：只合進整合分支，合完 pull、sync、commit、push，不用 stash ｜驗：`sh test/merge_pr.test.sh && ! grep -n stash tools/merge_pr.sh && BASE-GATE`
  - PR 標題：`review-loop 2.1: merge_pr 只合進整合分支`
  - 所有權：`tools/merge_pr.sh`、`test/merge_pr.test.sh`
  - 依賴：1.1
  - 契約：spec.md「merge_pr 只合進整合分支」全部 8 個 Scenario，各至少一個測試。
  - 呼叫 `dispatch_state.py`：優先用主 repo 的 `scripts/dispatch_state.py`，沒有就用 `merge_pr.sh` 同目錄那支。
  - 預設分支：`gh repo view --json defaultBranchRef`；取不到就只擋 `main`／`master`。
  - 假 `gh` 的 `pr merge` 要真的把 head 合進 bare repo 的 BASE（測試 fixture 自己做），這樣 `pull --ff-only` 才驗得到。

- [ ] 2.2 `/cc-dispatch` 改用 `dispatch_state.py`：`--base`、所有權、冪等 agentId、名稱帶編號、`--max` ｜驗：`python3 test/test_skills.py && grep -c 'dispatch_state.py' commands/cc-dispatch.md && BASE-GATE`
  - PR 標題：`review-loop 2.2: cc-dispatch 整合分支與冪等派工`
  - 所有權：`commands/cc-dispatch.md`
  - 依賴：1.1、1.3、1.4
  - 契約：spec.md MODIFIED「cc-dispatch 讀工單派工」全部 11 個 Scenario、MODIFIED「cc-dispatch 從計畫檔起草工單」全部 5 個 Scenario。
  - 刪掉「若它前面還有任何組別有未勾 task，停」那條永遠不觸發的檢查；sync 的 `sed` 手順整段換成呼叫腳本。
  - 腳本路徑寫法：repo 有 `scripts/dispatch_state.py` 用它，沒有用 `${CLAUDE_PLUGIN_ROOT}/tools/dispatch_state.py`。
  - 硬規則那段（發包者只寫 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`）寫在本文，不只放在 description。

- [ ] 2.3 新指令 `/cc-review <slug> <PR#>`：閘 → 獨立驗收員 → 判定 → `merge_pr.sh` 或退回同一個 agent，含健康檢查 ｜驗：`python3 test/test_skills.py && test -f commands/cc-review.md && BASE-GATE`
  - PR 標題：`review-loop 2.3: 新指令 cc-review`
  - 所有權：`commands/cc-review.md`
  - 依賴：1.1、1.2
  - 契約：spec.md「cc-review 驗收一個 PR」全部 17 個 Scenario；呼叫 `gate-pr.sh`、`merge_pr.sh`、`dispatch_state.py` 的參數與輸出行首照 spec.md 與 1.1 的約定。
  - 驗收員：用 Workflow 的 `agent({ effort, schema })` 派（schema 強制 `verdict`／`blockers`／`followups`），
    或 Agent 工具＋同一個 schema；本文兩種都寫清楚，以 Workflow 為主（可指定 effort）。
  - 45 分鐘硬逾時的做法寫成可照做的步驟：派驗收員時同時背景起一個計時器（`sleep 2700`，`run_in_background`）；
    計時器先回來而驗收員還沒回報 → 停掉驗收員、重派一次；再逾時就回報。
  - 腳本路徑寫法同 2.2（`scripts/` 優先，其次 `${CLAUDE_PLUGIN_ROOT}/tools/`）。
  - frontmatter：`description`、`argument-hint: "<slug> <PR#>｜<slug> health"`；本文要用 `$ARGUMENTS`；要有 `## 防什麼` 與一句退役訊號。

## 3. 接線與發版

- [ ] 3.1 `test/run-all.sh` 接上三支新測試並修掉兩處吞退出碼的管線；version 0.5.0；README 目錄與現況 ｜驗：`python3 test/dispatch_state.test.py && sh test/gate-pr.test.sh && sh test/merge_pr.test.sh && BASE-GATE && grep -n '"version": "0.5.0"' .claude-plugin/plugin.json`
  - PR 標題：`review-loop 3.1: run-all 接線與 0.5.0`
  - 所有權：`test/run-all.sh`、`.claude-plugin/plugin.json`、`README.md`
  - 依賴：1.1、1.2、1.3、1.4、1.5、2.1、2.2、2.3
  - `test/run-all.sh` 現在有兩處管線把失敗吞掉（POSIX `sh` 的管線退出碼是最後一個指令的）：
    `python3 test/spec_merge.test.py 2>&1 | tail -1` 與 `node test/guard-bash.test.mjs … || true`。改成測試本身的退出碼會讓整支紅，輸出照樣精簡。
  - 版本 0.4.0 → 0.5.0（新增 command 檔與 `tools/` 都要 bump 才會進快取）。
  - `README.md`：目錄表加 `commands/cc-review.md` 與三支 tools，「skill 家族 10 支」改 11 支；「怎麼跑」不用改。
