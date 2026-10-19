# 全 harness 寫死值掃描（2026-10-18）

範圍：plugin 程式（`hooks/`、`tools/`、`test/`、`templates/`）、plugin skill 本文（`commands/*.md`、`README.md`、`SPEC.md`）、
帳號層（`~/.claude/` 的 CLAUDE.md、settings、hooks、output-styles、自寫 skill）。3 個唯讀子 agent 平行掃，本檔彙整。

**進度**：§1 的 A 類 29 筆，修了 26 筆，3 筆沒修（理由見下）。§2 的 B 類 42 筆分成 27 條，做了 25 條，2 條不做（理由見下）。
`cc-watch` 的語言檢查已刪（`d84ee06`）。B 類原則：寫死的值改成可設定，**預設值等於原本的行為**。

- **§2 B 類（2026-10-19）**：plugin 這邊 `a0788d3`、`f063f63`、`e346778`、`9906981`、`fdfcd0a`（0.4.42–0.4.46），
  帳號層 `~/.claude` 這邊 `2a84ddb`、`d6d1b7d`、`92bd409`。新設定的說明寫在 `hooks/code-path.mjs`、`hooks/guard-bash.mjs` 檔頭，
  以及 `templates/docs/changes/README.md` 的 `gate.env` 段。
  - §2a：模板裡寫死的語言拿掉，`templates/README.md` 說錯的那句改正。機器會比對的固定字串，英文寫法也收：
    `Max N items`、`## Non-goals`／`## Out of scope`、`Verify:`、`Base:`／`Status:`／`## Learned`。14 支 skill 的 description 各補一組英文觸發詞。
    給人看的提示訊息照原則不翻。cc-watch 的語言檢查是 A 類那輪就刪掉的。
  - §2b：guard-bash 加 `CC_GUARD_BASH_ALLOW` 逐類放行，含第十類 `push-gate` 與 `rebase,amend`。另加三個設定：
    - `CC_GUARD_BASH_WATCH_SCRIPTS`：看守腳本名
    - `CC_REVIEWER_MODEL`：驗收用的模型
    - `CC_GUARD_BASH_DISPOSABLE`：可重生目錄
    
    `gate.env` 新增 `REVIEWER_MODEL`、`MAX_CONCURRENT`、`INTEGRATION_PREFIX`／`EXEC_PREFIX`／`DISPATCH_PREFIX`。
    範本的 plugin 來源改由 `tools/marketplace-repo.sh` 在安裝時推出來，本機實測結果是 `roylam-beep/cc-harness`。`EXECUTOR` 預設值在 A 類 §1d 就改了。
  - §2c：「是不是程式檔」的判定原本兩份重複，抽成 `hooks/code-path.mjs`，可用 `CC_DOC_EXTS`／`CC_NONCODE_PATHS` 追加。
    cc-watch 的驗證指令清單補了 rspec／mvn／gradle／dotnet／swift／flutter，瀏覽器 MCP 也加寬，這些只影響提醒，還可用 `CC_VERIFY_EXTRA` 追加。
    `check_docs` 加 `CHECK_DOCS_SRC_GLOBS`、`CHECK_DOCS_HOOK_DIRS`，檔頭自相矛盾的地方改成「複本只往下調」。
    `spec_merge` 加 `SPEC_MERGE_MAX_ACTIVE`、`SPEC_MERGE_WARN_CHARS`。`test_skills` 的退役目錄改認 `CLAUDE_CONFIG_DIR`／`CC_RETIRED_COMMANDS`。
  - §2c 的 `DISPOSABLE_NAMES` 刻意**不擴充預設清單**，只開 `CC_GUARD_BASH_DISPOSABLE` 讓人自己追加。
    理由：預設加進 `obj`、`Pods` 等於放寬一道刪除防線，會改變使用者的現行行為。
  - §2d：兩支腳本的 Accept-Language 改成 `--lang` 參數，**各自保留原本的預設值**（zh-TW／zh-HK 依目標市場不同，統一反而會改掉其中一支）。
    粵語字檢查改成 `--forbid=`。`settings.local.json` 移出版控。CLAUDE.md 裡 `/cc-grill` 的例外改成「skill 本文自己定提問數就照它」，SSOT 清單改標成舉例。
    `eli5.md` 補了沒裝 plugin 時的退路。README 不再重述 guard-userlevel 的放行清單。
