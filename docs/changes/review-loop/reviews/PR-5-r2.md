VERDICT: fix-needed

驗收員：第 2 輪，視角 A（契約）。試合併：`origin/claude/review-loop-v04`（c82f881）＋ `origin/cursor/review-loop-1-1-dispatch-state-0570`（d4456c2），在臨時 worktree 裡合併，沒有衝突。

## BLOCKERS

1. **「sync 不蓋重派中的列」的三個觸發條件 (a)(b)(c)，任拿掉一個，測試都照樣全綠。第 1 輪 BLOCKER 2 的重現情境沒有回歸測試**（`test/dispatch_state.test.py:981-1049` test_18；實作在 `tools/dispatch_state.py:713-717`）
   - 重現：test_18 的 fixture 是 `running | #5`、#3 已關閉、#5 還開著，三個條件同時成立。我在 worktree 裡一次拿掉一個條件跑整套測試：拿掉 `tid in open_of`（a）19/19 綠；拿掉 `row["狀態"] in REDISPATCH`（b）19/19 綠；拿掉「PR 欄有值卻不是事件 PR」（c）19/19 綠。三個一起拿掉才紅（只紅 test_18）。拿掉 (b) 以後，第 1 輪的重現情境又壞了：runs.md 是 `| 1.2 | bc-new | run-new | running |  | 重派 |`，gh 只回 #8 `demo 1.2: a` closed、沒有 open PR。這時 sync 印 `SYNC 1.2 closed #8`，把列蓋掉，而套件照樣全綠。`merge_pr.sh` 每次合併都會跑 sync，「剛重派、PR 還沒開」正好是最常見的時間點。
   - 現行實作在這些情境下行為正確。我另外寫了臨時測試實跑：(b) closed 與 reverted 各一例、(a)、(c) closed 與 reverted 各一例，全部通過；加上 mutation 後都會紅。所以缺的只有測試，實作不用改。
   - 要改成：在 test_18 或新的 test_20 補下面幾個獨立案例。每個案例只讓一個條件成立，並斷言 `SYNC 一致`、runs.md byte 不變：
     - (b-closed)：列 `running | `（PR 空），#8 closed，沒有 open PR。另外斷言 `next` 印 `SKIP 1.2 running`。
     - (b-reverted)：列 `running | `（PR 空），#7 已合併、#8 `Revert "demo 1.2: a"` 較晚合併，沒有 open PR。
     - (a)：列 `failed | `（PR 空），#8 closed，#9 `demo 1.2: a` 還開著。
     - (c-closed)：列 `failed | #9`，#8 closed，沒有 open PR。
     - (c-reverted)：列 `merged | #5`，#7 已合併、#8 revert 較晚合併。
     - 另補一個正向案例：列 `failed | #8`、#8 closed，斷言 `SYNC 1.2 closed #8`。用來證明 (c) 在 PR 相同時不會誤擋。
   - 驗法：每拿掉 `:714`、`:715`、`:716` 其中一行，至少要有一個測試紅。

## FOLLOWUPS

- stale 的 `pull/<n>/head` 退路（`tools/dispatch_state.py:792-799`）沒有測試。拿掉那行 fetch，19 項全綠。我寫的臨時測試是 head 只推到 bare origin 的 `refs/pull/5/head`、`headRefName` 不存在於 origin：現行實作印 `STALE 無`，拿掉退路後改印「無法對帳」、退出碼 2。fork PR 會走到這條路。spec 只寫「fetch 該 PR 的 head」，沒有指定 pull ref，所以不擋。
- `ensure_pr_head` 把 gh 回的 `headRefName` 直接當 `git fetch origin <ref>` 的參數。名稱以 `-` 開頭會被當成選項。GitHub 的分支名實際上不太會這樣，建議驗 ref 格式，或先跑 `git check-ref-format --branch`。
- `TASK_LINE`（`:76`）認得沒有標題的 `- [ ] 1.1`；spec_merge 的 `TASK_OK` 不認，會在 `tasks_stats` 報格式錯。30,000 組隨機 tasks.md 對拍的結果：除了這一種寫法，`next` 的「缺所有權」判定與 `spec_merge check` 完全一致（0 差異）。兩邊只差在這一種格式錯的行，建議對齊（`next` 也不把它當 task，或印 `WAIT N.M 格式錯`）。
- 第 1 輪的 FOLLOWUP 仍然成立，不重列細節：`render_runs` 會刪掉表格外的文字；空的 `- 依賴：` 被當成 `無`；錯誤訊息印在 stdout；`gh pr list --limit 200`；`next --base` 收了卻沒用到。
- 在實際整合分支上跑 `stale docs/changes/review-loop`，得到 `STALE #5`、`STALE #6`。用 `git merge-base --is-ancestor` 手動確認過，兩條的 head 確實都不含 `origin/claude/review-loop-v04` 的最新版，判定正確。合併前，#5 要先 merge BASE（發包者的試合併已涵蓋）。

