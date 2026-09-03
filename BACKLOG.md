# BACKLOG — 範圍外發現，一件一行

**上限 12 條。** 滿了就由收輪整行搬 `docs/archive/ICEBERG.md` ＋一字理由
（done／stale／absorbed／deferred），不改寫。

任何 session 都能直接加一行並當輪 commit——這不是收輪專屬的檔。
一行要能自己站住：**做什麼＋在哪個檔＋為什麼**，讀的人不需要回頭找對話。

| # | 一行 | 來源 |
|---|---|---|
| 1 | `README.md` 兩節過期，一起修：「現況（2026-09-03，P0）」要改成 P1–P3 已做完、P3 在 A/B 觀察期；「## 版控」那節寫「本地 git，main 單線。remote 待使用者決定（計畫 P5）」——remote 已於 2026-09-03 開好，`roylam-beep/cc-harness`（PRIVATE），帳號層另有 `roylam-beep/dotclaude`。計畫 P5 的待拍板②也該同步標為已定案。 | 範圍外發現（R2）；remote 部分 2026-09-03 使用者指定補記 |
| 2 | `tools/skill-usage.py --toolcount` 沒有測試。`test/` 目前只有 `log-harness-event.test.mjs`。它是 P3 A/B 的唯一分子來源，算錯不會有人發現。 | 範圍外發現（R2） |
| 3 | `~/.claude/commands/cc-close.md` 的 gate 觸發規則自相衝突：「動了 `src/**` **或改了寫入治理**就加 gate 行」與下一句「純文件／harness／設定輪次不要加」在 harness 輪次同時成立。R2 判定以「改了寫入治理」為準（較具體），但規則本文該擇一寫死。 | 範圍外發現（R2） |
| 4 | `cc-close` 的死法「連續 3 輪 meta commit 多於碰 `src/` 的 commit ＝收輪程序在製造工作」在本 repo 恆真——cc-harness 本身沒有 `src/`，全部是 harness。對 meta repo 要換一個能算的分母（例如「碰 `tools/`＋`hooks/`＋`test/` 的 commit」）。 | 範圍外發現（R2 收輪） |
