## Purpose
砍掉不損功能的肥肉、補 BACKLOG 兩個缺口，並把派工 4 支拆成同 repo 的第二個 plugin。計畫與決定見 `docs/plans/2026-10-29-harness-slim-split.md`。

## 不做
- 不改 cc-dispatch／cc-cursor／cc-claude／cc-pr 的行為，只搬家與改指令名稱
- 不改 `gate.env` 格式，`docs/changes/`、`tools/spec_merge.py`、`SPEC.md` 留在主 plugin
- 不動帳號層 `~/.claude/CLAUDE.md`
- 不合併或退役其他指令
- 執行者不 bump 版號

## ADDED Requirements

### Requirement: BACKLOG 編號唯一
`check_docs.py` SHALL 在 `BACKLOG.md` 表格出現重複編號時退出碼 1，並指出重複的編號與行號。

#### Scenario: 兩列同編號
- **WHEN** `BACKLOG.md` 有兩列第一格都是 `18`
- **THEN** 退出碼 1，訊息含 `18` 與兩個行號

#### Scenario: 編號都不同
- **WHEN** 每列編號都不重複
- **THEN** 這項檢查不產生任何訊息

### Requirement: BACKLOG 過期警告
`check_docs.py` SHALL 對 `BACKLOG.md` 日期欄早於今天 30 天以上的列印 `⚠️` 與行號，退出碼不因此變成 1；天數可用 `BACKLOG_STALE_DAYS` 改。

#### Scenario: 舊條目
- **WHEN** 某列日期是 31 天前
- **THEN** 印 `⚠️` 含該列行號，退出碼 0

#### Scenario: 自訂天數
- **WHEN** `BACKLOG_STALE_DAYS=60` 且某列日期是 31 天前
- **THEN** 不印警告

### Requirement: 派工 plugin 獨立安裝
`marketplace.json` SHALL 列出 `cc-harness` 與 `cc-dispatch` 兩個 plugin，兩份宣告都通過 `claude plugin validate --strict`，派工 4 支只存在於 `plugins/cc-dispatch/commands/`。

#### Scenario: 兩份宣告都合法
- **WHEN** 跑 `claude plugin validate plugins/cc-dispatch/.claude-plugin/plugin.json --strict` 與 repo 根的兩份宣告
- **THEN** 全部退出碼 0

#### Scenario: 主 plugin 不帶派工指令
- **WHEN** 列 `commands/`
- **THEN** 沒有 `cc-dispatch.md`、`cc-cursor.md`、`cc-claude.md`、`cc-pr.md`

### Requirement: Cursor 看守腳本只准背景跑
`cc-dispatch` plugin 的 PreToolUse(Bash) hook SHALL 擋下前景執行 `wait-for-run.js`，放行背景執行與只是提到該路徑的指令。

#### Scenario: 前景執行
- **WHEN** Bash 指令是 `node …/wait-for-run.js a b` 且 `run_in_background` 不是 true
- **THEN** hook 擋下並說明要改背景跑

#### Scenario: 背景執行
- **WHEN** 同一條指令且 `run_in_background` 是 true
- **THEN** 放行

#### Scenario: 只是列檔
- **WHEN** 指令是 `ls …/wait-for-run.js`
- **THEN** 放行