- **B 類不做 2 條**：
  - `~/.claude/settings.json` 的 Laravel 檔名（`.env.production`、`.env.backup`、`storage/*.key`）：
    這些是通用的機密檔樣式，搬走會讓其他 repo 少一道 auto mode soft_deny，安全性變差。而且這個檔工作區裡有別人未提交的改動，分不開。
  - `~/.claude/skills/codebase-memory/SKILL.md` 的「14 MCP Tools」：檔案由 codebase-memory-mcp 的安裝器產生，不在版控裡，改了下次安裝會被蓋掉。
- **B 類未實測**：cc-watch 是用 `sh -c printf` 讀環境變數，在真 session 裡讀不讀得到沒有驗過（mod 環境沒有 `process`）。
  讀不到就退回內建行為，不會壞。`claude plugin test` 用假 host 驗過讀取流程。
- **範圍外未動**：`基準：` 的機器解析器在 `google-meta-ads-ga4-mcp/scripts/check-handover-freshness.mjs`，屬於另一個 repo，那支仍只認中文。
- §1a–1c：`03944fa`、`17cf7e5`、`4bd0d7f`（0.4.34–0.4.36）。§1d–1e：`0dc293a`、`5076b6d`（0.4.37）。
- §1f 帳號層：`~/.claude` 的 `c2c658d`。cbm hook 路徑與 plugin 本機目錄來源**改寫在 README「新機器還原」**，不改檔：
  前者由安裝器每台機器重新產生，後者是開發時要「改了立刻生效」。
- **沒修 3 筆**：`SPEC.md:9-18` 的 cursor-api 條目（是另一個 repo 的規格，搬過去要動那個 repo，且不會讓誰壞）；
  `allowed-tools` 的 `mcp__github__*` 前綴（只影響免確認，plugin 版 MCP 的實際前綴沒實測）；
  `cc-cloud-env.md:85` 與 `cc-harness.md:57-60` 對 cloud 裝不裝 plugin 講法相反——`/cc-cloud-env` 後來整支刪除，只剩 `cc-harness.md` 一種講法（仍未實測）。

判斷：**A**＝換機器／換 repo／換人就壞；**B**＝個人偏好，放在通用 plugin 會強加給別人；**C**＝合理，不改。

| 範圍 | A | B | C |
|---|---|---|---|
| plugin 程式與模板 | 9 | 22 | 21 |
| plugin skill 本文 | 13 | 6 | 14 |
| 帳號層 | 7 | 14 | 8 |
| 合計 | **29** | **42** | 43 |

## 1. A：換了就壞

### 1a. 預設分支、remote、平台寫死（影響最廣）

- `tools/gate.sh:14`：遠端寫死 `origin`、PR ref 寫死 GitHub 格式 → `gate.env` 加 `REMOTE=`、`PR_REF=`。
- `hooks/guard-bash.mjs:407`：只認 `origin/main`／`origin/master` → 先讀 `git symbolic-ref refs/remotes/origin/HEAD`。
- `templates/.github/workflows/harness.yml:7`：`branches: [main]` → 安裝時填實際預設分支。
- `commands/cc-claude.md:17`、`cc-cursor.md:17`、`cc-dispatch.md:19,21,93`、`cc-pr.md:3,16`、`cc-close.md:67`：base 沒給就 `main` → 同上，讀 origin/HEAD。

### 1b. 帳號層位置寫死

- `hooks/session-start.sh:15,30`、`tools/check_docs.py:240-249`、`hooks/guard-userlevel.mjs:59,66-67,280`：寫死 `~/.claude`，
  不認 `CLAUDE_CONFIG_DIR` → 改 `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`。guard-userlevel 這處最嚴重：設了的人帳號層完全沒保護。

### 1c. 下游 repo 會被擋

