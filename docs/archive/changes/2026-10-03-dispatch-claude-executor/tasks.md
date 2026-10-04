本工單由發包 session 依使用者指示（2026-10-03 /cc-grill 定案 14 條）直接實作，不派外部執行者；勾選由實作者在同一個 PR 補。

## 1. 原語與規則檔
- [x] 1.1 新增 /cc-claude：agent／session 兩模式、固定前言、預設 Sonnet、session 每 20 分鐘輪詢 6 次即 stalled、追問同一個執行者 ｜驗：python3 test/test_skills.py ｜所有權：commands/cc-claude.md
- [x] 1.2 規則檔派工節：Cursor 上限 8、Claude 上限 3、gate.env 的 EXECUTOR／EXECUTOR_MODEL 說明 ｜驗：grep -n 'MAX_CONCURRENT=8\|MAX_CONCURRENT_CLAUDE=3\|EXECUTOR=' templates/docs/changes/README.md ｜所有權：templates/docs/changes/README.md

## 2. 派工器
- [x] 2.1 cc-dispatch 依 EXECUTOR 選原語、上限分執行者、Claude 執行者先記帳與中斷接手、驗收員固定 Opus、gh 不能用改走 GitHub MCP ｜驗：python3 test/test_skills.py ｜所有權：commands/cc-dispatch.md
- [x] 2.2 README 提到 Claude 執行者、decisions.md 記本次決策與推送實測、plugin 版號 0.4.11 ｜驗：sh test/run-all.sh ｜所有權：README.md、docs/decisions.md、.claude-plugin/plugin.json
