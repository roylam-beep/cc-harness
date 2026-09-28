# decisions — 已拍板的事，一條一行，不敘述過程

只記「現在是什麼」與「什麼情況會翻案」。過程與理由留在對應的 commit 訊息與 `docs/plans/`。

## 派工與合併

- **2026-09-25**｜dispatch-v0「不做自動合併」放寬為「只准合進整合分支，`main` 由使用者」。
  理由：SetupHK system-completion 21 個 PR 的實績，與後期發包者自己動手修、跳過驗收的失敗。
  **翻案條件**：合進整合分支後出現未被閘擋下的紅燈。
- **2026-09-27**｜review-loop 只收**驗收規則**（閘＋1 位對抗型驗收員＋退回同一個 agent＋發包者不修），不收簿記機器。
  教訓：第 1 波首輪 0/5 過、15 條 BLOCKER 零推翻；mutation 抓出 3 處假綠；第 2 輪以後產出低，3 輪不過就停。
  整合分支 `claude/review-loop-v04`（+2,534 行，含 `dispatch_state.py` 1,027 行）不合併、留 remote 存檔：它擋下的多是自己造成的
  （同一個判定寫兩份就會走針），plugin 0.4.0 才 2,867 行。**翻案條件**：手寫 `runs.md` 連續出錯到誤派或誤合。
  **死法**：連續 3 個歸檔的 change 沒有 `reviews/` → 刪 `tools/gate.sh`、`test/gate.test.sh` 與 cc-dispatch 驗收節。
  連帶：`/cc-cursor` 旗標只認開頭，0.4.0 寫在 prompt 後面的旗標會變成內容。

- **2026-09-28**｜`cursor-cloud-env`（帳號層 skill）搬進本 plugin 並改名 `/cc-cloud-env`，加 Claude 雲端骨架；開頭問平台（cursor／claude／both），不自動猜。
  Claude 骨架的事實（`CLAUDE_CODE_REMOTE=true`、repo hooks 會載入但 `enabledPlugins` 不裝、setup script 只能存在環境設定）**只讀官方文件、未實測**；
  第一次派出的 PR `## 驗` 就是實測。**翻案條件**：那份 `## 驗` 與骨架寫的任一條不符 → 先改骨架再派第二次。

## harness 感測與量測

- **2026-09-24**｜**拆掉 skill 使用量層**，使用者定案。拆：`tools/skill-usage.py`、`hooks/log-harness-event.mjs`
  與它掛的三個 hook（UserPromptExpansion／InstructionsLoaded／PreToolUse(Skill)）、SessionStart 第 1 行、
  `harness.log` 的 append、各 command 的使用次數型死法、README 規矩 3（`ALIASES` 改名接回）。
  理由：①只量「有沒有被叫」，不量「有沒有用」；②實績上沒有一條日期型死法真的觸發過退役，P3 A/B 未判即作廢；
  ③cloud 為主力後 container 用完回收，逐字稿跟著消失，要量還得多一套 commit 流程。
  **留下**兩個量品質／信任的數字：常駐字元預算（`check_docs.py` 第 7 類＋SessionStart 那行）、
  `cc-close` 的 `PR 合併 a／退回 b｜gate 缺陷 c`。
  **取代**：每支 command 寫 `## 防什麼`（`test/test_skills.py` 守）；看得見結果的條件留作「退役訊號」；
  退役由每季一次 `/cc-audit` 人工判（排程在 cloud 能載入 cc-* 後建，見 `docs/plans/2026-09-24-cloud-orchestrator.md` R2）。
  下面 2026-09-03「使用量有兩個資料源」那條因此作廢。
- **2026-09-24**｜`hooks/session-start.sh` 的 `wc -m` 改成先挑實測可用的 UTF-8 locale。
  原本寫死 `LC_ALL=en_US.UTF-8`，cloud container 沒有這個 locale，`wc -m` 靜默退回位元組，
  印出的常駐字元虛報三倍（7,962 對 `check_docs.py` 的 2,654）；`test/check-docs-resident.test.sh` 第 4 項抓到。
  一個可用 locale 都沒有時印「讀不到」，不印錯的數字。

