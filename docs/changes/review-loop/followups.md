# review-loop followups（不擋合併的待修；收尾波次從這裡取）

| 來源 | 一行 |
|---|---|
| PR #3 r1 | `commands/cc-gate.md:18` 說 diff 只能碰 `docs/plans/**`，`:48` 又要寫進 `docs/changes/<slug>/tasks.md`，兩句矛盾（既有，非 1.3 造成） |
| PR #3 r1 | `tools/spec_merge.py` 讀到非 UTF-8 的 `tasks.md` 丟 traceback（rc=1），應退出碼 2 並印一行（既有） |
| PR #3 r1 | `docs/changes/README.md` 的 gate.env 節沒提 `--head` 模式、`KEEP_WT=1`、PR 模式缺 `gh` 退出碼 2（屬 gate-pr.sh 行為，1.2 合併後補） |
