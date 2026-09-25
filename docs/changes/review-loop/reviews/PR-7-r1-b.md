VERDICT: fix-needed

PR #7（review-loop 1.5：AGENTS 樣板發包規則）第 1 輪，視角 B（對抗）。試合併：`origin/claude/review-loop-v04` ＋ `origin/cursor/review-loop-1-5-agents-4502`，無衝突，只動 `templates/AGENTS.md`、`docs/decisions.md`（皆在所有權內）。

## BLOCKERS

1. `templates/AGENTS.md:12` 寫「發包者跑完獨立驗收（讀 diff、本機跑測試與 build）後直接合併」，沒有寫「驗收通過」。spec.md「合併與推送權限」Scenario 的 THEN 要求寫明「驗收通過後由發包者合進整合分支」。「跑完」只說跑過，沒說要綠：新 repo 的 agent 照字面讀，驗收紅了也可以合。這正好是 decisions.md 這條要防的「跳過驗收」。重現：`grep -n '通過' templates/AGENTS.md` 找不到。改法：把該句改成「PR 目標是整合分支時，發包者的獨立驗收（讀 diff、本機跑測試與 build）**通過**後才合併；沒通過就退回同一個 agent」，字數仍遠低於 2,000。

## FOLLOWUPS

1. 整合分支怎麼認有歧義：樣板只寫「例如 `claude/*`，不是 `main`」，沒有接上 spec.md 的 BASE 定義（`--base` → `<change-dir>/gate.env` 的 `BASE=` → `main`）。agent 可能把任何 `claude/*` 當成可以直接 push 的分支，跟 `merge_pr.sh` 以 BASE 為準的判定不一致。建議改成「整合分支＝該 change `gate.env` 的 `BASE`（例如 `claude/*`，不能是 `main`／預設分支）」。
2. 沒寫 because：同一節的佔位行寫著「不可違反的幾條，帶 because。想不出 because 的規則不要寫」，新段落卻沒帶。建議補半句，例如「because 發包者自己動手修、跳過驗收會讓錯誤累積（見 `docs/decisions.md` 2026-09-25）」。
3. 優先序沒講：使用者的 `~/.claude/CLAUDE.md` 常寫「push 要當輪授權」，本 repo README「版控」也寫「push 一律當輪問使用者」。樣板沒說這段是那條規則的例外、例外範圍多大，新 repo 的 agent 可能卡住，也可能擴大解釋。建議加一句「本段是『push 要當輪授權』的例外，只限上面列的分支」。[需確認] 帳號層「安全紅線」的「對外發布」算不算包含 push 到整合分支，要由使用者決定。
4. 「適用範圍」可能外溢：「用 `/cc-dispatch` 派工的 repo 才適用」放在 `## 硬性規則` 第一句，沒有自己的小標或粗體開頭，可能被讀成整節硬性規則都只適用於派工 repo。建議改成粗體開頭「**發包（僅用 `/cc-dispatch` 的 repo）**：…」，或移到佔位行之後。
5. 「micro-task」、「追問」在樣板與 `docs/changes/README.md` 都沒有定義，第一次用的 agent 不知道指什麼。建議加路標，指向 `/cc-cursor <agentId>`（追問），或寫明 micro-task 的定義。
6. 「發包者只寫…」跟 `## 收輪三步` 有潛在衝突：同一個 session 收輪時，`/cc-close` 會寫 `SPEC.md`、`docs/archive/**`、`rounds.md`，這些不在寫入清單裡。建議限定「派工期間」，或列出收輪例外。
7. 驗收內容只寫「讀 diff、本機跑測試與 build」，沒指向 `gate.env`／`tools/gate-pr.sh`／`/cc-review`。等 1.2、2.3 合進來，可以改成路標，不必寫死步驟。
8. 所有非派工 repo 被 `/cc-harness` 安裝時，也會常駐多吃 321 字元（661→982）。在預算內（check_docs 常駐 3,945/6,500），但可以考慮只在派工 repo 才放。[需確認]
9. `docs/decisions.md` 的「21 個 PR」與計畫檔 `docs/plans/2026-09-25-dispatch-review-loop.md:34` 一致，沒有誇大。SetupHK `runs.md` 目前記的已合併 PR 是 #8–#29，共 22 個，另有 #31 未合，數字是寫計畫當時的快照。可以考慮註明「截至計畫撰寫時」。另外這條沒寫「由發包者、驗收通過後」合併，跟 spec.md 第 4 行的語意有一點落差，要不要補由發包者決定。

## 逐條 Scenario

- ❌ 合併與推送權限：整合分支（不是 `main`）可直接 push ✅；cloud agent push 自己的分支並開 PR 到整合分支 ✅（`cursor/*`）；「驗收通過後由發包者合進整合分支」❌，只寫「跑完…後直接合併」（BLOCKER 1）；合進 `main`、force-push、刪 `main` 以外別人的分支要使用者當輪確認 ✅。證據：`templates/AGENTS.md:12`，`grep -n '通過' templates/AGENTS.md` 退出碼 1。
- ✅ 發包者寫入邊界：`templates/AGENTS.md:12` 逐字寫出 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`，以及「產品程式碼一行也走追問或 micro-task」。
- tasks.md 1.5 附帶約束：仍是七節 ✅（`## ` 計數 7）；標明「用 `/cc-dispatch` 派工的 repo 才適用」✅；字數：字元 661→982、位元組 1,333→1,904，兩種算法都 ≤ 2,000 ✅；decisions.md 放在最上面新開的「派工與合併」節，日期 2026-09-25，理由與翻案條件跟 tasks.md 的文字一致 ✅；沒有 CRLF ✅。

## 實跑

| 指令 | 退出碼 |
|---|---|
| `git fetch` ＋ `worktree add --detach` ＋ `merge --no-ff` | 0 |
| `grep -n '整合分支' templates/AGENTS.md` | 0 |
| `python3 tools/check_docs.py .`（常駐 3,945/6,500） | 0 |
| `python3 tools/spec_merge.py check .` | 0 |
| `python3 test/spec_merge.test.py`（25 項） | 0 |
| `python3 test/test_skills.py`（10 支 × 7 類） | 0（本機有 `~/.claude`；PR body 說的 5 項紅是 cloud container 缺家目錄造成的，本機重現不出來） |
| `node test/guard-bash.test.mjs` | 0 |
| `grep -n '通過' templates/AGENTS.md` | 1（證明 BLOCKER 1） |
| Python 量字元／位元組／CR／節數 | 0 |

本 PR 只改文件，沒有腳本介面（輸出行首、退出碼、參數），不適用怪輸入測試；SetupHK 的 `runs.md` 只拿來核對 PR 數字，只讀沒寫。