- **2026-09-22**｜**spec 層**採 OpenSpec 格式子集（`## ADDED／MODIFIED／REMOVED Requirements`、
  `#### Scenario:` ＋ WHEN／THEN、`## 不做`），**不裝其 CLI**、不做 stores、不做 RENAMED、不做 proposal／design。
  主 spec ＝ repo 根單檔 `SPEC.md`（`check_docs.py` 既有的 20,000 字預算），滿了再拆 `docs/specs/`。
  合併由 `tools/spec_merge.py` 做（REMOVED→MODIFIED→ADDED，MODIFIED 縮水即紅）；change 資料夾由 `cc-close` ③ 建，不加新 skill。
  **一條 task ＝ 一個 PR ＝ 最小可獨立變綠的變更**，執行 agent 不改 `tasks.md`，勾依 merged PR 補。
  **新判定不再進 `check_docs.py`**（284/285 行）：各自單檔、pre-commit 迴圈逐支跑。
  Loop engine（派工器、PR 合併／退回計數、`## 學到的` 撈回）**整包下一輪**，等第一個 change 手動跑通再蓋。
  **死法**：連續 6 輪 `rounds.md` 的「changes 歸檔 N」不變 → 刪 `spec_merge.py` 與 `docs/changes/`；
  歸檔 ≥3 且 `git log --format= -p -- SPEC.md | grep -c '^-### Requirement:'` 為 0 → SPEC.md 只是 append-only 日誌，砍合併與 SPEC.md。
- **2026-09-17**｜`guard-bash.mjs` 有**總開關** `CC_GUARD_BASH=off`（設在
  `~/.claude/settings.json` 的 `env`，重開 session 生效）｜使用者決定：這支已因誤擋被放寬三次，
  逐條追趕追不完，而誤擋現場沒有出口時，agent 會改用 python 寫檔之類的手段**完全繞過守衛**
  （BACKLOG 9 就是這個現象），那比一個明確、可稽核的開關更糟。
  **只有使用者按得動**：讀 hook 進程自己的 `process.env`，agent 在 Bash 指令前面塞
  `CC_GUARD_BASH=off <指令>` 是設在它的子 shell，本進程讀不到。
  同日一併放寬三條誤擋：`git push --delete`（刪遠端分支，跟 force push 是兩件事）、
  `git branch -d`（git 自己就會拒絕未合併的，`-D` 照擋）、`git clean -fdX`（只刪被
  `.gitignore` 忽略的檔，`-x` 照擋）。`git reset --hard` **不放寬**——沒有可靠的判斷依據
  （clean tree 也擋不住 `--hard HEAD~3` 丟 commit），交給總開關。
  **死法**：開關被設成 `off` 常駐超過 30 天＝這支 hook 沒人要，整支拆掉；
  或任一次因為開關開著而真的丟了資料，改成單次授權制（一次放行一條指令）。
- **2026-09-16**｜四支寫入型 skill（`cc-close`／`cc-gate`／`cc-handover`／`cc-harness`）**解除
  `disable-model-invocation: true`**｜使用者決定：硬擋連「使用者在對話裡說收輪」都擋，agent 只能
  請使用者改打 `/cc-harness:cc-close` 全名，太卡。自派的防線改由被安裝 repo 的 `AGENTS.md`
  「`/cc-close`／`/cc-gate`／`/cc-handover` 使用者叫才跑」承擔；`test_skills.py` 的
  `check_side_effect_grade` 對寫入型不再斷言該欄位（斷言註解保留，可一鍵恢復）。
  **死法**：任一寫入型 skill 再出現「使用者沒叫、agent 自派」產出孤兒檔 ≥2 次，把欄位與斷言加回。
