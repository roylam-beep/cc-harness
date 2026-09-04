# BACKLOG — 範圍外發現，一件一行

**上限 12 條。** 滿了就由收輪整行搬 `docs/archive/ICEBERG.md` ＋一字理由
（done／stale／absorbed／deferred），不改寫。**一行 ≤120 字**，兩者都由
`tools/check_docs.py` 守（清單列與表格列都算）。

任何 session 都能直接加一行並當輪 commit——這不是收輪專屬的檔。
一行要能自己站住：**做什麼＋在哪個檔＋為什麼**，讀的人不需要回頭找對話。

| # | 一行 | 來源 |
|---|---|---|
| 1 | `tools/skill-usage.py --toolcount` 沒測試；它是 P3 A/B 唯一分子來源，算錯沒人會發現 | 範圍外發現（R2） |
| 2 | `commands/cc-close.md` 的 gate 觸發規則自相衝突（harness 輪次兩句同時成立），該擇一寫死 | 範圍外發現（R2） |
| 3 | `cc-close` 死法用「碰 `src/`」當分母，在無 `src/` 的 meta repo 恆真；要換分母 | 範圍外發現（R2 收輪） |
| 4 | `check-commit-risk` 的 `sk-` 樣式缺詞邊界，誤擋 `dsk-`；還在 google-meta-ads，收進 plugin 時加 `\b` | 範圍外發現（R3） |
| 5 | `~/claude-harness/` 只剩一個沒人指的孤兒目錄（Aug 14 版 check_docs）。要不要刪是你的決定 | 範圍外發現（R4 輪 2） |
| 6 | subagent 上限（`CLAUDE_CODE_MAX_*`）plugin 放不了，只能進帳號層 settings．env＝全帳號行為，待你決定 | 範圍外發現（R4 輪 2） |
| 7 | `gh-monthly-report` 的 `scripts/check_docs.py` 只有 2 類判定（缺 4 類），doctor 已報；要不要補是該 repo 的事 | 範圍外發現（R4 輪 2） |
