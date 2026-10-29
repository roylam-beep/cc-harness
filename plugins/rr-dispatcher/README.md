# rr-dispatcher

照 `docs/changes/<slug>/tasks.md` 工單派工的 plugin，從 cc-harness 拆出來（2026-10-29）。
同一個 repo、同一個 marketplace（`roylam-beep/cc-harness`）。

| 指令 | 做什麼 |
|---|---|
| `/rr-dispatcher:cc-dispatch` | 照工單算波次、派執行者、跑閘＋獨立驗收、合進整合分支 |
| `/rr-dispatcher:cc-cursor` | 派一個 Cursor cloud agent（要 cursor-cloud MCP） |
| `/rr-dispatcher:cc-claude` | 派一個背景 Claude 執行者 |
| `/rr-dispatcher:cc-pr` | 寫給人快速審的 PR body |

## 安裝

```bash
claude plugin install rr-dispatcher@cc-harness
```

`plugin.json` 宣告 `dependencies: ["cc-harness"]`：工單格式（`docs/changes/`、`spec_merge.py`、`gate.env` 欄位）、
`/cc-harness:cc-root`、`/cc-harness:cc-close` 都在 cc-harness，本 plugin 不另帶一份。
`docs/changes/README.md` 不在就先跑 `/cc-harness:cc-harness` 補骨架。

## 目錄

```
commands/      派工 4 支
hooks/         PreToolUse(Bash)：看守腳本 wait-for-run.js 只准背景跑（guard-watch-script.mjs）
tools/gate.sh  合併前閘：逐條跑 gate.env 的 GATE_n（cc-dispatch、cc-pr 用）
test/          gate.sh 與看守腳本 hook 的測試（由 repo 根的 test/run-all.sh 一起跑）
```

改了 `tools/` 或 `hooks/` 要 bump 本目錄 `.claude-plugin/plugin.json` 的 version，再 `claude plugin update rr-dispatcher@cc-harness` 並重開 session（同 cc-harness 的規矩）。