- **2026-09-03**｜`UserPromptExpansion` hook 事件**存在且 payload 帶 skill 名**。
  實測自 Claude Code 2.1.259 的 `HOOK_EVENT_REGISTRY`（`strings` 抽二進位檔）：
  summary 是「When a user-typed slash command expands into a prompt」，欄位
  `expansion_type`／`command_name`／`command_args`／`command_source`／`prompt`，
  matcher 比對 `command_name`。**所以不必退回只用 `PreToolUse` 記。**
  計畫 P1 那條 `[需確認]` 由此結案。
- **2026-09-03**｜`InstructionsLoaded` 事件存在，欄位 `file_path`／
  `memory_type`(User\|Project\|Local\|Managed)／`load_reason`(session_start\|
  nested_traversal\|path_glob_match\|include\|compact)／`globs?`／`trigger_file_path?`／
  `parent_file_path?`，每載入一個指令檔觸發一次。P6 的常駐總量分子直接從它取，
  不必自己加字元。
- **2026-09-03**｜使用量有**兩個**資料源，互為備援：`tools/skill-usage.py`（事後掃逐字稿）
  與 `harness.log`（hook 即時記）。退役／死法判定以兩邊對得上的數字為準；
  只有一邊有數字時，先查另一邊為什麼是零，再下判斷。
  `harness.log` 落在 `~/.claude/projects/<dir>/`，不進任何 repo。
- **2026-09-04（P6）**｜**常駐載入上限＝6,500 字元**，由 `tools/check_docs.py` 第 7 類守。
  範圍：帳號 `~/.claude/CLAUDE.md` ＋ repo `AGENTS.md`（沒有才看 `CLAUDE.md`）
  ＋ `~/.claude/projects/<dir>/memory/MEMORY.md`。
  **不用中位數，用目標形態構造**：帳號 `CLAUDE.md` 1,500 ＋ `AGENTS.md` 4,000
  （＝`CHAR_BUDGETS` 既有那條）＋ `MEMORY.md` 1,000 ＝ 6,500。三個數字自此互相自洽，
  改任一個要同時檢查另外兩個。
  **為什麼放棄計畫寫的「中位數 ×1.1」**：實測樣本（`harness.log` 去重後最近 5 個 session，
  N ＝ 16,698／4,436／3,585／4,436／4,436）裡有 4 個來自**沒有 `AGENTS.md`** 的 repo，
  中位數 4,436 × 1.1 ＝ 4,879 因此涵蓋不了 `AGENTS.md`：`templates/AGENTS.md` 骨架 460 字
  就吃掉一半餘裕，`MEMORY.md` 長到 835 字即破——新裝 plugin 的 repo 幾個 session 內必紅。
  分母取錯不是把上限調高的理由，是重訂分母。
  **4,879 → 6,500 是取樣修正，不是放寬，不構成調高上限的先例。之後仍然只降不升。**
  **相依**：帳號 `CLAUDE.md` 現況 3,585，比這個分配裡的 1,500 多 2,085。
  在它降下來之前，6,500 的餘裕是被借走的（見 `BACKLOG.md`）。
  公式與 `hooks/session-start.sh` 是同一份，`test/check-docs-resident.test.sh`
  第 4 項比對兩邊的 N，分岔就紅。
  帳號 `CLAUDE.md` 不存在（CI、新 clone）＝整類跳過，不當紅。
  死法：連續 6 輪沒紅，且改任何一個常駐檔都要先算它 → 改成只印不擋。
- **2026-09-04（P6）**｜`check_docs.py` 單檔行數上限 **250 → 285**（現況 282）。
  理由：安裝是 `cp tools/check_docs.py scripts/` 單檔複製，`commands/cc-harness.md`
  與 `templates/hooks/pre-commit` 兩處都寫死單檔，拆檔要同時改那兩處＝比第 7 類本身還大。
  翻案條件：下次再需要加判定時，先拆檔再加，不再調高這個數字。

