# BACKLOG — 範圍外發現，一件一行

**上限 12 條。** 滿了就由收輪整行搬 `docs/archive/ICEBERG.md` ＋一字理由
（done／stale／absorbed／deferred），不改寫。**一行 ≤120 字**，兩者都由
`tools/check_docs.py` 守（清單列與表格列都算）。

任何 session 都能直接加一行並當輪 commit——這不是收輪專屬的檔。
一行要能自己站住：**做什麼＋在哪個檔＋為什麼**，讀的人不需要回頭找對話。

| # | 一行 | 來源 |
|---|---|---|
| 2 | `commands/cc-close.md` 的 gate 觸發規則自相衝突（harness 輪次兩句同時成立），該擇一寫死 | 範圍外發現（R2） |
| 3 | `cc-close` 退役訊號用「碰 `src/`」當分母，在無 `src/` 的 meta repo 恆真；要換分母 | 範圍外發現（R2 收輪） |
| 4 | `check-commit-risk` 的 `sk-` 樣式缺詞邊界，誤擋 `dsk-`；還在 google-meta-ads，收進 plugin 時加 `\b` | 範圍外發現（R3） |
| 6 | subagent 上限（`CLAUDE_CODE_MAX_*`）plugin 放不了，只能進帳號層 settings．env＝全帳號行為，待你決定 | 範圍外發現（R4 輪 2） |
| 8 | `hooks/guard-bash.mjs` 展不開變數：`rm -rf $T`（$T 在 scratchpad）被 fail-closed 誤擋 | 範圍外發現（R4 輪 2 實測） |
| 9 | `.claude/**` 被當敏感路徑擋 Edit，連 repo 層也擋，逼 agent 改用 python 寫入＝完全繞過守衛 | 範圍外發現（R4 輪 2 實測） |
| 10 | 帳號 `~/.claude/CLAUDE.md` 3,585 → 目標 1,500（常駐上限 6,500 的分配前提，現在多借 2,085）；P2 未做完那批 | 範圍外發現（R5 P6） |
| 11 | `roylam-beep/cc-harness` 是 PRIVATE；cloud session 能否裝 private marketplace 未實測，不通就得開 public | 範圍外發現（2026-09-13） |
| 13 | 逐個已裝 plugin 的 repo 重跑 `/cc-harness`：換逐支跑的 pre-commit、補 `scripts/spec_merge.py`；舊 hook 不自報過期 | 範圍外發現（spec-layer） |
| 15 | `cc-dispatch.md` 三缺口：P0 直走 `/cc-cursor`、`sync` 標 `stale-base`、部署類「驗」須含 build；跑完一波再定 | grokbot 對照（09-23） |