- `tools/check_docs.py:46,237-255`：常駐預算複製進下游 pre-commit，讀的是**提交者本人**的帳號 CLAUDE.md＋MEMORY.md，
  個人檔一大就在所有裝了 harness 的 repo 都 commit 不了 → 下游改只警告。
- `templates/hooks/pre-commit:7,10`：沒有 `python3` 每個 commit 都紅，與檔頭「不讓缺檔擋住所有 commit」矛盾 → 先 `command -v`。

### 1d. 依賴作者本機的服務

- `commands/cc-dispatch.md:2,14`、`cc-cursor.md:4,34-41`、`README.md:69`：預設執行者是 Cursor，靠作者自架的 `cursor-cloud` MCP
  （watch 腳本在 `/Users/roy-mac/Documents/cursor-api/`），plugin 沒附 → 預設改 `EXECUTOR=claude`，Cursor 選用。
- `SPEC.md:9-18`：寫的是另一個私有 repo（cursor-api）的行為 → 搬回該 repo。
- `commands/cc-dispatch.md:4,31`：`mcp__claude-code-remote__send_later` 只有特定環境有，沒寫退路。
- `commands/cc-show.md:4,15-22`：`mcp__visualize__*`、Artifact 是 desktop 專屬，沒寫「不在就退回純文字」。
- `commands/cc-claude.md:4`、`cc-dispatch.md:4`：MCP server id 寫死 `github`，本機實際是 `plugin:github:github`（只影響免確認清單）。
- `commands/cc-close.md:4,45`：`gh` 沒有 MCP 退路，沒裝 gh 會默默跳過「學到的」。

### 1e. 其他

- `commands/cc-close.md:59,69`：假設程式在 `src/**`、驗收是 `npm run verify` → 改讀 `implementation.md` 的 `paths` 與 `gate.env`。
- ~~`commands/cc-cloud-env.md:28,93`、`:85`~~：該 skill 已刪，兩筆不再適用。
- `commands/cc-claude.md:20`：模型別名白名單寫死，新家族會被拒。
- `commands/cc-dispatch.md:4,62`：`uuidgen` 在精簡 Linux 沒有 → 退回 `python3 -c 'import uuid…'`。
- `README.md:13-14`：只寫作者本機怎麼裝，沒有給別人的安裝法與前提清單。
- `test/test_skills.py:135-145`：驗 `~/.codex/` 等路徑在本機存在，沒裝 Codex 的貢獻者會紅。

### 1f. 帳號層

- `~/.claude/settings.json:10` 與 `hooks/cbm-code-discovery-gate`：hook 檔沒進版控，新機器 clone 後每次 Grep/Glob 跑不存在的 hook。
- `~/.claude/hooks/cbm-code-discovery-gate:6`：`BIN="/Users/roy-mac/.local/bin/…"`，找不到就靜默 `exit 0` → `command -v`。
- `~/.claude/settings.json:33`：plugin 來源寫死本機目錄，資料夾一搬整個 plugin 載不到。
- `~/.claude/skills/page-seo-compare/SKILL.md:26`：工具名寫死 `mcp__ahrefs__`，現在 connector 實際叫 `mcp__6e65a03c-…__`，**照字面會判成找不到**。
- `~/.claude/skills/page-seo-compare/SKILL.md:27`：寫死 2026-10 那時的 MCP 接法與目錄（已過時）。
- `~/.claude/skills/page-seo-compare/SKILL.md:10`：範例用別的 repo 的絕對路徑。
- `~/.claude/skills/page-seo-compare/scripts/measure.py:14`：`base='https://setuphk.com/'`，**量別的網站內外部連結全錯**。

## 2. B：個人偏好強加給別人

### 2a. 語言（與第二問相關）

- `templates/AGENTS.md:18-20`：「回覆語言：台灣繁體中文，無例外……鋪 harness 時不要刪」。
- `templates/.claude/settings.json:2`：`"language": "Traditional Chinese (Taiwan…)"`，會 commit 進下游 repo，整個團隊被設成繁中；
  `templates/README.md:25` 還說這檔「只宣告 plugin 來源」，與實際不符。