- **2026-09-03**｜`commands/*.md` **吃** frontmatter 的 `allowed-tools`／`argument-hint`／
  `disable-model-invocation`（計畫 P3 那條 `[需確認]` 由此結案）。兩種證據：
  （a）二進位檔 2.1.259 的 `TXo()` 載入 `~/.claude/commands` 與 `<repo>/.claude/commands`，
  對每個 `.md` 呼叫 **`FWe(frontmatter, content, name, "Custom command")`**——與 `SKILL.md`
  同一支解析器，欄位表含 `name`／`description`／`model`／`allowed-tools`／`disallowed-tools`／
  `argument-hint`／`arguments`／`disable-model-invocation`／`user-invocable`／`effort`／`shell`；
  （b）headless 實測（臨時檔已刪）。
  **但三個欄位的實際語意不同，白名單要挑對欄位**：
  - `disable-model-invocation: true` **有效且是硬擋**。實測錯誤原文：
    `Skill <name> cannot be used with Skill tool due to disable-model-invocation.`
    使用者自己打 `/<name>` 不受影響。
  - `disallowed-tools: Bash` **有效**，工具被移除，實測回 `Permission to use Bash has been denied.`
  - `allowed-tools: Read` **不收斂工具**——實測該指令內 Bash 照跑。它是「預先放行」不是白名單。
    **所以 P3「allowed-tools 收成逐條」要改用 `disallowed-tools`**，或接受 allowed-tools 只是文件用途。
  - `argument-hint` 只是 UI placeholder（解析路徑已確認，無執行期行為可黑箱測）。
  順帶實測：`~/.claude/commands/` 與 `.claude/commands/` 在 2.1.259 內部標記
  `loadedFrom: "commands_DEPRECATED"`——官方在推 `skills/`，強化 P5 搬 plugin 的方向。

## memory 寫入規則

- **2026-09-03**｜`~/.claude/CLAUDE.md`「帳號層寫入邊界」節加兩條 memory 內容規則
  （使用者當輪核准，commit 在 `dotclaude` repo）：①repo 已有 SSOT 的事實
  （`registry.json`／`docs/ops-facts.md`／`docs/decisions.md`／專案 rules）不進 memory，
  只留一行指標；②每條 `type: feedback` 帶一行 `失效條件：<可判定的條件>`，條件成立時
  下次 `consolidate-memory` 直接刪、不留「已失效」註記。
  官方事實修正：memory **索引有硬上限**（每 session 只載入 `MEMORY.md` 前 200 行或 25 KB），
  內容檔沒有上限；所以問題不是總量而是重複與失效。
  **死法**：兩條規則上線後 memory 仍每月新增 >5 條重複 → 規則無效，改用 hook 擋寫入路徑。
- **2026-09-03**｜`google-meta-ads-ga4-mcp` 的 memory 照這兩條整理過一次：
  **20 條 → 7 條**，`MEMORY.md` 3,930 → 2,030 字元。動作四類：3 條 Ads 紀律合併成
  `gads-analysis-discipline`；`render-paid-no-coldstart` 搬進該 repo
  `docs/ops-facts.md`〈部署（Render）〉；`hermes-live-account-testing` 的 repo-safe 部分
  2026-09-01 已在〈live 壓測鏈路〉故刪除原條（只把「證據範圍界線」併進 Ads 紀律第 4 節）；
  `polish-phase-propose-first` 已失效（2026-08-31 進入直接做模式）故刪。
  另有 **7 條 harness 治理類搬到本 repo 的 memory**（原本躺在那邊只因當時 harness 工作在那做）。
  實例佐證規則①：原 `account-layer-write-permission-split` 抄了一份路徑清單，且已與
  CLAUDE.md 走針（它寫 `commands/`／`output-styles/` 可寫，CLAUDE.md 寫的是未經核准不得改）。

