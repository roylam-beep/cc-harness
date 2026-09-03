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

## A/B 進行中

- **2026-09-03 起算一週**｜拿掉 `~/.claude/settings.json` 的 `UserPromptSubmit` echo。
  原內容：`echo '【契約】結論＋1 待決；細節寫檔給路標'`。
  理由：官方對 Opus 5 的指引說每輪重插指令是舊模型的 retention crutch。
  **判定（2026-09-10）**：回覆長度與冰山憲法遵守度沒變差 → 永久拿掉，本條改「已定案」；
  變差 → 用上面那行原文加回去，並在本檔記「Opus 5 仍需要每輪重插，官方指引在本 harness 不成立」。

## 規則本文不敘述歷史

- **2026-09-03**｜skill 本文（`~/.claude/commands/cc-*.md`）只寫現行規則，
  不寫「X 已於 <日期> 退役／定案」。退役史的唯一落點是
  `~/.claude/retired-commands/README.md` 的兩張表（skill 一張、harness 標準件一張）。
  驗證：`grep -cE '20[0-9]{2}-[0-9]{2}-[0-9]{2}' ~/.claude/commands/cc-*.md` 全部為 0。

## 未達標，明列

- **2026-09-03**｜`cc-harness.md` 目標 ≤3,500 字元，實際做到 4,751（原 5,847）。
  退役史只值約 600 字，壓縮重複 rationale 再約 500 字，其餘都是規則本文
  （寫入邊界、W4.1–4.3、四類 `check_docs` 判定、憲法 6 條）。
  要到 3,500 得刪規則——那是 P3「減約束」的決定，不在 P2 範圍。
