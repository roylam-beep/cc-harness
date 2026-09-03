# decisions — 已拍板的事，一條一行，不敘述過程

只記「現在是什麼」與「什麼情況會翻案」。過程與理由留在對應的 commit 訊息與 `docs/plans/`。

## harness 感測與量測

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

## A/B 進行中

- **2026-09-03 起算一週**｜拿掉 `~/.claude/settings.json` 的 `UserPromptSubmit` echo。
  原內容：`echo '【契約】結論＋1 待決；細節寫檔給路標'`。
  理由：官方對 Opus 5 的指引說每輪重插指令是舊模型的 retention crutch。
  **判定（2026-09-10）**：回覆長度與冰山憲法遵守度沒變差 → 永久拿掉，本條改「已定案」；
  變差 → 用上面那行原文加回去，並在本檔記「Opus 5 仍需要每輪重插，官方指引在本 harness 不成立」。

- **2026-09-03 起算一週**｜P3 三支扛量 skill（cc-handover／cc-close／cc-gate）改寫成四段、減約束。
  基線凍結在 `docs/ab/2026-09-03-p3-baseline.md`（cc-close median 17 tool call／n=20、
  cc-gate 38／n=4、cc-handover 4／n=3）。
  **判定（2026-09-10）**：用同兩條指令重跑寫成 `docs/ab/2026-09-10-p3-after.md`。
  某支 median tool call 上升，或產出檔不再符合輸出契約（交接單前兩行、kickoff 骨架、
  gate 判定首行）→ `git -C ~/.claude revert` 該支的改動；沒變差就留著並把本條改「已定案」。
  樣本太少（cc-gate、cc-handover 一週內可能 n<3）就延長觀察，不硬判。

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

## 未達標，明列

- **2026-09-03**｜`cc-harness.md` 目標 ≤3,500 字元，實際做到 4,751（原 5,847）。
  退役史只值約 600 字，壓縮重複 rationale 再約 500 字，其餘都是規則本文
  （寫入邊界、W4.1–4.3、四類 `check_docs` 判定、憲法 6 條）。
  要到 3,500 得刪規則——那是 P3「減約束」的決定，不在 P2 範圍。

- **2026-09-03**｜P3 計畫要 `simple-explain` 也改日期型死法，**沒做**。
  理由：它近 30 天 30 次，是第二高，門檻（<5 次）永遠不會觸發，加了是純噪音，
  與 P3「減約束」本身相衝。要給它死法，得先想出一個會真的觸發的條件。
- **2026-09-03**｜P3 計畫的「allowed-tools 收成逐條白名單」**改成只做半套**。
  理由：實測 allowed-tools 不收斂工具（見上）。唯讀那三支改用 `disallowed-tools` 才真的擋；
  cc-close／cc-gate／cc-handover 這種本來就要寫檔的，工具粒度的白名單給不出保護
  （擋不了「只准寫 docs/plans/**」這種路徑條件），allowed-tools 只留作預先放行減少提示。
  真要擋路徑，落點是 `hooks/guard-bash.mjs` 那類 PreToolUse hook，不是 frontmatter。