- **2026-09-03**｜**內建 `/goal` 不取代帳號層「做完才叫做完」那段**（P1→P3→P4 順延三次，本輪定案）。
  實測（2.1.259 `strings`）：`/goal` 存在，機制是「使用者設一個完成條件 → 每輪後由另一個
  evaluator 判定是否達成 → 沒達成就繼續做」（原文：`Approving sets this as the session goal,
  like running /goal: after each turn a separate check decides whether the condition is met,
  and Claude keeps working until it is.`），另有 `Goal achieved`／`Goal could not be achieved`、
  `restoreGoalFromTranscript`／`tengu_goal_restored_on_resume`（resume 會還原）、
  `CLAUDE_CODE_GOAL_CHECKIN_MINUTES`（閒置時注入 check-in）、`modelProposedGoals` 設定。
  **不能取代的理由**：`/goal` 是 **session 級、要人當場設**的一次性條件，`claude --goal` 實測
  **不存在**（`error: unknown option '--goal'`），所以 harness 無法讓它自動常駐；
  而「做完才叫做完」要在**每個 session、沒人設條件時**就生效。兩者是不同層：
  規則是預設值，`/goal` 是單輪加碼。
  **翻案條件**：出現可在設定檔或 CLI 常駐指定 goal 的官方介面（`--goal` 或 settings 鍵可用）
  → 那段散文改成「開輪時設 `/goal`」＋保留一句底線。

## plugin 化（P5）

- **2026-09-04**｜**沒有 `$ARGUMENTS` 的 command，使用者打的參數會被整段丟掉**，不是接在後面。
  實測（2.1.259，headless，臨時 command 已刪）：同一支 command 本文要求回報「這段之後看到什麼」，
  `argument-hint` 有、`$ARGUMENTS` 無 → 回 `SAW:NONE`；把本文改成 `SAW:$ARGUMENTS` 後
  打同一句 → 回 `SAW:BANANA777`。
  **後果**：`cc-harness.md` 有 `argument-hint: "[doctor]"` 但本文沒有 `$ARGUMENTS`，
  所以 `/cc-harness doctor` 的 `doctor` 收不到，**唯讀模式打不開、每次都跑會寫檔的安裝模式**。
  P3 A/B 觀察期（至 2026-09-10）不動 skill 本文，所以本輪只記在 `test/test_skills.py`
  的 `KNOWN_GAPS`（每次跑都印 warning）＋BACKLOG 一行，解禁後修。

- **2026-09-04**｜plugin 提供的 command 在逐字稿裡帶 plugin 名前綴（`cc-harness:cc-close`），
  等於改名、計數器歸零（違反原則 4）。證據：已裝的 codex plugin 的 command 在本 session
  skill 清單顯示為 `codex:rescue`／`codex:setup`。
  對策：`tools/skill-usage.py` 加 `PLUGIN_PREFIXES`，`canon()` 先剝前綴再查 `ALIASES`。
  改完重跑 `--toolcount --family`，A/B 基線數字不變（cc-close median 17／n=20、
  cc-gate 38／n=4、cc-handover 4／n=3），確認沒動到對照組。

- **2026-09-04**｜`claude plugin validate <path> --strict` 是 P5 的驗收指令，**存在且會擋**。
  實測：`commands`／`hooks` 指到不存在的路徑時 exit 1 並指名；補上後 `✔ Validation passed`。
  `claude plugin details <name>` 需要先安裝（沒有 `--plugin-dir`），所以 token 成本投影
  要等實裝那步才有。

- **2026-09-04（輪 2，兩次修正後的定稿）**｜**command 走原始 repo，hook 走安裝快取——
  同一個 plugin 兩種行為。** 輪 1 記成「全部走快取，不 bump 等於沒改」是錯的；
  輪 2 第一次更正記成「全部走原始目錄」也是錯的。實測三次才收斂：
  - **command 走 repo**：改一支 plugin command 的本文、不 bump、直接 headless 呼叫
    → 新本文生效；同一支印出 `CLAUDE_PLUGIN_ROOT=~/Documents/3.AGENT/cc-harness`。
  - **hook 走快取**：PreToolUse 的錯誤訊息印出
    `…/plugins/cache/cc-harness/cc-harness/0.1.3/hooks/guard-bash.mjs`，當時 repo 已是 0.1.4；
    再在 `hooks/session-start.sh` 插一行標記、不 bump、開新 session → 標記**沒有**出現。
    版本在 **session 開始時釘住**，所以 update 完還要重開 session。
  - `installed_plugins.json` 的 `installPath` 指快取，`known_marketplaces.json` 的
    `installLocation` 指 repo——兩個路徑同時存在，這就是兩種行為的來源。
  **後果**：改 `hooks/`／`tools/` 要 bump＋`claude plugin update`＋重開 session；
  改 `commands/`／`templates/` 不用。`tools/check-plugin-sync.sh` 因此只比前兩個目錄。
  **教訓**：輪 1 只看到「快取沒變」就推論「快取是載入來源」，輪 2 只看到「command 是活的」
  就推論「全部都是活的」。兩次都是拿一個元件的觀察去蓋全部。

