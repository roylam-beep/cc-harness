VERDICT: merge

PR #5（review-loop 1.1，`cursor/review-loop-1-1-dispatch-state-0570` → `claude/review-loop-v04`）第 3 輪，視角 A（契約）。
驗收對象：在臨時 worktree 把 head `2e43e07` 試合併到 base `179f1eb`，merge commit 是 `c38cbd3`。

## BLOCKERS

（無）

第 2 輪退回的 2 件都已修好，也都驗過：
1. 「sync 不蓋重派中的列」的條件各自有測試守（test_20）。4 種指定 mutation 都會讓 test_20 紅，另外 6 種更細的 mutation 也都紅，見下表。
2. N.M 重複時，`next` 只印一行 `WAIT N.M 編號重複`，不會 READY（test_21）。拿掉判斷或拿掉去重，test_21 都會紅。test_21 在同一個 root 跑 `spec_merge check`，斷言退出碼 1、輸出含 `task 1.1 缺所有權`。

## FOLLOWUPS

1. [需確認] `sync` 碰到重複 N.M 時兩塊都會打勾，`SYNC` 行也印兩次。重現：tasks.md 有兩塊 `- [ ] 1.3`，都有所有權；假 gh 回 merged #7 `demo 1.3: a`。`sync` 印兩行 `SYNC 1.3 merged #7`，兩塊都改成 `- [x]`，runs.md 只有一列（這點正確）。`next` 那邊已經擋住，這份 tasks.md 本身也不合法，所以不擋合併。建議 `plan_sync` 也跳過重複的 N.M，或者 changes 去重（`tools/dispatch_state.py:697` 的迴圈）。
2. [需確認] `spec_merge.py check` 不擋重複的 N.M：兩塊都有所有權時照樣 `SPEC_MERGE CHECK OK`，實測退出碼 0。這種 tasks.md 在 pre-commit 會過，之後 `next` 永遠印 `WAIT 1.3 編號重複`，至少安全。要擋得改 `tools/spec_merge.py`，那是 1.3 的所有權，不在本 PR。
3. `plan_sync` 的 `elif tid in closed_of and not any(e.kind == "merge" for e in evs)`（`tools/dispatch_state.py:~694`）後半是死碼：只要有 merge 事件，`evs` 就不是空的，會先走 `if evs:` 那支。拿掉它，測試照樣全綠（equivalent mutant，行為不受影響）。只影響可讀性，可以刪。
4. `base_matches` 在 `baseRefName` 缺值時回 True（`:469-473`）。`gh pr list --base` 已經先過濾過，所以不影響結果，只是防線少一層。

## 逐條 Scenario

以整合分支最新的 spec.md「dispatch_state 簿記」為準，共 15 條。「mutation」欄是我在 worktree 暫時改壞實作後，變紅的測試。

| # | Scenario | 結果 | 測試 | 證據 |
|---|---|---|---|---|
| 1 | upsert 建檔與只改指定欄 | ✅ | test_01 | 綠。斷言表頭、`#7`，agentId／runId／備註不變，也不多一列 |
| 2 | upsert 擋非法狀態 | ✅ | test_02 | N1 拿掉狀態檢查 → test_02 紅 |
| 3 | sync 依整合分支打勾 | ✅ | test_03 | N4 讓 base 不比對 → test_03、test_09 紅 |
| 4 | sync 抓事後 revert | ✅ | test_04、test_05 | F7 把 reverted 的事件 PR 換成 revert PR 自己 → test_04、test_05 紅 |
| 5 | sync 記 closed | ✅ | test_06、test_20 反例 | 綠。反例斷言 `SYNC 1.2 closed #8`、runs 列 `closed #8`、tasks.md 不變 |
| 6 | sync 不蓋重派中的列 | ✅ | test_18、test_20 | 下表 M1–M4、F1–F6 全紅；R6 讓 merged 也受保護 → test_04、test_08、test_18 紅（證明「merged 不受此限」有測到） |
| 7 | sync --check 只比對 | ✅ | test_07、test_20 | N2 讓 --check 照樣寫檔 → test_07 紅 |
| 8 | 沒有 gh | ✅ | test_08 | N3 讓 auth 失敗也照跑 → test_08 紅 |
| 9 | stale 找落後的 PR | ✅ | test_09 | R4 不 fetch head、R5 取不到 head 也當落後 → 都是 test_09 紅（第 1 輪修的沒退步） |
| 10 | next 看依賴 | ✅ | test_10 | N10 不看依賴 → test_10、test_11、test_16 紅 |
| 11 | next 擋所有權重疊 | ✅ | test_11 | N5 不擋重疊 → test_11 紅 |
| 12 | next 冪等 | ✅ | test_12 | N9 把 running 移出 SKIP → test_12 等 6 項紅 |
| 13 | next 序列化 schema task | ✅ | test_13 | N6 不序列化 → test_13 紅 |
| 14 | next 套上限 | ✅ | test_14、test_17 | N7 不套上限 → test_14 紅 |
| 15 | next 缺所有權 | ✅ | test_15、test_16、test_19、test_21 | N8 缺所有權也派 → test_15、test_16、test_19 紅；M5 拿掉重複判斷 → test_21 紅 |

