VERDICT: merge

PR #5（review-loop 1.1：dispatch_state 簿記腳本），第 3 輪，視角 B（對抗）。
被測物：臨時 worktree 在 `origin/claude/review-loop-v04`（179f1eb）上 `--no-ff` 合進 `origin/cursor/review-loop-1-1-dispatch-state-0570`（2e43e07），沒有衝突。
這輪修正（24f41bc→2e43e07）只動 `tools/dispatch_state.py`（+12/-1）與 `test/dispatch_state.test.py`（+131/-0），都在所有權內，沒有刪掉或放寬任何既有斷言。
第 2 輪兩個 BLOCKER 都已修好：我用自己寫的 fixture（沒看 PR 的測試）實跑，行為正確；PR 自己的測試也能抓到對應的 mutation。

## BLOCKERS

（無）

## FOLLOWUPS

- [需確認] `sync` 遇到重複 N.M 時，一個合併 PR 會把兩塊都打勾，`SYNC 1.1 merged #7` 印兩次（`tools/dispatch_state.py` `plan_sync` 的 task 迴圈、`apply_marks`）。重現：`- [x] 1.1 a`（所有權 `a.py`）＋`- [ ] 1.1 dup`（所有權 `b.py`），假 gh 回 `demo 1.1: a` merged #7 → 兩行都變 `[x]`，`b.py` 那塊其實沒做過。`next` 已經擋住重複編號不派，所以只有「先派了 1.1，之後才有人複製出第二塊」這種情況會碰到。建議 `sync` 對重複編號跳過，或印一行警告。
- [需確認] `next` 的依賴判定碰到重複 N.M 時跟順序有關（`cmd_next` 的 `by_id = {task.id: task ...}`，後面的蓋掉前面的）。`- [ ] 1.1`、`- [x] 1.1`、`1.3 依賴：1.1` → `READY 1.3`；兩塊 1.1 對調 → `WAIT 1.3 依賴 1.1 未合併`。建議依賴判定改成「同編號的每一塊都勾了才算合併」。
- 全勾的重複 N.M 也會印 `WAIT 1.1 編號重複`（沒重複的已勾 task 什麼都不印）。如果 `/cc-review` 把「還有 WAIT」當成「還沒做完」，這份 change 就永遠收不了尾。建議在 `/cc-review` 的文件寫明 `編號重複` 要人工修，或已勾的重複編號改印 `SKIP`。
- `spec_merge.py check` 不擋重複 N.M：兩塊都有所有權、跨波重複、已勾與未勾重複，check 退出碼都是 0，`next` 卻印 `WAIT … 編號重複`。所有權判定兩邊一致（缺所有權的那塊 check 會紅、next 也不會 READY），只是 check 放行的東西 next 不派。這要改 `tools/spec_merge.py`，那是 1.3 的所有權，要另開 task。
- 第 2 輪列過的 FOLLOWUP（CRLF 經 sync 變 LF、BASE fetch 失敗沒有提示、`- [ ] 1.1` 沒標題的行兩邊判定不同、`pull/<n>/head` 退路沒測試等）這輪都沒改，也不在這輪的驗收範圍，照 `followups.md` 處理。

## 逐條 Scenario

這輪只驗兩件修正與有沒有新回歸；其餘 13 條 Scenario 沿用第 2 輪結論，並用 PR 測試全綠（21 項）與 SetupHK 回歸確認沒退步。