- **2026-09-04**｜**`plugin.json` 不要宣告 `hooks`——`hooks/hooks.json` 是標準路徑，會自動載入。**
  兩邊都有 → `Duplicate hooks file detected` → **整個 plugin `failed to load`**，
  四個 hook 全部沒跑。`claude plugin validate --strict` **驗不出來**（加回去重測，仍回
  `✔ Validation passed`），唯一看得見的地方是 `claude plugin list` 的 Status。
  這個 bug 從輪 1 實裝起活了一整輪，被第二個 repo 的 `/cc-harness doctor` 抓到。
  對策：`tools/check-plugin-loads.sh` 進 `test/run-all.sh`，讀 `plugin list` 的 Status。
  **死法**：官方哪天讓 `validate` 自己驗載入期錯誤，這支就多餘，拆掉。

- **2026-09-04**｜**`plugin.json` 不吃 `env`**，所以計畫 P5 那條「plugin settings 帶
  `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`／`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`」
  **做不到**。實測：加上去 `--strict` 回 `Unknown field 'env'. Claude Code ignores it at load time.`
  唯一落點是 `~/.claude/settings.json` 的 `env` 區塊——但那是**全帳號行為改動**，
  與「不做跨專案共用產物：定義可全帳號，行為只作用當前 repo」相衝，所以**不做**，
  留 BACKLOG 一行等使用者決定。

- **2026-09-04**｜`CLAUDE_PLUGIN_ROOT` 在 command 本文的 Bash 區塊會展開，
  且 `directory` source 時等於**原始 repo 路徑**。所以 `cc-harness.md` 直接寫
  `${CLAUDE_PLUGIN_ROOT}/templates/`、`${CLAUDE_PLUGIN_ROOT}/tools/check_docs.py`，
  不再需要 `~/claude-harness/` 那條死路徑。

- **2026-09-04**｜`cc-harness.md` 改寫完 **4,782 → 3,535 字元**，P2 訂的 ≤3,500 目標
  **差 35 字**。沒有為了那 35 字刪規則——樣板搬走後剩下的都是行為規則
  （寫入邊界、W4.1–4.3、自檢五項、憲法 6 條、死法）。本條取代〈未達標〉那條舊記錄。

- **2026-09-04**｜實裝時**必須同時移除 `~/.claude/settings.json` 的四個 harness hook**。
  它們與 plugin 的 `hooks.json` 指到同兩支腳本，兩邊都在＝每個事件跑兩次，
  `harness.log` 雙倍計數、開場那兩行印兩遍。已移除（`hooks` 鍵整個沒了），
  guard-bash 這第五個 hook 只由 plugin 提供。

- **2026-09-04**｜`claude plugin details cc-harness` 給出 P6 要的分子：
  always-on **~564 tok**／每 session；on-invoke 由 `cc-grill` ~690 到 `cc-harness` ~4.1k
  （後者最大，與「`cc-harness.md` ≤3,500 字元未達」那條對得上）。
  P6 訂上限時用這支，不要自己數字元。

- **2026-09-04**｜`claude plugin validate .` 在 `plugin.json` 與 `marketplace.json` 都存在時
  **只驗 marketplace，plugin.json 被跳過**。所以 `test/run-all.sh` 改成逐檔驗兩份。

- **2026-09-04**｜兩處落點偏離計畫的目標形態，**刻意**：
  `check_docs.py` 放 `tools/` 不放 `scripts/`（plugin 出貨的都在 `tools/`；per-repo 複本
  才叫 `scripts/check_docs.py`，`templates/hooks/pre-commit` 兩個路徑都找）；
  測試放既有的 `test/` 不新開 `tests/`（一個目錄勝過兩個）。
  **死法**：下一輪若有人找不到這兩支而重建一份，就是落點選錯，改回計畫寫的路徑。

