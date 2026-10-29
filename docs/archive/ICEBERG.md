# ICEBERG — 從 BACKLOG 逐出的項目

BACKLOG 滿載時整行搬進來，**不改寫**，加一字理由：
`done`（已做）／`stale`（過期）／`absorbed`（被別的改動吸收）／`deferred`（還想做，沒排到）。

**撈回規則**：只有 `deferred` 與 `stale` 可以撈回 BACKLOG，且要重寫成當下仍成立的一行。
`done` 與 `absorbed` 不撈回。

| # | 一行 | 理由 | 逐出日 |
|---|---|---|---|
| 7 | `gh-monthly-report` 的 `scripts/check_docs.py` 只有 2 類判定（缺 4 類），doctor 已報；要不要補是該 repo 的事 | absorbed（併入 BACKLOG 13 逐 repo 重跑） | 2026-09-22 |
| 12 | ~~`guard-bash.mjs` 擋下訊息指向 `docs/hooks.md`~~ → 2026-09-17 修掉 | done | 2026-09-22 |
| 14 | 下一輪 loop engine：`/cc-dispatch` 派工器（cursor-cloud MCP）＋ PR 合併／退回計數 ＋ `## 學到的` 撈回升格 | absorbed（cc-dispatch v0 已交；計數與 `## 學到的` 撈回在 `docs/plans/2026-09-23-loop-engine.md`） | 2026-09-23 |
| 1 | `tools/skill-usage.py --toolcount` 沒測試；它是 P3 A/B 唯一分子來源，算錯沒人會發現 | stale（skill-usage.py 已拆，見 docs/decisions.md 2026-09-24） | 2026-09-24 |
| 5 | `~/claude-harness/` 只剩一個沒人指的孤兒目錄（Aug 14 版 check_docs）。要不要刪是你的決定 | deferred（本機孤兒目錄，cloud session 碰不到，要你在本機決定） | 2026-09-24 |
| 4 | `check-commit-risk` 的 `sk-` 樣式缺詞邊界，誤擋 `dsk-`；還在 google-meta-ads，收進 plugin 時加 `\b` | deferred（在 google-meta-ads repo，不在本 plugin；收進 plugin 時再開） | 2026-09-28 |
| 11 | `roylam-beep/cc-harness` 是 PRIVATE；cloud session 能否裝 private marketplace 未實測，不通就得開 public | done（10-03 實測 private 跨 repo 抓不到→改 public＋Setup script；後續裝上 0.4.10 時已是 public，見 decisions） | 2026-10-03 |
| 6 | subagent 上限（`CLAUDE_CODE_MAX_*`）plugin 放不了，只能進帳號層 settings．env＝全帳號行為，待你決定 | deferred（帳號層 settings．env 是全帳號行為，等使用者決定；repo 內無事可做） | 2026-10-04 |
| 3 | `cc-close` 退役訊號用「碰 `src/`」當分母，在無 `src/` 的 meta repo 恆真；要換分母 | stale（退役訊號整個拆掉，見 docs/decisions.md 2026-10-04） | 2026-10-04 |
| 2 | `commands/cc-close.md` 的 gate 觸發規則自相衝突（harness 輪次兩句同時成立），該擇一寫死 | absorbed（gate 改由 `/cc-close` 收輪派子 agent 跑，不再寫進 kickoff 欠一個 session） | 2026-10-16 |
| 10 | 帳號 `~/.claude/CLAUDE.md` 2,842 → 目標 1,500（多借 1,342）；10-18 已刪平台副本，剩的都是平台管不到的 | stale（10-20 帳號 CLAUDE.md 瘦身回溯，目標作廢，見 decisions） | 2026-10-20 |
| 8 | `hooks/guard-bash.mjs` 展不開變數：`rm -rf $T`（$T 在 scratchpad）被 fail-closed 誤擋 | absorbed（搬進 cch-lite BACKLOG） | 2026-10-30 |
| 9 | `.claude/**` 被當敏感路徑擋 Edit，連 repo 層也擋，逼 agent 改用 python 寫入＝完全繞過守衛 | absorbed（搬進 cch-lite BACKLOG） | 2026-10-30 |
| 13 | 逐個已裝 plugin 的 repo 重跑 `/cc-harness`：換逐支跑的 pre-commit、補 `scripts/spec_merge.py`；舊 hook 不自報過期 | stale（本 repo 凍結；spec_merge 已移出，cch-lite 不再出貨它） | 2026-10-30 |
| 15 | `cc-dispatch.md` 三缺口：P0 直走 `/cc-cursor`、`sync` 標 `stale-base`、部署類「驗」須含 build；跑完一波再定 | absorbed（搬進 rr-dispatcher BACKLOG） | 2026-10-30 |
| 16 | `tools/gate.sh` 本身被 TERM 時，GATE 指令的 process group 不會一起殺（只有逾時分支會）；trap 補 kill -pgid | absorbed（搬進 rr-dispatcher BACKLOG） | 2026-10-30 |
| 17 | 本 repo 的 project-scope 安裝 0.3.4 蓋過 user 0.4.3，hook 跑舊版；`check-plugin-sync.sh` 只比 user→假綠 | absorbed（搬進 cch-lite BACKLOG） | 2026-10-30 |
| 18 | `commands/cc-claude.md` 第 4 步假設 `Agent` 有 `name` 參數；本環境沒有，`agent:<handle>` 追問必走重開備案 | absorbed（搬進 rr-dispatcher BACKLOG） | 2026-10-30 |
| 19 | `tools/spec_merge.py check` 偵測兩份進行中 change MODIFY 同一 Requirement；後 `--apply` 會蓋掉前一份的 Scenario | stale（--apply 已拿掉，不再合併就不會互蓋） | 2026-10-30 |
| 20 | `cc-harness.md` 沒寫 `.claude/` 被 `.gitignore` 排除時怎麼辦；brag 安裝靠 agent 臨場 `git add -f` 才進版控 | absorbed（搬進 cch-lite BACKLOG） | 2026-10-30 |
| 21 | `cc-dispatch.md` 第 102、141 行用狀態 `blocked`，但第 76 行的狀態值清單沒有它；擇一補齊 | absorbed（搬進 rr-dispatcher BACKLOG） | 2026-10-30 |
