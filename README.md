# cc-harness

Claude Code 專用的開發治理層（harness）：skill 家族、hook、閘、安裝器，包成一個 plugin。
目標一句話：**任何 repo 裝上它，開發流程長得一樣，而且每條規則都說得出它防的是哪個失敗。**

前身：散在 `~/.claude/commands/cc-*.md`、各 repo 的 `scripts/`、`docs/round.md` 的那套，
做過一次完整 review（`docs/reviews/`），結論是輸入端扎實、輸出端零量測。
本 repo 就是把那份 review 的修法做成可安裝、可測、可量測的一套。

## 目錄

```
.claude-plugin/plugin.json      plugin 宣告（version 是快取的 key，見「改了要 bump」）
.claude-plugin/marketplace.json local marketplace 宣告（本機從這裡裝）
commands/cc-*.md                skill 家族 12 支（**唯一一份**，帳號層已清空）
hooks/hooks.json                plugin 掛的兩個 hook
hooks/session-start.sh          開場印常駐載入字元數
hooks/guard-bash.mjs            PreToolUse(Bash) 攔八類不可逆指令（fail open）
templates/                      /cc-harness 安裝進 repo 的骨架（複製，不 symlink）
tools/check_docs.py             文件水位與死指標七類判定（pre-commit 掛這支）
tools/install-hooks.sh          把 templates/hooks/ 裝進當前 repo 的 .git/hooks/
tools/check-plugin-loads.sh     plugin 真的載入了嗎（validate 驗不出載入期錯誤）
tools/check-plugin-sync.sh      跑著的 hook 是不是當前版本
test/run-all.sh                 本 repo 的整包閘
docs/plans／reviews／ab／archive、docs/decisions.md
```

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

## 現況（P5 做完，兩輪）

- P0–P5 完成。P3 在 A/B 觀察期，**2026-09-10 判定**（條件見 `docs/decisions.md`〈A/B 進行中〉）。
- plugin 已裝（`cc-harness@cc-harness`，user scope，`directory` source ＝直接讀本 repo）。
  `~/.claude/commands/` 已清空 cc-*，`settings.json` 的 hook 也移除——**skill 與 hook 各只有一份**。
- `/cc-harness` 已改成讀 `templates/` 與 `${CLAUDE_PLUGIN_ROOT}/tools/check_docs.py`，
  本文 4,782 → 3,535 字元。第二個 repo（`gh-monthly-report`）跑過 doctor 驗收：
  寫入 0 檔、六類判定執行、舊式殘留有報、全域層比對有報。
- **P6 做完**（常駐載入預算）：`check_docs.py` 第 7 類守
  帳號 `CLAUDE.md` ＋ repo `AGENTS.md` ＋ `MEMORY.md` 合計 **≤ 6,500 字元**
  （＝帳號 1,500 ＋ `AGENTS.md` 4,000 ＋ `MEMORY.md` 1,000 三個上限的和，不是量測中位數；
  為什麼不用中位數見 `docs/decisions.md`）。
  公式與 `hooks/session-start.sh` 印的那行同一份，`test/check-docs-resident.test.sh` 守住不分岔。

## 規矩（本 repo 自己的，四條）

1. 不放憑證、真實帳號 ID、客戶名。
   所以本 repo **可以有 remote**——這是它跟 `~/.claude` 最大的差別。
2. 每支 skill、每道 gate、每條規則進來時寫一節 `## 防什麼`：一句話講它防的失敗。
   說不出來就不進。有看得見結果的條件（例：連續 3 次 pass）就寫成「退役訊號」。
   **不量使用次數**——叫了幾次不等於有沒有用（`docs/decisions.md`）。
   退役由 LLM 每季跑一次 `/cc-audit 本 repo 的 harness` 判；`/cc-audit` 只列不改，判定成立後由 LLM 另外退役並 commit。
3. **欄位語意一律實測，不照文件或名稱推。** frontmatter 欄位、設定鍵、hook 事件，
   要先有一次可重現的實測（headless 跑一遍，或從 binary 讀出程式路徑）才准寫進規則。
   反例：`allowed-tools` 名字像白名單、官方 schema 也寫「Tools available to the model」，
   實測卻完全不收斂工具——照名字推就會做出一個假的閘。
4. **計畫先寫死新增行數上限，超過就停下來砍。** review-loop 沒設上限膨脹到 +2,534 行整條作廢；
   重做設 180 行，實際 +126（`docs/decisions.md` 2026-09-27）。

## 版控

`main` 單線，remote 是 `roylam-beep/cc-harness`（private）。
push 一律當輪問使用者，不延續上一輪的授權。

- 本 repo 可用 /cc-dispatch 照 docs/changes/<slug>/tasks.md 派工：預設 Cursor agent，`gate.env` 寫 `EXECUTOR=agent|session` 改派 Claude 執行者（/cc-claude）。