- **2026-09-04**｜`tools/check_docs.py` 的 BACKLOG 條數上限**以 `BACKLOG.md` 檔頭自己寫的
  「上限 N 條」為準**，檔頭沒寫才用預設 20。理由：本 repo 檔頭寫 12、腳本預設 20，
  兩份事實且使用者只會讀到檔頭那份。

- **2026-09-04**｜`check_docs.py` 的 BACKLOG 判定原本**對表格式 BACKLOG 完全失效**：
  項目 regex 只認 `- x`／`1. x`，本 repo 的 BACKLOG 是 markdown 表格，所以條數與行長兩項
  都在報綠卻什麼都沒驗。補上「第一格是純數字的表格列」後立刻抓到 5 條超長（含 R2／R3 就寫進去的）。
  教訓：閘寫完要餵一份**確定該紅**的輸入，綠燈本身不是證據。

- **2026-09-04**｜`cc-harness.md` 自檢寫「`check_docs` 應有四類判定」，通用版現在有**六類**
  （加了 plugin manifest 死指標、git hook 一致性）。P5 輪 2 改 `/cc-harness` 時要同步這個數字，
  否則安裝後自檢會報「缺兩類」。

- **2026-09-06**｜`/cc-harness` 的作用範圍**收斂到當前 repo**：拿掉第二段第 4 項
  「唯讀比對全域層」（帳號 `CLAUDE.md`／`output-styles/eli5.md`／`claude plugin list` 在場與否）。
  理由：本 skill 是 repo 骨架的閘，帳號層歪掉要靠帳號層自己的閘抓，一支 skill 同時管兩層
  等於在 repo 的體檢報告裡混進使用者當下不能處理的東西。唯一保留的跨層讀取是
  `check_docs.py` 第 7 類（常駐載入預算），它需要帳號 `CLAUDE.md` 與 `MEMORY.md` 當分子。
  **翻案條件**：出現「帳號層缺件導致 repo 端 harness 靜默失效」的實例，且沒有其他閘會抓到。

- **2026-09-13**｜新增 `templates/.claude/settings.json`：只宣告 `extraKnownMarketplaces`
  （`source: github`／`roylam-beep/cc-harness`）＋ `enabledPlugins`，**不放 hook**。
  理由：cloud session 是另一台機器，只讀 repo 內 commit 過的檔，`~/.claude/` 拿不到；
  沒有這張紙條，cc-* 在 cloud 不存在。來源不可寫本機那份的 `directory`＋絕對路徑。
  既有 `.claude/settings.json` 依表不動、不合併 JSON，缺宣告改由 **W4.4** 報。
  **[需確認]**：`roylam-beep/cc-harness` 目前是 PRIVATE，cloud session 能不能裝
  private marketplace 沒實測——見 BACKLOG 11。
- **2026-09-28**｜本機 project scope 卡舊版的修法是**逐 repo 跑 `claude plugin update cc-harness --scope project`**，
  不是 `uninstall --scope project`。實測四個 repo（0.2.9／0.3.4 → 0.4.4）版控檔零變動。
  `uninstall` 預期會一起拿掉 repo 版控裡 `.claude/settings.json` 的 `enabledPlugins`（未實測），等於拆掉上一條的 cloud 紙條。
  `claude plugin update` 不帶 `--scope` 只更新 user scope。

## A/B 進行中

- **2026-09-03 起算一週**｜拿掉 `~/.claude/settings.json` 的 `UserPromptSubmit` echo。
  原內容：`echo '【契約】結論＋1 待決；細節寫檔給路標'`。
  理由：官方對 Opus 5 的指引說每輪重插指令是舊模型的 retention crutch。
  **判定（2026-09-10）**：回覆長度與冰山憲法遵守度沒變差 → 永久拿掉，本條改「已定案」；
  變差 → 用上面那行原文加回去，並在本檔記「Opus 5 仍需要每輪重插，官方指引在本 harness 不成立」。

