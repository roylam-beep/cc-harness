## 1. 原語
- [x] 1.1 `commands/cc-cursor.md`：確認→開→背景看守→結束→叫醒回報，含追問模式 ｜驗：`python3 test/test_skills.py` 綠，本文含 `cursor_watch_command` 與 `run_in_background: true`
- [x] 1.2 cursor-api `src/index.js` 的 `cursor_create_agent` 加 `startingRef`／`agentId`／`skipReviewerRequest` ｜驗：`npm run check` 過、`npm run smoke` 列出 14 支工具

## 2. 派工器
- [x] 2.1 `commands/cc-dispatch.md`：算波次、契約 prompt、一波問一次、每條呼叫 `/cc-cursor`、寫 `runs.md`、`sync` 打勾 ｜驗：`python3 test/test_skills.py` 綠，本文對 `dispatch-v0` 自己算出的目前波次是 `## 1.`
- [x] 2.2 `templates/docs/changes/README.md` 加「PR body 要有 `## 驗`」與 `runs.md` 一句 ｜驗：`python3 tools/spec_merge.py check .` 綠

## 3. 實跑
- [ ] 3.1 用 `/cc-cursor` 真派一個最小任務到 cc-harness，確認 PR 標題、`## 驗`、叫醒回報三件都對 ｜驗：`.runs/` 多一個檔且 `--- git ---` 有 `prUrl`