- `hooks/cc-watch-logic.ts:6-12`（觸發在 `cc-watch.tsx:128-129`）：每回合對所有安裝者檢查簡體字／港式字。
- 所有給人看的 hook 訊息、15 支 skill 的 description 觸發詞、機器解析的固定字串（`基準：`、`## 學到的`、`驗：`、`不做`）都只有中文。

### 2b. 工作流程寫死

- `hooks/guard-bash.mjs:47-55,403-434`：第十類（push 前要 gate 紀錄）對所有人預設開、只擋不問；唯一關法會連其他九類一起關。
- `hooks/guard-bash.mjs:18,38,231…`：「本 repo 是共用 worktree」一律擋 rebase／amend → 加逐類放行開關。
- `hooks/guard-bash.mjs:346,363`：擋 `wait-for-run.js`（作者本機腳本名）。
- `hooks/guard-bash.mjs:429`、`commands/cc-dispatch.md:2,109`、`cc-gate.md:13,47`：驗收員／gate 固定 Opus → `gate.env` 的 `REVIEWER_MODEL`。
- `commands/cc-dispatch.md:57-58`：同時上限固定 8 → 讀 `gate.env`。
- `templates/docs/changes/README.md:50`：`EXECUTOR` 預設 Cursor。
- `templates/.claude/settings.json:7`、`templates/README.md:28`：`roylam-beep/cc-harness` 寫死，fork 就指錯。
- 分支前綴 `exec/`、`claude/`、`dispatch/` 寫死。

### 2c. 判定清單太窄

- `hooks/cc-watch-logic.ts:15-16` `VERIFY_BASH`：漏 rspec、mvn、gradle、dotnet test、`uv run pytest`。
- `hooks/cc-watch-logic.ts:54`：只認幾個瀏覽器 MCP。
- `hooks/cc-watch-logic.ts:35-41` 與 `guard-bash.mjs:374-380`：「文件檔」判定兩份重複，只認 md/mdx/txt。
- `hooks/guard-bash.mjs:104-109` `DISPOSABLE_NAMES`：缺 `obj`、`.build`、`.dart_tool`、`_build`、`Pods`。
- `tools/check_docs.py:40-48,116,141,191-193`：預算檔頭說可調又說只降不升（自相矛盾）、只認中文檔頭、只認 `src/**`、只找兩個 hook 目錄。
- `tools/spec_merge.py:29,31-32,182`：節名只認中文、上限寫死。
- `test/test_skills.py:13`：`~/.claude/retired-commands` 是作者個人目錄。

### 2d. 帳號層

- `~/.claude/skills/content-audit/scripts/extract.py:168`（zh-TW）與 `page-seo-compare/scripts/measure.py:16`（zh-HK）：Accept-Language 互相矛盾。
- `~/.claude/skills/page-seo-compare/scripts/count_cjk_by_section.py:13`：不分國家都查粵語字。
- `~/.claude/settings.json:60-61,65`：某個 Laravel 專案的檔名清單放在帳號層。
- `~/.claude/settings.local.json` 進了版控（本來是單機專用）。
- `~/.claude/CLAUDE.md`：`/cc-grill` 例外寫在帳號層（plugin 停用就失效）；memory 規則的 SSOT 檔名寫得像封閉清單。
- `~/.claude/output-styles/eli5.md`：重講協議只指向 plugin，plugin 沒裝就空白。
- `~/.claude/README.md:18-19`：又重述一次 guard-userlevel 的放行清單。
- `~/.claude/skills/codebase-memory/SKILL.md:40`：「14 MCP Tools」已過時（實際 15 支）。

## 3. C：合理，不改（摘要）

`${CLAUDE_PLUGIN_ROOT}`、plugin 自己鋪的目錄約定（`docs/changes/`、`handovers/`、`BACKLOG.md`）、收斂用的設計常數
（3 輪、2 次、14 天）、測試固定測資、維護者專用工具（`check-plugin-sync.sh`）、作者資訊、只支援 GitHub 的產品範圍。

## 4. 順帶發現

- 交接單檔名兩支不一致：`commands/cc-close.md:53`（`<session-slug>.md`）vs `cc-handover.md:20`（`YYYY-MM-DD-<slug>.md`）。