| Scenario | 判定 | 證據 |
|---|---|---|
| sync 不蓋重派中的列 | ✅ | 自寫 harness（`r3b harness/run_sync.py`，路徑含空白，備註欄含全形「｜」，slug `demo`，BASE `claude/x`，假 gh 不依 base 過濾），25 情境全過。**應該不動的 12 種**（`sync --check` 退出碼 0 且印 `SYNC 一致`、真的跑 `sync` 後 tasks.md／runs.md byte 不變、再跑 `--check` 還是 0）：b-closed（running、PR 空、#8 closed）、b-reverted（running、PR 空、merged #7＋Revert #8；box `[x]` 與 `[ ]` 各一次，`[x]` 沒被改回來）、b-queued、b-finished、b-queued-reverted、b-finished-reverted、a-closed（failed、PR 空、#9 open）、a-reverted、c-closed（failed #9、#8 closed）、c-reverted（merged #5、#7 被 revert）、c-closed-stalled（stalled #3）。**應該要寫的 13 種**（`--check` 退出碼 1、第一行符合預期、寫入後 `--check` 變 0）：failed #8＋closed #8 → `SYNC 1.2 closed #8`；failed 空 PR、stalled 空 PR、沒有列 → `closed #8`；merged #7＋revert → `reverted #7` 且 `[x]`→`[ ]`；failed 空 PR＋revert → `reverted #7`；open PR base 是 `main`、open PR 是 `1.20`、open PR slug 是 `demoX` 都不算 (a) → `closed #8`；running／running #9 加 open #10／finished #3 碰到新合併 #9 → `merged #9` 並打勾；revert 之後重派中又合併 #9 → `merged #9`。**Mutation**：拿掉 (a)、拿掉 (b)、拿掉 (c)、`REDISPATCH` 只剩 running、少 queued、少 finished、reverted 的事件 PR 改成 revert PR、reverted 不受保護，共 8 種，PR 測試每一種都紅（退出碼 1），我的 harness 也都紅 |
| next 缺所有權（重複 N.M） | ✅ | 自寫 `r3b harness/dup.py`，12 種：兩塊都有所有權、一塊缺（兩種順序）、跨波、已勾＋未勾（兩種順序）、已勾＋缺所有權、三塊、重複＋所有權重疊、重複＋依賴、兩塊都已勾、CRLF＋一塊缺。`next` 一律只印一行 `WAIT 1.1 編號重複`，1.1 不會 `READY`，摘要 `NEXT READY` 跟 READY 行數對得上。缺所有權的情境 `spec_merge check` 退出碼 1，`next` 也不派，兩邊一致。重複＋重疊時，1.2（跟 1.1 同樣擁有 `a.py`）印 `READY 1.2`，因為 1.1 不會派，這樣是對的。Mutation：拿掉 dupes 判斷 → PR 測試紅；拿掉「每個 N.M 只印一次」→ PR 測試紅 |
| 其餘 13 條 | ✅（沿用） | `python3 test/dispatch_state.test.py` 21 項全過 |

### SetupHK 回歸（`docs/changes/system-completion` 的 tasks.md／runs.md 複製到臨時目錄）

- `next`：26 行（SKIP×26）加上 `NEXT READY 0｜在飛 6｜上限 3`，跟第 2 輪的 d4456c2 版本 byte 相同；轉成 CRLF 的版本輸出也相同。
- 全部改成未勾：`next` 的輸出跟 d4456c2 byte 相同（14 READY；1.9／1.13／1.16 印 `WAIT … 與 1.6 重疊`；3.1／5.1 印 `WAIT 缺所有權`）；`spec_merge check` 只標 3.1、5.1，兩邊一致。原檔裡沒有重複的 N.M。
- `sync --check --base main`（假 gh，依 runs.md 產生 24 個 merged PR）：`SYNC 一致`，退出碼 0，兩個檔 byte 不變；d4456c2 版本結果一樣。另外加一個 `system-completion 6.1:` closed #900（6.1 的列是 running）：還是 `SYNC 一致`、退出碼 0，6.1 的列沒被動。
- 空的 tasks.md：`NEXT READY 0｜在飛 0｜上限 3`，退出碼 0。change-dir 不存在：印「用法錯」，退出碼 2。

## 實跑

| 指令 | 退出碼 |
|---|---|
| `git fetch` 兩條分支、`worktree add --detach`、`merge --no-ff` | 0 |
| `python3 test/dispatch_state.test.py`（21 項） | 0 |
| `python3 tools/check_docs.py .` | 0 |
| `python3 tools/spec_merge.py check .` | 0 |
| `python3 test/spec_merge.test.py` | 0 |
| `python3 test/test_skills.py` | 0 |
| `node test/guard-bash.test.mjs` | 0 |
| 自寫 sync harness（25 情境，假 gh） | 0（25/25） |
| sync 保護條件 mutation 8 種 × PR 測試 | 每種都是 1（有抓到） |
| 重複 N.M harness 12 種（`next` 對 `spec_merge check`） | 見上 |
| 重複 N.M mutation 2 種 × PR 測試 | 每種都是 1 |
| 重複 N.M 的 sync／依賴（FOLLOWUP 1、2） | 0 |
| SetupHK 複本：`next`（原檔、全未勾、CRLF）、`spec_merge check`、`sync --check`（兩組假 gh），並跟 d4456c2 版本比對 | 見上 |
| mutation 後還原：`cmp` 跟原檔相同，`git status` 乾淨 | 0 |
| `worktree remove --force`、`worktree prune` | 0 |

所有可能跑久的指令都包了 `perl -e 'alarm N; exec @ARGV'`。沒有起服務，沒有 push，也沒有在 GitHub 上留言。主工作目錄只多了這份報告；SetupHK 只讀取，資料都先複製到 scratchpad。