### 第 2 輪指定的 mutation（`tools/dispatch_state.py:713-718` 的判定，以及 `REDISPATCH`）

| mutation | 紅了哪個測試 |
|---|---|
| M1 只刪 open-PR 條件 (a)（`tid in open_of` 換成 `False`） | test_20 |
| M2 只刪 REDISPATCH 條件 (b) | test_20 |
| M3 只刪「列 PR 不是事件 PR」條件 (c) | test_20 |
| M4 `REDISPATCH` 改成只剩 `("running",)` | test_20 |
| F1 (c) 只對 closed 生效（reverted 不擋） | test_20（c-reverted 案例） |
| F2 (c) 只對 reverted 生效（closed 不擋） | test_20（c-closed 案例） |
| F3 (b) 只對 closed 生效 | test_20（b-reverted 案例） |
| F4 (b) 只對 reverted 生效 | test_20（b-closed 案例） |
| F5 `REDISPATCH` 缺 finished | test_20 |
| F6 `REDISPATCH` 缺 queued | test_20 |
| M7 (c) 比對的對象換成不存在的 PR（事件 PR 相同也擋） | test_04、test_05、test_20（正向反例 `failed #8` → `closed #8` 有守住） |
| M5 刪掉重複編號判斷 | test_21 |
| M6 刪掉輸出去重 | test_21 |

F1–F4 每次只讓其中一個子案例失效，所以證明 test_20 的每個子案例都各自守得住，不是只靠第一個 assert。

### 前兩輪修過的東西（回歸）

| mutation | 紅了哪個測試 |
|---|---|
| R1 (D) 碰到沒縮排的行就切斷區塊 | test_16、test_19 |
| R2 (G) 不看 task 行上的 `｜所有權：` | test_16、test_19 |
| R3 (H) 只取第一條所有權子行 | test_16、test_19 |
| R4 stale 不 fetch head | test_09 |
| R5 stale 取不到 head 也當落後 | test_09 |

`dispatch_state.py` 的 TASK_ANY／HEADING／BACKTICK_PATH／OWN_SUB／OWN_INLINE 五則 regex，跟 `tools/spec_merge.py:31-38` 逐字相同。

每輪 mutation 做完都還原，`cmp` 確認跟原檔一致，`git status` 乾淨。

### 共同約束

- 所有權：`git diff --name-only origin/claude/review-loop-v04...origin/cursor/review-loop-1-1-dispatch-state-0570` 只有 `test/dispatch_state.test.py`、`tools/dispatch_state.py`，是 task 所有權的子集。✅
- 兩個檔都沒有 `/Users/`、`/home/` 絕對路徑。✅
- 沒動 commands/，所以不涉及日期規則。✅
- 只 import Python 標準庫。子程序只呼叫 `git`、`gh`（可用 `DISPATCH_STATE_GH` 覆寫）。沒有 sed -i／readlink -f／timeout／bash。✅
- 檔頭有用法、退出碼表、防什麼，本輪也補上了「編號重複」一句。✅
- 測試用假 gh 加本機 bare origin，不連網。✅

## 實跑

| 指令 | 退出碼 |
|---|---|
| `git fetch` 兩個分支、`worktree add --detach` base、`merge --no-ff` head | 0（沒有衝突） |
| `git diff --name-only base...head` | 0（2 個檔） |
| `python3 test/dispatch_state.test.py` | 0（21 項 OK） |
| `python3 tools/check_docs.py .` | 0 |
| `python3 tools/spec_merge.py check .` | 0（spec 字數警告，既有的） |
| `python3 test/spec_merge.test.py` | 0（27 項） |
| `python3 test/test_skills.py` | 0（10 支） |
| `node test/guard-bash.test.mjs` | 0 |
| mutation M1–M7、F1–F7、R1–R6、N1–N11（臨時 harness，每次跑完整套測試） | 除了 N11（死碼，equivalent mutant）以外全部 rc=1 |
| 重複 N.M 探針：`spec_merge check`、`next`、`sync`（臨時 repo、假 gh） | check 0／next 0（`WAIT 1.3 編號重複`）／sync 0（印兩行 SYNC，見 FOLLOWUP 1） |

以上都包了 `perl -e 'alarm N; exec @ARGV'`。
