# BACKLOG — 範圍外發現，一件一行

**上限 12 條。** 滿了就由收輪整行搬 `docs/archive/ICEBERG.md` ＋一字理由
（done／stale／absorbed／deferred），不改寫。**一行 ≤120 字**，兩者都由
`tools/check_docs.py` 守（清單列與表格列都算）。

任何 session 都能直接加一行並當輪 commit——這不是收輪專屬的檔。
一行要能自己站住：**做什麼＋在哪個檔＋為什麼**，讀的人不需要回頭找對話。

| # | 一行 | 來源 |
|---|---|---|
| 2 | `commands/cc-close.md` 的 gate 觸發規則自相衝突（harness 輪次兩句同時成立），該擇一寫死 | 範圍外發現（R2） |
| 8 | `hooks/guard-bash.mjs` 展不開變數：`rm -rf $T`（$T 在 scratchpad）被 fail-closed 誤擋 | 範圍外發現（R4 輪 2 實測） |
| 9 | `.claude/**` 被當敏感路徑擋 Edit，連 repo 層也擋，逼 agent 改用 python 寫入＝完全繞過守衛 | 範圍外發現（R4 輪 2 實測） |
| 10 | 帳號 `~/.claude/CLAUDE.md` 3,585 → 目標 1,500（常駐上限 6,500 的分配前提，現在多借 2,085）；P2 未做完那批 | 範圍外發現（R5 P6） |
| 13 | 逐個已裝 plugin 的 repo 重跑 `/cc-harness`：換逐支跑的 pre-commit、補 `scripts/spec_merge.py`；舊 hook 不自報過期 | 範圍外發現（spec-layer） |
| 15 | `cc-dispatch.md` 三缺口：P0 直走 `/cc-cursor`、`sync` 標 `stale-base`、部署類「驗」須含 build；跑完一波再定 | grokbot 對照（09-23） |
| 16 | `tools/gate.sh` 本身被 TERM 時，GATE 指令的 process group 不會一起殺（只有逾時分支會）；trap 補 kill -pgid | r2 驗收 NIT（09-27） |
| 17 | 本 repo 的 project-scope 安裝 0.3.4 蓋過 user 0.4.3，hook 跑舊版；`check-plugin-sync.sh` 只比 user→假綠 | 範圍外發現（09-28 實測） |
| 18 | `commands/cc-claude.md` 第 4 步假設 `Agent` 有 `name` 參數；本環境沒有，`agent:<handle>` 追問必走重開備案 | 範圍外發現（10-04 cc-audit） |
| 18 | `guard-bash.mjs` 第九類是字串比對：`ls …/wait-for-run.js` 只是列檔也擋（0.4.3 重現） | 範圍外發現（09-28 實測） |
| 19 | `tools/spec_merge.py check` 偵測兩份進行中 change MODIFY 同一 Requirement；後 `--apply` 會蓋掉前一份的 Scenario | 範圍外發現（R14） |
| 20 | `cc-harness.md` 沒寫 `.claude/` 被 `.gitignore` 排除時怎麼辦；brag 安裝靠 agent 臨場 `git add -f` 才進版控 | 範圍外發現（10-03 brag 實測） |
