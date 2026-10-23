# cc-harness

Claude Code 專用的開發治理層（harness）：skill 家族、hook、閘、安裝器，包成一個 plugin。
目標一句話：**任何 repo 裝上它，開發流程長得一樣，而且每條規則都說得出它防的是哪個失敗。**

前身：散在 `~/.claude/commands/cc-*.md`、各 repo 的 `scripts/`、`docs/round.md` 的那套，
做過一次完整 review（`docs/reviews/`），結論是輸入端扎實、輸出端零量測。
本 repo 就是把那份 review 的修法做成可安裝、可測、可量測的一套。

## 目錄

```
.claude-plugin/plugin.json      plugin 宣告（version 是快取的 key，見「改了要 bump」）
.claude-plugin/marketplace.json marketplace 宣告（GitHub 或本機目錄都從這裡裝）
commands/cc-*.md                skill 家族 15 支（**唯一一份**，帳號層已清空）
hooks/hooks.json                plugin 掛的三個 hook
hooks/session-start.sh          開場印常駐載入字元數
hooks/guard-bash.mjs            PreToolUse(Bash) 攔不可逆指令（fail open）
templates/                      /cc-harness 安裝進 repo 的骨架（複製，不 symlink）
tools/check_docs.py             文件水位與死指標七類判定（pre-commit 掛這支）
tools/install-hooks.sh          把 templates/hooks/ 裝進當前 repo 的 .git/hooks/
tools/check-plugin-loads.sh     plugin 真的載入了嗎（validate 驗不出載入期錯誤）
tools/check-plugin-sync.sh      跑著的 hook 是不是當前版本
test/run-all.sh                 本 repo 的整包閘
docs/plans／reviews／ab／archive、docs/decisions.md
```

## 安裝（別的機器、別人）

```bash
claude plugin marketplace add roylam-beep/cc-harness
claude plugin install cc-harness@cc-harness
```

裝完重開 session，在要用的 repo 打 `/cc-harness` 鋪骨架。前提：

- macOS 或 Linux（hook 用 POSIX `sh`），PATH 上有 `node`、`git`、`python3`（沒有 `python3` 時 pre-commit 會放行，CI 照跑）。
- 只支援 GitHub：`/cc-dispatch`、`/cc-pr`、CI 範本用 `gh` 或 GitHub MCP；`tools/gate.sh` 可用 `REMOTE=`／`PR_REF=` 接其他遠端。
- `/cc-cursor` 要另外接 cursor-cloud MCP（不在本 plugin 內）；沒有時 `/cc-dispatch` 自動改派 `/cc-claude`。
- 設了 `CLAUDE_CONFIG_DIR` 的話，hook 與 `check_docs.py` 會改讀那個目錄。

## 怎麼跑

```bash
sh test/run-all.sh                                  # 整包閘（push 前）
python3 tools/check_docs.py .                       # 快閘（已裝成 pre-commit）
sh tools/install-hooks.sh                           # 裝 git hook
```

## 改了 command 就生效；改了 hook 要 bump

同一個 plugin 兩種行為（實測，見 `docs/decisions.md`）：

| 改了什麼 | 怎麼生效 |
|---|---|
| `commands/`、`templates/` 的本文 | 直接生效，下一次呼叫就是新的 |
| `commands/` **新增或刪除檔** | 同 hook：要 bump（清單從快取列，實測 2026-09-23） |
| `hooks/`、`tools/` | bump `version` → `claude plugin update cc-harness` → **重開 session** |

原因：command 走原始 repo，hook 走 `~/.claude/plugins/cache/…/<version>/` 的複本，
而版本在 session 開始時釘住。`sh tools/check-plugin-sync.sh` 守這件事。

## 規矩（本 repo 自己的，四條）

1. 不放憑證、真實帳號 ID、客戶名。
   所以本 repo **可以有 remote**——這是它跟 `~/.claude` 最大的差別。
2. 每支 skill、每道 gate、每條規則進來時寫一節 `## 防什麼`：一句話講它防的失敗。
   說不出來就不進。
   **不量使用次數**——叫了幾次不等於有沒有用（`docs/decisions.md`）。
3. **欄位語意一律實測，不照文件或名稱推。** frontmatter 欄位、設定鍵、hook 事件，
   要先有一次可重現的實測（headless 跑一遍，或從 binary 讀出程式路徑）才准寫進規則。
   反例：`allowed-tools` 名字像白名單、官方 schema 也寫「Tools available to the model」，
   實測卻完全不收斂工具——照名字推就會做出一個假的閘。
4. **計畫先寫死新增行數上限，超過就停下來砍。** review-loop 沒設上限膨脹到 +2,534 行整條作廢；
   重做設 180 行，實際 +126（`docs/decisions.md` 2026-09-27）。

## 版控

`main` 單線，remote 是 `roylam-beep/cc-harness`（public）。
push 一律當輪問使用者，不延續上一輪的授權。

- 本 repo 可用 /cc-dispatch 照 docs/changes/<slug>/tasks.md 派工：有 cursor-cloud MCP 就預設 Cursor agent，`gate.env` 寫 `EXECUTOR=claude` 改派 Claude 執行者（/cc-claude）。
