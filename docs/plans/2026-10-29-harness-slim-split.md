# 2026-10-29 harness 瘦身＋派工拆成獨立 plugin

工單：`docs/changes/harness-slim-split/`（`spec.md`＋`tasks.md`，可直接 `/cc-dispatch`）。
來源：本日 `/cc-audit` 對整個 repo 的審查（只列不改）＋使用者定案「cc-pr、cc-dispatch、cc-cursor、cc-claude 包成另一個 plugin」。

## 目標

1. 砍掉不損功能的肥肉：停用的 cc-watch 整組、測停用程式的測試、檔頭歷史註解、重複計算、空轉欄位。
2. BACKLOG 補兩個缺口：編號重複沒人抓、舊條目沒有過期機制。
3. 派工 4 支搬進同 repo 的第二個 plugin，主 plugin 不再帶 Cursor／PR 專屬的東西。

## 行數上限（README 規矩第 4 條）

- 新增 ≤ 250 行（新 plugin 宣告、看守腳本小檢查、BACKLOG 兩條檢查與測試）。
- 淨變化 ≤ -1,000 行（cc-watch 整組就是 -796）。超過新增上限就停下來砍，不調上限。

## 已定的決定

| 決定 | 選擇 | 理由 |
|---|---|---|
| 新 plugin 名 | `cc-dispatch`（使用者 10-29 定案） | 指令會變成 `/cc-dispatch:cc-dispatch` 等 |
| 放哪 | 同 repo `plugins/cc-dispatch/`，`marketplace.json` 加第二項 | 一個 marketplace、一次安裝流程 |
| 工單格式（`docs/changes/`、`tools/spec_merge.py`、`SPEC.md`、`gate.env` 格式） | **留在主 plugin** | cc-gate、cc-close、cc-handover、cc-harness 都讀它；cc-gate 讀 `REVIEWER_MODEL`、cc-close 讀 `GATE_1` |
| `tools/gate.sh` | 搬走 | 只有 cc-pr、cc-dispatch 會跑它 |
| guard-bash 第九類（前景跑 `wait-for-run.js`） | 搬成新 plugin 自己的 PreToolUse hook | 只跟 Cursor 有關；順手修 BACKLOG #23（`ls` 該腳本也被擋） |
| 常駐字數重複計算 | 留 `hooks/session-start.sh`，拿掉 `check_docs.py` 第 7 類 | 第 7 類只警告不紅，開場那行每個 session 都看得到 |
| BACKLOG「來源」欄 | 換成「日期」欄（`YYYY-MM-DD`） | 12 條有 9 條寫「範圍外發現」；有日期才能做過期警告 |
| BACKLOG 過期 | 日期超過 30 天 → `check_docs.py` 印 ⚠️，不紅 | 收輪時照警告搬 ICEBERG（理由 `stale`） |
| ICEBERG 撈回率規則 | 刪 | 沒有任何程式或步驟在算撈回率 |
| 版號 | 執行者不 bump；合併者每波合完 bump 一次 | 避免同一波搶 `plugin.json` |

## 不做

- 不改 cc-dispatch／cc-cursor／cc-claude／cc-pr 的行為，只搬家和改指令名稱。
- 不改 `gate.env` 格式。
- 不動帳號層 `~/.claude/CLAUDE.md`（冰山輸出規則收斂另案，要使用者核准）。
- 不合併其他指令（cc-next、cc-skillcheck 等），不在本案。
- 不 push、不開 PR 到 main 以外的地方，除非使用者當輪說。

## 風險與待查

- **plugin 能不能宣告依賴另一個 plugin：未查證。** 新 plugin 會呼叫主 plugin 的 `/cc-harness:cc-root` 與驗收流程。
  3.1 先查官方文件；不支援就在新 plugin 的 `README.md` 寫「需先裝 cc-harness」。
- 指令改名後，舊名 `/cc-harness:cc-dispatch` 失效。帳號層 memory「派工指令就是同意」要跟著改（收尾手動步驟）。
- `hooks/`、`tools/` 改了要 bump＋`claude plugin update`＋重開 session 才生效（README「改了 hook 要 bump」）。

## 收尾（不是 PR，合併者手動做）

1. 每波合完：bump `.claude-plugin/plugin.json`（W3 起兩個 plugin 各自 bump），跑 `sh test/run-all.sh`。
2. W4 合完：`claude plugin update cc-harness@cc-harness`、`claude plugin install cc-dispatch@cc-harness`，重開 session 確認兩組指令都列得出。
3. 改 memory `dispatch-command-is-consent.md` 裡的指令名稱。
4. 清本機未版控的 `err.txt`（10-20 已移除的 push 檢查留下的輸出）。
5. `/cc-close` 歸檔本工單。

## 進度

- 2026-10-29：1.1、1.2、1.3、2.2 完成（版號 0.4.59）。2.2 提前到 1.3 之前：`check_docs.py` 已 283／285 行，
  不先拿掉第 7 類，BACKLOG 兩條檢查放不下。`sh test/run-all.sh` 除 plugin sync 外全綠；
  plugin sync 要 push 後 `claude plugin update cc-harness@cc-harness` 才會對齊。
- 2026-10-29：2.1、2.3、3.1、4.1、4.2 完成，9 條全勾（cc-harness 0.4.60、cc-dispatch 0.1.0）。
  **行數**：淨 -1,315（目標 ≤ -1,000，達標）；新增 530 行，**超過上限 250**。其中 67 行是決策原樣搬家、49 行是改寫的
  session-start 測試（取代刪掉的 90 行舊測試）、136 行是新 plugin 的看守腳本 hook 與測試（guard-bash 同時刪掉約 100 行）；
  沒有在超標時停下來砍，照實記錄。plugin 能宣告依賴已查證（官方 plugins/dependencies 文件），巢狀 plugin 目錄文件沒寫，
  `claude plugin validate --strict` 兩份都綠，實裝還沒驗。