## 逐條 Scenario

以整合分支最新的 spec.md 為準，共 15 條。「實跑」指的是 `python3 test/dispatch_state.test.py -v`，19/19 通過；另外有 mutation 與臨時案例，都只在我的 worktree 裡跑。

1. ✅ upsert 建檔與只改指定欄：test_01。斷言表頭與分隔列逐字相同；第二次只改狀態與 `#7`，agentId／runId／備註不變；`--pr #7` 冪等。
2. ✅ upsert 擋非法狀態：test_02。退出碼 2，runs.md byte 不變；不存在的 runs.md 也不會建出來。mutation（拿掉狀態檢查）→ test_02 紅。
3. ✅ sync 依整合分支打勾：test_03。錯 base 的 #8 不算；`1.20` 不會被 `1.2` 誤傷；`--base` 蓋過 gate.env；沒有 gate.env 時預設 main。mutation（`base_matches` 永遠 True）→ test_03、test_09 紅。
4. ✅ sync 抓事後 revert：test_04 測 revert PR，之後再合併會重新打勾；test_05 測 origin 上的 revert commit，只在本機、沒推上去的不算。「重派中不寫 reverted」由 test_18 第二段加上我的臨時 (b-reverted) 案例驗證，見 BLOCKER 1。
5. ✅ sync 記 closed：test_06。`failed` 空 PR 的列寫成 `closed #8`，tasks.md 行不變；1.3 有已合併 PR，較晚關閉的 #11 不會蓋掉它。
6. ❌ sync 不蓋重派中的列：實作正確（我的 6 個臨時獨立案例全部通過；`merged` 仍然蓋過 running，test_18 第三段有驗）。但測試只覆蓋三個條件同時成立的情況，三個條件各自拿掉都不會紅，見 BLOCKER 1。
7. ✅ sync --check 只比對：test_07。有差時退出碼 1、兩個檔 byte 不變；一致時印 `SYNC 一致`、退出碼 0。在實際的 review-loop 上跑 `sync --check` → `SYNC 一致`，退出碼 0。
8. ✅ 沒有 gh：test_08。PATH 裡沒有 gh、auth 失敗、pr list 失敗三種情況，sync 與 stale 都印「無法對帳」、退出碼 2、不寫檔；auth 失敗時不會呼叫 pr list；`DISPATCH_STATE_GH` 優先於 PATH。
9. ✅ stale 找落後的 PR：test_09。落後的印 `STALE #3`；錯 base 的 #99 不出現；都跟上印 `STALE 無`；head 只在 bare origin 的 `cursor/f`、本機沒 fetch 過 → `STALE 無`；取不到 head → 「無法對帳：取不到 PR #8 的 head」、退出碼 2。mutation：拿掉 headRefName 的 fetch → test_09 紅；拿掉 missing 的退出碼 2 → test_09 紅。檔頭的退出碼表已更新（`:51-54`）。
10. ✅ next 看依賴：test_10。`WAIT 1.3 依賴 1.1 未合併`、波次規則、`依賴：無`、多個依賴都有驗。
11. ✅ next 擋所有權重疊：test_11。`commands/**` 對 `commands/cc-review.md`、深層路徑、`*.md` 走 fnmatch、running／finished 佔用所有權、巢狀所有權、粗體所有權都有驗。mutation：拿掉 fnmatch → test_11 紅；running 不佔用所有權 → test_11 紅。
12. ✅ next 冪等：test_12。running／finished／merged 印 `SKIP`；failed／stalled 印 `SKIP … 需人工`；queued 仍可以 READY。
13. ✅ next 序列化 schema task：test_13。同時可派時只有一條 READY；前一條 running 時，另一條印 `WAIT 1.2 schema 序列化`。
14. ✅ next 套上限：test_14 與 test_17。`--max 2` 加上 1 條 running 時，只有 1 條 READY；`MAX_CONCURRENT=2`；預設 3；最後一行格式逐字比對；finished 不佔上限。
15. ✅ next 缺所有權：test_15、test_16、test_19。第 1 輪 BLOCKER 1 已修好：D（中間夾一行沒縮排的文字）、G（task 行加子行寫「同上」）、H（兩條子行，第一條是空值）都是 `READY 1.1`；test_19 把同一份 tasks.md 餵給 `spec_merge check` 與 `next`，兩邊一致。mutation：D、G、H 三種各自改回舊行為 → test_16、test_19 都紅。另外把 30,000 組隨機 tasks.md 餵給 `spec_merge.open_tasks_missing_ownership` 與 `parse_tasks` 對拍，0 差異（沒有標題的 task 行除外，見 FOLLOWUP）。review-loop 與 SetupHK system-completion 兩份實際的 tasks.md，兩邊判定也一致。

