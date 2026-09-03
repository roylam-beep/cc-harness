# cc-harness

Claude Code 專用的開發治理層（harness）：skill 家族、hook、閘、安裝器，最終包成一個 plugin。
目標一句話：**任何 repo 裝上它，開發流程長得一樣，而且每條規則都有資料證明它該活著。**

前身：散在 `~/.claude/commands/cc-*.md`（9 支）、各 repo 的 `scripts/`、`docs/round.md` 的那套，
2026-09-03 做了一次完整 review（`docs/reviews/`），結論是輸入端扎實、輸出端零量測。
本 repo 就是把那份 review 的修法做成可安裝、可測、可量測的一套。

## 現況（2026-09-03，P0）

- `docs/plans/2026-09-03-harness-optimize.md` — 六階段計畫，每階段有 DoD、輪數、不做清單。
- `docs/reviews/2026-09-03-harness-review.md` — 依據。四次增補：8 弱點重評、四層發現審計、
  memory 歸屬、cc- 家族實測使用量。
- `tools/skill-usage.py` — 從逐字稿算 skill 真實使用量。**這是整套 harness 唯一的使用記錄來源**，
  任何退役／改名／死法判定先跑它。

```bash
python3 tools/skill-usage.py --family --days 30
python3 tools/skill-usage.py --oneline        # 給 session-start hook 用
```

## 規矩（本 repo 自己的，三條）

1. 不放憑證、真實帳號 ID、客戶名。usage 腳本只輸出 skill 名與日期，不讀正文。
   所以本 repo **可以有 remote**——這是它跟 `~/.claude` 最大的差別。
2. 每支 skill、每道 gate、每條規則進來時帶「死法」，而且死法必須是 `skill-usage.py`
   或某個檔案能算出來的條件。寫不出可算的死法就不進。
3. 改名＝退役＋新建，計數器不延續；要改名先把舊名加進 `ALIASES`。90 天內不改名。

## 版控

本地 git，`main` 單線。remote 待使用者決定（計畫 P5）。
