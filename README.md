# cc-harness

Claude Code 專用的開發治理層（harness）：skill 家族、hook、閘、安裝器，包成一個 plugin。
目標一句話：**任何 repo 裝上它，開發流程長得一樣，而且每條規則都有資料證明它該活著。**

前身：散在 `~/.claude/commands/cc-*.md`、各 repo 的 `scripts/`、`docs/round.md` 的那套，
做過一次完整 review（`docs/reviews/`），結論是輸入端扎實、輸出端零量測。
本 repo 就是把那份 review 的修法做成可安裝、可測、可量測的一套。

## 目錄

```
.claude-plugin/plugin.json      plugin 宣告（version 是快取的 key，見「改了要 bump」）
.claude-plugin/marketplace.json local marketplace 宣告（本機從這裡裝）
commands/cc-*.md                skill 家族 10 支（**唯一一份**，帳號層已清空）
hooks/hooks.json                plugin 掛的五個 hook
hooks/session-start.sh          開場印使用量與常駐載入字元數
hooks/log-harness-event.mjs     UserPromptExpansion／InstructionsLoaded／PreToolUse(Skill) 記帳
hooks/guard-bash.mjs            PreToolUse(Bash) 攔八類不可逆指令（fail open）
templates/                      /cc-harness 安裝進 repo 的骨架（複製，不 symlink）
tools/skill-usage.py            skill 真實使用量——**唯一使用記錄來源**
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
python3 tools/skill-usage.py --family --days 30     # 使用量
python3 tools/skill-usage.py --toolcount --family   # 每次呼叫的 tool call 數（A/B 分子）
sh tools/install-hooks.sh                           # 裝 git hook
```

## 改了 command 就生效；改了 hook 要 bump

同一個 plugin 兩種行為（實測，見 `docs/decisions.md`）：

| 改了什麼 | 怎麼生效 |
|---|---|
| `commands/`、`templates/` | 直接生效，下一次呼叫就是新的 |
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

1. 不放憑證、真實帳號 ID、客戶名。usage 腳本只輸出 skill 名與日期，不讀正文。
   所以本 repo **可以有 remote**——這是它跟 `~/.claude` 最大的差別。
2. 每支 skill、每道 gate、每條規則進來時帶「死法」，而且死法必須是 `skill-usage.py`
   或某個檔案能算出來的條件。寫不出可算的死法就不進。
3. 改名＝退役＋新建，計數器不延續；要改名先把舊名加進 `ALIASES`。90 天內不改名。
   搬進 plugin 會讓 skill 變成 `cc-harness:cc-close`，等於改名——所以 `skill-usage.py`
   有 `PLUGIN_PREFIXES` 先剝前綴再查表。
4. **欄位語意一律實測，不照文件或名稱推。** frontmatter 欄位、設定鍵、hook 事件，
   要先有一次可重現的實測（headless 跑一遍，或從 binary 讀出程式路徑）才准寫進規則。
   反例：`allowed-tools` 名字像白名單、官方 schema 也寫「Tools available to the model」，
   實測卻完全不收斂工具——照名字推就會做出一個假的閘。

## 版控

`main` 單線，remote 是 `roylam-beep/cc-harness`（private）。
push 一律當輪問使用者，不延續上一輪的授權。