第 1 輪三件 BLOCKER：(1) 已修，有測試，mutation 會紅；(2) 實作已修，但回歸測試只驗到三個條件同時成立的情況，留作本輪的 BLOCKER 1；(3) 已修，有測試，mutation 會紅（`pull/<n>/head` 退路除外，見 FOLLOWUP）。

共同約束：
- 所有權：`git diff --name-only origin/claude/review-loop-v04...origin/cursor/review-loop-1-1-dispatch-state-0570` = `test/dispatch_state.test.py`、`tools/dispatch_state.py`，是所有權的子集 ✅
- 沒改任何 `commands/*.md`；兩個檔都沒有 `/Users/<帳號>` 或 `/home/<帳號>` ✅
- 只用標準庫（argparse、datetime、fnmatch、json、os、re、subprocess、sys、tempfile）；沒用 `sed -i`、`readlink -f`、`timeout` 指令 ✅
- 檔頭有用法、退出碼表、防什麼 ✅
- 測試用假 gh 加上本機 bare repo，不連網 ✅
- 輸出行首是 READY／WAIT／SKIP／STALE／SYNC／NEXT，加上 spec 規定的「無法對帳」✅

## 實跑

- `git fetch -q origin claude/review-loop-v04 cursor/review-loop-1-1-dispatch-state-0570` → 0
- `git worktree add --detach <wt> origin/claude/review-loop-v04` 後跑 `git merge --no-ff origin/cursor/review-loop-1-1-dispatch-state-0570` → 0，無衝突
- `perl -e 'alarm 300; exec @ARGV' python3 test/dispatch_state.test.py -v` → 0，19/19，`DISPATCH_STATE_TEST OK（19 項）`
- BASE-GATE（`check_docs && spec_merge check && spec_merge.test && test_skills && guard-bash`）→ 0；guard-bash 21/21
- mutation（每次都從備份還原，最後用 `cmp` 確認 byte 相同）：
  - 紅：D、G、H 退回舊行為（test_16、test_19）；拿掉 head fetch（test_09）；拿掉 missing 的退出碼 2（test_09）；base 不過濾（test_03、test_09）；拿掉 fnmatch（test_11）；running 不佔用所有權（test_11）；非法狀態照寫（test_02）；三個保護條件全拿掉（test_18）；保護條件誤擋 merged（test_04、test_08、test_18）
  - 綠（測試缺口）：只拿掉 (a)、只拿掉 (b)、只拿掉 (c)、拿掉 `pull/<n>/head` 退路。另有一個 mutation 是拿掉 `closed_ignore_merge` 的判斷：`:704` 那個條件原本就是冗餘的，拿掉也等價，所以綠燈不算缺口。
- 臨時獨立案例（放在 worktree 的 `test/zz_rev_iso.py`，跑完已刪）：7/7 通過；各條件的 mutation 下，對應案例都會紅
- 所有權對拍：30,000 組隨機樣本加上兩份實際的 tasks.md → 0 差異
- 實際 repo：`next docs/changes/review-loop` → 0；`sync docs/changes/review-loop --check`（真的 gh，唯讀）→ 0，`SYNC 一致`；`stale docs/changes/review-loop` → 0，`STALE #5`、`STALE #6`，用 `merge-base --is-ancestor` 確認為真
- SetupHK system-completion 的 tasks.md 與 runs.md 先複製到 scratchpad，跑 `next` → 0，已刪除
