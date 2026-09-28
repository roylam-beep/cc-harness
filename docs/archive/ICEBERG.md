# ICEBERG — 從 BACKLOG 逐出的項目

BACKLOG 滿載時整行搬進來，**不改寫**，加一字理由：
`done`（已做）／`stale`（過期）／`absorbed`（被別的改動吸收）／`deferred`（還想做，沒排到）。

**撈回規則**：只有 `deferred` 與 `stale` 可以撈回 BACKLOG，且要重寫成當下仍成立的一行。
`done` 與 `absorbed` 不撈回。撈回率的分母是 `deferred` ＋ `stale`，不是全部條目。

| # | 一行 | 理由 | 逐出日 |
|---|---|---|---|
| 7 | `gh-monthly-report` 的 `scripts/check_docs.py` 只有 2 類判定（缺 4 類），doctor 已報；要不要補是該 repo 的事 | absorbed（併入 BACKLOG 13 逐 repo 重跑） | 2026-09-22 |
| 12 | ~~`guard-bash.mjs` 擋下訊息指向 `docs/hooks.md`~~ → 2026-09-17 修掉 | done | 2026-09-22 |
| 14 | 下一輪 loop engine：`/cc-dispatch` 派工器（cursor-cloud MCP）＋ PR 合併／退回計數 ＋ `## 學到的` 撈回升格 | absorbed（cc-dispatch v0 已交；計數與 `## 學到的` 撈回在 `docs/plans/2026-09-23-loop-engine.md`） | 2026-09-23 |
| 1 | `tools/skill-usage.py --toolcount` 沒測試；它是 P3 A/B 唯一分子來源，算錯沒人會發現 | stale（skill-usage.py 已拆，見 docs/decisions.md 2026-09-24） | 2026-09-24 |
| 5 | `~/claude-harness/` 只剩一個沒人指的孤兒目錄（Aug 14 版 check_docs）。要不要刪是你的決定 | deferred（本機孤兒目錄，cloud session 碰不到，要你在本機決定） | 2026-09-24 |
| 4 | `check-commit-risk` 的 `sk-` 樣式缺詞邊界，誤擋 `dsk-`；還在 google-meta-ads，收進 plugin 時加 `\b` | deferred（在 google-meta-ads repo，不在本 plugin；收進 plugin 時再開） | 2026-09-28 |