## skill 家族成員

- **2026-09-04**｜`simple-explain` **併入 plugin，改名 `cc-explain`**——推翻計畫
  〈待拍板〉①「不併」那條（原理由：改名會讓 31 次的計數器歸零，違反原則 4）。
  **使用者定案**：計數器可以用 `ALIASES` 同步到最終使用數，「真的只剩一份定義」比避免改名重要。
  做法：`commands/cc-explain.md` 為唯一本文；`tools/skill-usage.py` 的
  `ALIASES["cc-explain"] = ["simple-explain"]` 接回舊名（實測接上：`--family` 顯示 32 次）；
  `~/.claude/skills/simple-explain/` 已刪；`~/.claude/output-styles/eli5.md`
  的〈重講協議〉改成一行指標——**這就是 2026-09-03 說「只砍 eli5 那段就解掉 dup」
  但一直沒做的那件，本次一併做掉**。
  同時解除本 repo 規矩 3 的 90 天改名凍結一次，**僅此一支**，因為 `ALIASES` 正是為了
  讓改名可存活而存在。
  死法：`cc-explain.md` 自己那段（2026-10-04 重量，跌破 16 次／30 天就退役）。

## P3 A/B 作廢

- **2026-09-23**｜P3 三支扛量 skill（cc-handover／cc-close／cc-gate）的 A/B 觀察期**作廢**，使用者決定。
  理由：原訂 2026-09-10 判定沒做；對照組在 `ac3f29d`、`470bab5` 已被改（接 spec 層），after 數字量不出 P3 的效果。
  四段改寫保留現狀，不 revert；基線 `docs/ab/2026-09-03-p3-baseline.md` 留作歷史，不再產 after 檔。

## 規則本文不敘述歷史

- **2026-09-03**｜skill 本文（`~/.claude/commands/cc-*.md`）只寫現行規則，
  不寫「X 已於 <日期> 退役／定案」。退役史的唯一落點是
  `~/.claude/retired-commands/README.md` 的兩張表（skill 一張、harness 標準件一張）。
  **例外（2026-09-03 加）**：死法段的**未來期限**是規則本身，不是歷史敘述，允許寫日期。
  驗證改成「死法段以外不得有日期」：
  ```bash
  awk 'FNR==1{skip=0} /^## 死法/{skip=1} skip==0 && /20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]/{print FILENAME":"FNR": "$0}' ~/.claude/commands/cc-*.md
  ```
  輸出為空即通過。
- **2026-09-24**｜上面的日期例外**取消**：使用量死法拆掉後，command 本文不再有未來期限，
  `test/test_skills.py` 改成 command 本文一律不得有日期。

## 未達標，明列

- ~~**2026-09-03**｜`cc-harness.md` ≤3,500 未達（4,751）~~ → P5 輪 2 改寫成 3,535，
  差 35 字，見〈plugin 化（P5）〉最後一條。
  **2026-09-04（P6）**：加第 7 類的一行後 3,540，差 40 字。仍未達，沒有再壓。

- **2026-09-03**｜P3 計畫要 `simple-explain` 也改日期型死法，**沒做**。
  理由：它近 30 天 30 次，是第二高，門檻（<5 次）永遠不會觸發，加了是純噪音，
  與 P3「減約束」本身相衝。要給它死法，得先想出一個會真的觸發的條件。
- **2026-09-03**｜P3 計畫的「allowed-tools 收成逐條白名單」**改成只做半套**。
  理由：實測 allowed-tools 不收斂工具（見上）。唯讀那三支改用 `disallowed-tools` 才真的擋；
  cc-close／cc-gate／cc-handover 這種本來就要寫檔的，工具粒度的白名單給不出保護
  （擋不了「只准寫 docs/plans/**」這種路徑條件），allowed-tools 只留作預先放行減少提示。
  真要擋路徑，落點是 `hooks/guard-bash.mjs` 那類 PreToolUse hook，不是 frontmatter。
