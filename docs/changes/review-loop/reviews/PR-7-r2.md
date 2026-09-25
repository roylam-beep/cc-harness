VERDICT: merge

PR #7（review-loop 1.5：AGENTS 樣板發包規則）第 2 輪，視角 A（契約）。head `cursor/review-loop-1-5-agents-4502`（`a38d9ca`），base `claude/review-loop-v04`。臨時 worktree 試合併無衝突。

## BLOCKERS

（無）

r1-b 唯一 BLOCKER（樣板要寫明「驗收通過後才合併；沒通過就退回同一個 agent」）已修：`templates/AGENTS.md:12` 現為「發包者的獨立驗收（讀 diff、本機跑測試與 build）通過後才合併；沒通過就退回同一個 agent」。

## FOLLOWUPS

1. 這條 task 的「驗：」只守 `整合分支` 一詞。mutation 顯示：拿掉「通過」、刪掉寫入邊界句、加第八節、塞 `/Users/` 路徑、撐到 2,540 字元，BASE-GATE 全綠。樣板的發包規則、七節、2,000 字元上限目前沒有任何自動閘。建議另開 task，在 `test/test_skills.py` 或 `tools/check_docs.py` 加樣板檢查（`## ` 標題數＝7、字元 ≤ 2,000、含「通過後」「`docs/changes/<slug>/**`」、無 `/Users/`）。task 所有權不含測試檔，不算本 PR 的缺陷。
2. [需確認] Scenario「合併與推送權限」寫「驗收通過後**由發包者**合進整合分支」；樣板寫「發包者的獨立驗收……通過後才合併」，合併者是誰靠語意推得出，但沒明寫。可改成「通過後由發包者合併」，多 3 字。
3. `wc -m` 在 C locale 回的是位元組數（1,940），tasks.md 的「目前 1,333 字元」其實也是位元組數。UTF-8 字元數是 998。兩種算法都在 2,000 以下，但 tasks 的量法寫錯單位，之後的上限要寫明用 `LC_ALL=en_US.UTF-8 wc -m`。

## 逐條 Scenario

- ✅ 合併與推送權限：`templates/AGENTS.md:12` 逐點都有——整合分支（例如 `claude/*`，不是 `main`）可直接 push；被派的 cloud agent 可 push 自己的 `cursor/*` 並開 PR 到整合分支；驗收通過後才合併，沒通過退回同一個 agent；合進 `main`、force-push、刪 `main` 以外別人的分支仍要使用者當輪確認。自動閘只有 `grep -n '整合分支'`（M1 mutation 會紅）；其餘要點靠本文人工核對（見 FOLLOWUP 1）。
- ✅ 發包者寫入邊界：同一行「發包者只寫 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`，產品程式碼一行也走追問或 micro-task」。沒有自動閘（M6 mutation 不紅）。
- tasks.md 1.5 附加要求：
  - ✅ 放在既有 `## 硬性規則` 底下，開頭標明「用 `/cc-dispatch` 派工的 repo 才適用」。
  - ✅ 七節仍成立：`grep -c '^## '`＝7（使命／硬性規則／回覆與範圍／收輪三步／BACKLOG queue 規則／hook 清單／定案決策）。
  - ✅ 字數：UTF-8 字元 998（base 661）；位元組 1,940（base 1,333）。兩種量法都 ≤ 2,000。
  - ✅ 樣板無 repo 名、客戶名、`/Users` 路徑、日期（grep `SetupHK|/Users/|geniushub|roylam|YYYY-MM-DD` 退出碼 1）。
  - ✅ `docs/decisions.md`：新節「派工與合併」放最上面，含日期 2026-09-25、內容（dispatch-v0「不做自動合併」放寬為只准合進整合分支、`main` 由使用者）、理由（SetupHK system-completion 21 個 PR 的實績、發包者自己動手修、跳過驗收）、翻案條件（合進整合分支後出現未被閘擋下的紅燈），跟 tasks.md 指定的一字不差。decisions.md 提到 SetupHK 是 tasks.md 指定的理由，不是客戶名。

## 所有權

`git diff --name-only origin/claude/review-loop-v04...origin/cursor/review-loop-1-5-agents-4502` → `docs/decisions.md`、`templates/AGENTS.md`，與所有權完全相同。純文件改動，沒有新腳本，所以腳本檔頭、跨平台、工具白名單這三條約束不適用。

## Mutation（worktree 內做，每次都 `git checkout` 還原）

| # | 弄壞方式 | 驗＋check_docs＋test_skills |
|---|---|---|
| M1 | `整合分支` 全換掉 | 紅（1） |
| M2 | 加第八節 `## 發包規則` | 綠（0）：沒有閘守 |
| M3 | 加 `/Users/foo/x` | 綠（0）：沒有閘守 |
| M4 | 撐到 2,540 字元 | 綠（0）：沒有閘守 |
| M5 | 「通過後才合併；沒通過就退回」改回「後直接合併」 | 綠（0）：沒有閘守 |
| M6 | 刪掉寫入邊界句 | 綠（0）：沒有閘守 |

只有 M1 會紅，已記在 FOLLOWUP 1。這條 task 的所有權不含測試檔，也沒有負向 Scenario，所以不列 BLOCKER。

## 實跑

- `git fetch`、`git worktree add --detach … origin/claude/review-loop-v04`、`git merge --no-ff origin/cursor/review-loop-1-5-agents-4502` → 0
- `grep -n '整合分支' templates/AGENTS.md` → 0
- `python3 tools/check_docs.py .` → 0（CHECK_DOCS OK，常駐載入 3,945/6,500）
- `python3 tools/spec_merge.py check .` → 0（只警告 spec.md 字數，這是既有狀態）
- `python3 test/spec_merge.test.py` → 0（27 項）
- `python3 test/test_skills.py` → 0（10 支 × 7 類）
- `node test/guard-bash.test.mjs` → 0
- `LC_ALL=en_US.UTF-8 wc -m templates/AGENTS.md` → 998；`wc -c` → 1940
- 指令都包了 `perl -e 'alarm 300; exec @ARGV'`；結束時已 `git worktree remove --force` 並 `git worktree prune`
