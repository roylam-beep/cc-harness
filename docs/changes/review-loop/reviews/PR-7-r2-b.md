VERDICT: merge

PR #7（review-loop 1.5：AGENTS 樣板發包規則）第 2 輪，視角 B（對抗）。head `a38d9ca`，base `claude/review-loop-v04`。試合併無衝突，淨 diff 只動 `templates/AGENTS.md`、`docs/decisions.md`（皆在所有權內；`2fa360b..a38d9ca` 裡出現的 `templates/docs/changes/README.md` 是 merge base 帶進來的，不在 PR 淨 diff）。r1 BLOCKER 1（缺「通過」）已修。

## BLOCKERS

（無）

## FOLLOWUPS

1. `templates/AGENTS.md:12`「發包者的獨立驗收（…）通過後才合併」：「通過」的主詞是驗收，清楚；但「合併」沒有主詞，spec 原文是「由發包者合進整合分支」。前一句主詞是「被派的 cloud agent」，照字面可能被讀成 cloud agent 等驗收通過後自己合。建議改成「…通過後由發包者合併」，+4 字元，位元組 1,940→1,952 仍 ≤ 2,000。[需確認] 算不算 Scenario 沒寫明
2. `docs/decisions.md` 新條目只寫「只准合進整合分支，`main` 由使用者」，沒寫「驗收通過後、由發包者」；樣板有寫。兩邊不矛盾，但 decisions 比樣板寬。建議補「驗收通過後由發包者」，讓兩份一致（延續 r1-b FOLLOWUP 9）。
3. 驗收指令守不住修正：mutation 把「通過後才合併；沒通過就退回同一個 agent」改回「後直接合併」，同時刪掉「合進 `main`、」，`grep 整合分支`＋`check_docs`＋`test_skills` 仍全綠（退出碼 0）。建議之後補一支樣板斷言測試（延續 r1-a FOLLOWUP 1）。
4. 位元組 1,940，離工單上限 2,000 只剩 60；之後誰要在樣板加字，就要先刪別的字。
5. r1-b FOLLOWUP 1–8（「整合分支」要以 `gate.env` 的 `BASE` 為準、沒帶 because、push 例外的優先序、適用範圍句型可能外溢、micro-task 沒定義、跟收輪寫入衝突等）本輪都沒處理，仍然成立，不擋合併。

## 逐條 Scenario

- ✅ 合併與推送權限：`templates/AGENTS.md:12`。整合分支（例如 `claude/*`，不是 `main`）可直接 push ✅；cloud agent push `cursor/*` 並開 PR 到整合分支 ✅；「驗收通過後才合併；沒通過就退回同一個 agent」✅（主詞見 FOLLOWUP 1）；合進 `main`、force-push、刪 `main` 以外別人的分支要使用者當輪確認 ✅。合併權限沒有比 spec 寬：只有在「PR 目標是整合分支時」才能合，`main` 例外仍在，沒有任何一句暗示可以合進 `main`。
- ✅ 發包者寫入邊界：同一行逐字寫出 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`，也寫了「產品程式碼一行也走追問或 micro-task」。「退回同一個 agent」跟「走追問」不矛盾。
- 1.5 附帶約束：`## ` 7 節 ✅；「用 `/cc-dispatch` 派工的 repo 才適用」✅；字元 998、位元組 1,940，≤ 2,000 ✅；沒有 CR ✅；沒有 `/Users/` ✅；decisions 條目的日期、理由、翻案條件跟工單一致 ✅，跟樣板不矛盾 ✅。

## 實跑

| 指令 | 退出碼 |
|---|---|
| fetch ＋ `worktree add --detach` ＋ `merge --no-ff` | 0 |
| `grep -n '整合分支' templates/AGENTS.md` | 0 |
| `python3 tools/check_docs.py .`（常駐 3,945/6,500） | 0 |
| `python3 tools/spec_merge.py check .` | 0 |
| `python3 test/spec_merge.test.py`（27 項） | 0 |
| `python3 test/test_skills.py`（10 支 × 7 類） | 0 |
| `node test/guard-bash.test.mjs` | 0 |
| mutation：刪「通過／退回」與「合進 `main`」後跑 grep＋check_docs＋test_skills | 0（見 FOLLOWUP 3），已 `git checkout` 還原 |
| `wc -c`、CR 計數、`## ` 計數、`/Users/` grep | 見上 |

本 PR 只改文件，沒有腳本介面，不適用怪輸入與 SetupHK 真實資料測試。
