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
commands/cc-*.md                skill 家族 7 支（**唯一一份**，帳號層已清空）
hooks/hooks.json                plugin 掛的五個 hook
hooks/session-start.sh          開場印使用量與常駐載入字元數
hooks/log-harness-event.mjs     UserPromptExpansion／InstructionsLoaded／PreToolUse(Skill) 記帳
hooks/guard-bash.mjs            PreToolUse(Bash) 攔九類不可逆指令（fail open）
templates/                      /cc-harness 安裝進 repo 的骨架（複製，不 symlink）
tools/skill-usage.py            skill 真實使用量——**唯一使用記錄來源**
tools/check_docs.py             文件水位與死指標六類判定（pre-commit 掛這支）
tools/install-hooks.sh          把 templates/hooks/ 裝進當前 repo 的 .git/hooks/
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

## 改了就生效，不用 bump version

本機以 `directory` source 裝，**runtime 直接讀這個 repo**——`CLAUDE_PLUGIN_ROOT`
實測等於 `/Users/roy-mac/Documents/3.AGENT/cc-harness`，改了 `commands/` 的檔
下一次呼叫就生效，不必 bump `version`、不必 `claude plugin update`。
`~/.claude/plugins/cache/` 底下那份是安裝時的複本，**不是載入來源**。

`version` 只在對外發布（github source）時才是快取的 key。

## 現況（P5 輪 1 做完）

- P0–P4 完成。P3 在 A/B 觀察期，**2026-09-10 判定**（條件見 `docs/decisions.md`〈A/B 進行中〉）。
- P5 輪 1 **做完**：plugin 目錄結構、七類 skill 契約測試、六類文件閘、骨架樣板、
  本機實裝（`cc-harness@cc-harness`，user scope）都到位，閘全綠。
  `~/.claude/commands/` 已清空 cc-*，`settings.json` 的四個 harness hook 也移除
  （plugin 的 `hooks.json` 接手；不移除會每個事件跑兩次）。**skill 現在只有一份，在 `commands/`。**
- **還沒做（P5 輪 2）**：`/cc-harness` 改成讀 `templates/` 而不是內嵌全文；
  它自檢寫的「`check_docs` 四類」要改六類；砍掉 `~/claude-harness/tools/check_docs.py` 那第三份複本。
- P6 要的常駐總量分子已經有了：`claude plugin details cc-harness` 報
  always-on ~564 tok，per-skill on-invoke 從 cc-grill ~690 到 cc-harness ~4.1k。
- 計畫與逐階段 DoD：`docs/plans/2026-09-03-harness-optimize.md`。

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
