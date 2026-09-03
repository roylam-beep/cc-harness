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
| 5 | `cc-harness.md` 有 argument-hint 卻無 `$ARGUMENTS`，`doctor` 收不到、唯讀模式打不開；09-10 後修 | 範圍外發現（R4 測試抓到） |
| 6 | `cc-harness.md` 缺死法段；與上一條同時點補，補完刪 `test/test_skills.py` 的 `KNOWN_GAPS` | 範圍外發現（R4） |
| 7 | `check_docs.py` 第三份複本在 `~/claude-harness/tools/`（Aug 14 版），輪 2 改指 plugin 並砍掉 | 範圍外發現（R4） |
