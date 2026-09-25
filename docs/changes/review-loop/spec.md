## Purpose
SetupHK system-completion 的前 10 個 PR 靠「派工 → 每個 PR 獨立驗收 → 退回修 → 合併」跑得很順；後期歪掉，是因為這個迴圈只靠發包者當場記憶在跑：自己動手修、跳過驗收、手寫簿記出錯。
本變更把迴圈固化成工具：新增 `/cc-review` 管一個 PR 從閘到合併；`/cc-dispatch` 支援整合分支、檔案所有權、冪等派工；簿記改由三支有測試的腳本做。
dispatch-v0 的兩條「不做」（不做自動合併 PR；不做失敗自動重派）在此放寬：合併只准合進整合分支，`main` 一律由使用者當輪確認；fix 迴圈是追問同一個 agent，不是重派新 agent。

## 不做
- 不合併到 `main`，也不提供任何合進 `main` 的自動路徑。
- 第二輪項目：`hooks/guard-write.mjs`（`CC_ROLE=dispatcher` 寫入守衛）、`templates/docs/changes/KICKOFF.md`、cursor-api 的 `modelParams`、`wait-for-run.js` 的永久錯誤重連與 exit code 分流。
- cloud-orchestrator R3：`tools/cursor.mjs` 移植、`/cc-env`；`/cc-cursor` 本變更仍走 cursor-cloud MCP。
- cloud-orchestrator R4：CI 結果判 `unverified`、`EXECUTOR_MODEL`；`dispatch_state.py sync` 只看合併與 revert 事件。
- `gh` 不可用時改走 GitHub MCP 的退路；三支腳本沒有 `gh` 就退出碼 2。
- 不改 `/cc-harness` 的安裝清單：`gate-pr.sh`、`merge_pr.sh`、`dispatch_state.py` 不複製進被安裝的 repo，從 `${CLAUDE_PLUGIN_ROOT}/tools/` 執行（repo 有 `scripts/` 同名檔時優先用 repo 的）。
- 不改 `SPEC.md`（歸檔時由 `spec_merge.py --apply` 併入）；不動 `~/.claude/**`。

## ADDED Requirements

### Requirement: dispatch_state 簿記
`tools/dispatch_state.py <子指令> <change-dir> [選項]` SHALL 是 `runs.md` 與 `tasks.md` 勾選的唯一寫入工具（只用 Python 標準庫），提供 `upsert-run`、`sync`、`stale`、`next` 四個子指令；需要 `gh` 的子指令在 `gh` 不在或未登入時退出碼 2 且不寫檔。BASE 取值順序：`--base` → `<change-dir>/gate.env` 的 `BASE=` → `main`。

#### Scenario: upsert 建檔與只改指定欄
- **WHEN** `runs.md` 不存在時跑 `upsert-run <dir> 1.2 --agent bc-… --run run-… --status running`，再跑 `upsert-run <dir> 1.2 --status finished --pr 7`
- **THEN** 第一次建檔（表頭 `| task | agentId | runId | 狀態 | PR | 備註 |`）並加 1.2 一列；第二次只改該列的狀態與 PR（寫成 `#7`），agentId、runId、備註不變，不新增列

#### Scenario: upsert 擋非法狀態
- **WHEN** `--status` 不是 `running`／`queued`／`finished`／`failed`／`stalled`／`merged`／`closed`／`reverted` 之一
- **THEN** 退出碼 2，`runs.md` byte 不變

#### Scenario: sync 依整合分支打勾
- **WHEN** BASE 是 `claude/x`，`gh pr list --state merged --base claude/x` 有標題 `<slug> 1.2: …` 的 PR #7
- **THEN** `tasks.md` 的 `- [ ] 1.2 ` 改成 `- [x] 1.2 `，`runs.md` 的 1.2 列狀態 `merged`、PR `#7`（沒有該列就新增）；base 不是 BASE 的同名 PR 不算

#### Scenario: sync 抓事後 revert
- **WHEN** 1.2 合併之後，又有較晚合併、標題符合 `Revert "<slug> 1.2:` 的 PR，或 `origin/<BASE>` 上有較晚的同樣 subject 的 commit
- **THEN** 每條 N.M 取時間最晚的事件：改回 `- [ ] 1.2 `，`runs.md` 記 `reverted`；revert 之後又有新的 1.2 合併就照常打勾；但若該列正在重派（見「sync 不蓋重派中的列」）就不寫 `reverted`

#### Scenario: sync 記 closed
- **WHEN** base 是 BASE 的 `<slug> N.M:` PR 已關閉且 `mergedAt` 為空，而且該 N.M 沒有已合併的 PR
- **THEN** `runs.md` 該列記 `closed`，`tasks.md` 不動

#### Scenario: sync 不蓋重派中的列
- **WHEN** 算出的狀態是 `closed` 或 `reverted`，而該 N.M 在 BASE 上還有 open PR，或該列狀態是 `queued`／`running`／`finished`，或該列 PR 欄有值、卻不是這次事件涉及的 PR（closed 看被關的那個 PR；reverted 看被 revert 的原始合併 PR）
- **THEN** 不寫該列、不列入待改動；`merged` 不受此限，照常蓋過任何狀態

#### Scenario: sync --check 只比對
- **WHEN** 跑 `sync <dir> --check`
- **THEN** 不寫任何檔；有待改動時列出並退出碼 1，完全一致時退出碼 0

#### Scenario: 沒有 gh
- **WHEN** `gh` 不在 PATH，或 `gh auth status` 失敗，而子指令是 `sync` 或 `stale`
- **THEN** 印「無法對帳」、退出碼 2、不寫檔

#### Scenario: stale 找落後的 PR
- **WHEN** 有 open PR 的 base 是 BASE，但它的 head 不包含 `origin/<BASE>` 的最新 commit（比對前先 fetch BASE 與該 PR 的 head；本機原本沒有 head 不算落後）
- **THEN** 每條印 `STALE #<n> <標題>`；都不落後就印 `STALE 無`；退出碼 0；fetch 後仍取不到某個 PR 的 head，就印「無法對帳：取不到 PR #<n> 的 head」、退出碼 2

#### Scenario: next 看依賴
- **WHEN** 1.3 的區塊寫 `依賴：1.1`，而 1.1 仍未勾
- **THEN** 印 `WAIT 1.3 依賴 1.1 未合併`；沒寫「依賴」的 task 沿用波次規則（前面各組全勾才可派）；寫 `依賴：無` 的不等任何 task

#### Scenario: next 擋所有權重疊
- **WHEN** 可派的 1.1 所有權是 `commands/**`、1.2 所有權是 `commands/cc-review.md`
- **THEN** 只有編號小的 1.1 印 `READY`，1.2 印 `WAIT 1.2 所有權與 1.1 重疊：commands/cc-review.md`；`runs.md` 狀態是 `running` 或 `finished` 的 task 也算佔用它的所有權

#### Scenario: next 冪等
- **WHEN** `runs.md` 的 1.1 狀態是 `running`、`finished` 或 `merged`
- **THEN** 印 `SKIP 1.1 <狀態>`，不出現在 `READY`；狀態是 `failed` 或 `stalled` 印 `SKIP 1.1 <狀態> 需人工`

#### Scenario: next 序列化 schema task
- **WHEN** `gate.env` 有 `SCHEMA_GLOB`，兩條可派 task 的所有權都與它重疊
- **THEN** 同一時間最多一條 schema task 是 `READY` 或在飛，另一條印 `WAIT N.M schema 序列化`

#### Scenario: next 套上限
- **WHEN** 帶 `--max 2`（沒帶就取 repo 的 `docs/changes/README.md` 裡 `MAX_CONCURRENT=<n>`，再沒有用 3），且 `runs.md` 已有 1 條 `running`
- **THEN** 最多 1 條 `READY`，其餘可派的印 `WAIT N.M 超過上限`；最後一行 `NEXT READY <k>｜在飛 <m>｜上限 <n>`（在飛＝`running` 條數；`finished` 不佔上限，只佔所有權）

#### Scenario: next 缺所有權
- **WHEN** 未勾的 task 區塊沒有 `所有權：`
- **THEN** 印 `WAIT N.M 缺所有權`，永遠不會 `READY`

### Requirement: gate-pr 試合併跑閘
`tools/gate-pr.sh <change-dir> <PR#>` SHALL 在臨時 worktree 把 PR 的 head 合到 `origin/<BASE>` 最新版，依序跑 `<change-dir>/gate.env` 的每條 `GATE_<n>`，只以退出碼判紅綠，跑完移除 worktree；主工作目錄不受影響。

#### Scenario: 全綠
- **WHEN** 每條 `GATE_<n>` 退出碼都是 0
- **THEN** 每條印一行 `GATE_<n> exit=0 <指令>`，最後印 `GATE GREEN`，退出碼 0

#### Scenario: 有紅也跑完
- **WHEN** `GATE_1` 退出碼非 0
- **THEN** 仍跑完其餘各條，最後印 `GATE RED <紅的編號，逗號分隔>`，退出碼 1；每條完整輸出寫進印出的 `LOG <目錄>`

#### Scenario: 衝突
- **WHEN** PR head 合進 `origin/<BASE>` 發生衝突
- **THEN** 印 `GATE CONFLICT` 與衝突檔名，退出碼 3，不跑任何 GATE

#### Scenario: base 不符
- **WHEN** PR 的 `baseRefName` 不等於 BASE
- **THEN** 退出碼 4，不建 worktree

#### Scenario: 設定缺漏
- **WHEN** `gate.env` 不存在、缺 `BASE` 或 `GATE_1`，或 PR 模式下沒有 `gh`
- **THEN** 退出碼 2，印缺了什麼

#### Scenario: 單條逾時
- **WHEN** 某條 GATE 跑超過 `GATE_TIMEOUT` 秒（沒設為 900）
- **THEN** 該條被中止並記為紅，其餘照跑

#### Scenario: 共用依賴目錄
- **WHEN** `gate.env` 有 `SHARE_DIRS`（空白分隔的相對目錄，例 `node_modules api/node_modules`）
- **THEN** worktree 裡這些目錄以 symlink 指回主 repo；PR 改到符合 `SCHEMA_GLOB` 的檔時改成複製（`cp -cR`，不支援就 `cp -R`）；主 repo 的 `<dir>/node_modules` 若是指回 `<dir>` 自己的 symlink，先刪掉那個 link 並印一行

#### Scenario: 只驗 HEAD
- **WHEN** 跑 `gate-pr.sh <change-dir> --head`
- **THEN** 不需要 PR 與 `gh`，直接在 `origin/<BASE>` 最新版跑全部 GATE，輸出與退出碼規則同上

#### Scenario: 主工作目錄不變
- **WHEN** 跑完，不論退出碼
- **THEN** 主工作目錄 `git status --porcelain` 與跑之前相同，`git worktree list` 不留臨時 worktree（環境變數 `KEEP_WT=1` 時保留並印路徑）

### Requirement: merge_pr 只合進整合分支
`tools/merge_pr.sh <change-dir> <PR#>` SHALL 只把 base 等於 BASE 的 PR 合進整合分支，接著 `pull --ff-only`、`dispatch_state.py sync`、只 commit 該 change 的 `tasks.md` 與 `runs.md`、push；全程不用 `git stash`，任一步失敗就停。

#### Scenario: 工作區不乾淨
- **WHEN** 主工作目錄 `git status --porcelain` 非空
- **THEN** 印「工作區不乾淨」、退出碼 2，不呼叫 `gh`、不動任何檔

#### Scenario: 拒絕合進 main
- **WHEN** BASE 是 `main`、`master` 或 repo 的預設分支，或 PR 的 base 不等於 BASE
- **THEN** 退出碼 4，印「合進 <分支> 要使用者當輪確認」或 base 不符的兩個分支名

#### Scenario: 目前分支不對
- **WHEN** 主工作目錄目前的分支不是 BASE
- **THEN** 退出碼 2，不切換分支

#### Scenario: draft 先 ready
- **WHEN** PR 是 draft
- **THEN** 先 `gh pr ready <n>`，再 `gh pr merge <n> --merge --subject "Merge PR #<n>: <PR 標題>"`

#### Scenario: 合併後簿記並推送
- **WHEN** merge 成功
- **THEN** 依序 `git pull --ff-only origin <BASE>`、`dispatch_state.py sync <change-dir> --base <BASE>`、只 stage 該 change 的 `tasks.md` 與 `runs.md`、commit、`git push origin <BASE>`，最後印 `MERGED #<n> → <BASE> <短 sha>`

#### Scenario: 任一步失敗就停
- **WHEN** pull、sync、commit（含 pre-commit 紅）任一步失敗
- **THEN** 退出碼 1，後面的步驟（特別是 push）都不執行

#### Scenario: 已合併可重跑
- **WHEN** PR 已是 MERGED
- **THEN** 跳過 merge，照常 pull、sync；沒有東西可 commit 就不 commit、不 push，退出碼 0

#### Scenario: 不碰 stash
- **WHEN** 檢查 `tools/merge_pr.sh` 原始碼
- **THEN** 沒有 `stash` 字樣

### Requirement: cc-review 驗收一個 PR
`/cc-review <slug> <PR#>` SHALL 對一個 PR 跑完「閘 → 獨立驗收員 → 判定 → 合併或退回」；發包者只讀判定行與 BLOCKERS，自己不改任何產品程式碼。`/cc-review <slug> health` 只跑健康檢查。

#### Scenario: 被叫醒先算
- **WHEN** 每次被叫醒（背景監看、驗收員、計時器任一回來）
- **THEN** 第一步跑 `dispatch_state.py next` 與 `stale`，依輸出決定下一步，不靠記憶；還有未完成項、又說不出卡在哪，就繼續做；背景監看或驗收員還在跑不算完成

#### Scenario: 閘紅不派驗收員
- **WHEN** `gate-pr.sh` 退出碼 1
- **THEN** 不派驗收員，把紅的 GATE 編號、指令與 LOG 摘要當 BLOCKERS，直接走 fix-needed

#### Scenario: 衝突交回原 agent
- **WHEN** `gate-pr.sh` 退出碼 3
- **THEN** 經 `/cc-cursor <agentId>` 要同一個 agent `git merge origin/<BASE>` 解衝突後交回，發包者不自己解

#### Scenario: 驗收員只回判定
- **WHEN** 閘綠
- **THEN** 派一個乾淨 context 的驗收員，帶該 task 整段原文、spec 契約、驗收規則；輸出強制成 `VERDICT`（`merge` 或 `fix-needed`）、`BLOCKERS`、`FOLLOWUPS`；全文寫進 `docs/changes/<slug>/reviews/PR-<n>-r<k>.md`，發包者只讀 VERDICT 與 BLOCKERS

#### Scenario: 驗收員規則
- **WHEN** 拼驗收員的 prompt
- **THEN** 含：每個長指令加逾時（`perl -e 'alarm <秒>; exec @ARGV'`）、服務用 `nohup` 並記 PID、禁止 `find /`、禁止 `pkill` 別人的程序、不改被測程式

#### Scenario: effort 分層
- **WHEN** task 涉及資料遷移、權限或跨模組
- **THEN** 驗收員 effort 用 high 以上；其他用 medium；xhigh 以上只留給實測過有差的類型

#### Scenario: 驗收員硬逾時
- **WHEN** 驗收員超過 45 分鐘沒回報
- **THEN** 停掉它，重派一次新的；第二次仍逾時就停下回報使用者，發包者不接手驗

#### Scenario: merge 用腳本
- **WHEN** VERDICT 是 `merge` 且閘綠
- **THEN** 跑 `merge_pr.sh <change-dir> <PR#>`，不手打 `gh`／`git` 組合指令

#### Scenario: fix-needed 送回同一個 agent
- **WHEN** VERDICT 是 `fix-needed`
- **THEN** BLOCKERS 前加一句「先 `git fetch origin <BASE> && git merge origin/<BASE>`（不要 rebase），在同一個分支追加 commit，不開新 PR」，經 `/cc-cursor <agentId>` 送回同一個 agent，不再問使用者；背景監看，跑完從閘重來，k 加 1

#### Scenario: 第 3 輪停
- **WHEN** 同一個 PR 到第 3 輪仍不是 `merge`
- **THEN** 停下回報使用者；發包者不自己修

#### Scenario: FOLLOWUPS 累加
- **WHEN** 驗收員回了 FOLLOWUPS
- **THEN** 逐條附 PR 編號累加到 `docs/changes/<slug>/followups.md`，不擋合併

#### Scenario: 只合進整合分支
- **WHEN** PR 的 base 不是 `gate.env` 的 BASE，或 BASE 是 `main`／repo 預設分支
- **THEN** 不合併，回報「合進 main 要使用者當輪確認」

#### Scenario: 健康檢查
- **WHEN** 本 session 每累積合併 4 個 PR、一波全部合併，或跑 `/cc-review <slug> health`
- **THEN** 查三項：主工作目錄乾淨、`gate-pr.sh <change-dir> --head` 綠、`dispatch_state.py sync <change-dir> --check` 退出碼 0；任一項不對就停止派工與合併；結果寫檔，對話只放三段：做了什麼、發現什麼、需要你做什麼

#### Scenario: 監看斷線重接
- **WHEN** 背景監看以 exit 1 結束，但 `cursor_get_run` 顯示 run 仍在跑
- **THEN** 用同一組 agentId／runId 重新背景監看，不重派、不追問

#### Scenario: 一波一個 session
- **WHEN** 一波全部合併，或本 session 已合併約 8 個 PR
- **THEN** 寫交接單（檔尾附下一波的 kickoff）並停下，由新 session 接手

#### Scenario: 一波內不提早停
- **WHEN** 這一波還有未完成項
- **THEN** 不用總結、詢問或決策清單停下；只在使用者要求暫停、健康檢查不過、需要使用者拍板、不可逆動作要確認時停

#### Scenario: 發包者不寫產品程式碼
- **WHEN** 發包者要寫檔
- **THEN** 只寫 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`；其他改動（就算一行）一律變成追問或新的 micro-task，再走 `/cc-review`

### Requirement: 發包規則寫進 AGENTS 樣板
`templates/AGENTS.md` SHALL 帶一段發包規則，讓被安裝的 repo 不必各自重寫一份「發包例外」。

#### Scenario: 合併與推送權限
- **WHEN** 讀樣板的發包規則
- **THEN** 寫明：整合分支（不是 `main`）可直接 push；被派的 cloud agent 可 push 自己的分支並開 PR 到整合分支；驗收通過後由發包者合進整合分支；合進 `main`、force-push、刪 `main` 以外別人的分支仍要使用者當輪確認

#### Scenario: 發包者寫入邊界
- **WHEN** 讀樣板的發包規則
- **THEN** 寫明發包者只寫 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`，產品程式碼一行也走追問或 micro-task

## MODIFIED Requirements

### Requirement: cc-cursor 安全派一個 agent
`/cc-cursor <prompt>` SHALL 在一次呼叫裡只開一個 Cursor cloud agent，開完立刻把看守腳本丟到背景並結束該輪，不在前景等待。

#### Scenario: 派工前先確認
- **WHEN** 使用者直接呼叫 `/cc-cursor` 帶一段 prompt
- **THEN** 先印出「1 個 agent、repo、model、起點分支」一行並等使用者同意，同意前不呼叫 `cursor_create_agent`

#### Scenario: 開完就走
- **WHEN** `cursor_create_agent` 回傳 `agent.id` 與 `run.id`
- **THEN** 以 `run_in_background: true` 啟動 `cursor_watch_command` 給的指令，然後結束該輪，不呼叫 `cursor_stream_run`

#### Scenario: 被叫醒時回報
- **WHEN** 背景看守結束並叫醒 session
- **THEN** 讀 `.runs/<runId>.md` 的 `--- git ---` 區塊，回報一行：狀態、PR 網址（沒有就寫無）、transcript 路徑

#### Scenario: 追問同一個 agent
- **WHEN** 第一個參數是 `bc-` 開頭的 agent id
- **THEN** 走 `cursor_create_run` 而不是新開 agent，其餘步驟相同

#### Scenario: 發包指令呼叫時不再問
- **WHEN** 由 `/cc-dispatch` 或 `/cc-review` 呼叫，而且呼叫方已取得這一波的同意
- **THEN** 跳過確認那一步，直接開 agent 或追問

#### Scenario: 指定起點分支
- **WHEN** 帶 `--base <ref>`
- **THEN** `startingRef` 用它；沒帶才用 `main`

#### Scenario: 名稱與 label
- **WHEN** 帶 `--name <文字>`
- **THEN** agent 的 name 與監看的 label 都用它；沒帶才取 prompt 前 60／40 字

#### Scenario: 冪等 agentId
- **WHEN** 帶 `--agent-id bc-<uuid>`
- **THEN** 原樣傳 `agentId`；建立回 404 或逾時，先 `cursor_get_agent` 查同一個 id，存在就當作已建立並監看它的 latestRunId，不存在才用同一個 id 重送；回 409 視為已建立，不開第二個 agent

### Requirement: cc-dispatch 讀工單派工
`/cc-dispatch <slug>` SHALL 讀 `docs/changes/<slug>/tasks.md`，只對 `dispatch_state.py next` 判為 `READY` 的 task 各呼叫一次 `/cc-cursor`，並把每次派工經 `dispatch_state.py upsert-run` 記進 `docs/changes/<slug>/runs.md`。

#### Scenario: 算目前波次
- **WHEN** 要派工
- **THEN** 跑 `dispatch_state.py next <change-dir>`，只派 `READY` 的 task，`WAIT`／`SKIP` 的原因原樣回報；不再手算波次，也不再有「前面組別未勾就停」那條永遠不觸發的檢查

#### Scenario: 契約 prompt
- **WHEN** 為一條 task 拼 prompt
- **THEN** 內容含：必讀 `SPEC.md`、`docs/changes/README.md`、該 change 的 `spec.md` 與 `tasks.md`；只做這一條原文（含所有權、依賴子行）；分支從 BASE 開、PR base 也是 BASE；只改所有權列出的檔，其他寫進 PR body 的 `## 交接`；開 PR 前與每次追問後先 `git fetch origin <BASE> && git merge origin/<BASE>`（不要 rebase）；PR 標題逐字 `<slug> N.M: <一句>`；不改 `tasks.md`；spec 錯就同 PR 改；PR body 要有 `## 驗` 貼指令輸出

#### Scenario: 一波只問一次
- **WHEN** 這一波有 k 條 `READY`
- **THEN** 列出 k 條、repo、BASE、上限後只問使用者一次，同意後才逐條呼叫 `/cc-cursor`；之後的追問（`/cc-review` 的 fix 迴圈）不再問

#### Scenario: 同時上限取自規則檔
- **WHEN** 帶 `--max <n>`
- **THEN** 同時在飛的上限是 n；沒帶就取 `docs/changes/README.md`「派工」節的 `MAX_CONCURRENT=<n>`，再沒有用 3；實際派出數＝`next --max` 回的 `READY` 數（已扣掉在飛的）

#### Scenario: sync 打勾
- **WHEN** 使用者呼叫 `/cc-dispatch <slug> sync`
- **THEN** 跑 `dispatch_state.py sync <change-dir> --base <BASE>` 並照它的輸出回報；不再用 `sed` 手改 `tasks.md`／`runs.md`

#### Scenario: sync 抓事後 revert
- **WHEN** 某條 N.M 已合併，之後出現標題符合 `Revert "<slug> N.M:` 的已合併 PR 或 BASE 上的 commit，且時間晚於該次合併
- **THEN** `tasks.md` 該行改回 `- [ ] N.M`，`runs.md` 該列記 `reverted`；revert 之後又有新的 N.M PR 合併就照常打勾

#### Scenario: 整合分支
- **WHEN** 帶 `--base <branch>`（沒帶就取 `<change-dir>/gate.env` 的 `BASE`，再沒有用 `main`）
- **THEN** 每條經 `/cc-cursor --base <branch>` 開 agent，契約 prompt 的分支與 PR base 都是它

#### Scenario: 冪等派工
- **WHEN** 派一條 task
- **THEN** 先產生 `bc-<uuid>`，`upsert-run … --status queued --agent <id>` 記下，再呼叫 `/cc-cursor --agent-id <id>`；拿到 runId 後改 `running`；重跑 `/cc-dispatch` 不會替 `running`／`finished`／`merged` 的 task 再開 agent

#### Scenario: 名稱帶編號
- **WHEN** 派一條 task
- **THEN** 帶 `--name "<slug> N.M <一句>"`，每個 agent 名稱不同

#### Scenario: 合併不在本指令
- **WHEN** 派出去的 PR 做完
- **THEN** `/cc-dispatch` 不合併；合併只經 `/cc-review`，而且只合進整合分支，`main` 一律由使用者當輪確認

#### Scenario: 發包者不寫產品程式碼
- **WHEN** 派工途中發現產品程式碼要改
- **THEN** 發包者不自己改，寫成追問或新的 micro-task；發包者只寫 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`

### Requirement: cc-dispatch 從計畫檔起草工單
`/cc-dispatch <slug> from-plan <計畫檔路徑>` SHALL 讀該計畫檔，寫出 `docs/changes/<slug>/spec.md` 與 `tasks.md`，
通過格式檢查並推上 remote 後，接著照一般派工流程派目前波次。

#### Scenario: 不覆寫既有工單
- **WHEN** `docs/changes/<slug>/` 已存在
- **THEN** 停下並回報「工單已存在，直接 `/cc-dispatch <slug>`」，不寫任何檔

#### Scenario: 起草格式可被檢查
- **WHEN** 起草完 `spec.md` 與 `tasks.md`
- **THEN** repo 有 `scripts/spec_merge.py` 就跑 `python3 scripts/spec_merge.py check .`，紅就修到綠才往下；沒有就回報「未驗格式」

#### Scenario: 疑似已完成的項目
- **WHEN** 計畫裡某項在 `git log` 找得到對應 commit
- **THEN** 該 task 寫成 `- [x]`，並在確認清單點名該 commit hash

#### Scenario: 一次確認涵蓋推送
- **WHEN** 工單起草完成
- **THEN** 只問使用者一次：列出工單路徑、各波 task、要 commit＋push 的檔；同意後才 commit、push、派工，不同意就留在工作區不 commit

#### Scenario: 起草帶所有權與依賴
- **WHEN** 起草 `tasks.md`
- **THEN** 每條未勾 task 底下都有 `所有權：` 與 `依賴：` 子行；同一波的所有權互不重疊，動到同一批檔的放不同波或寫依賴

### Requirement: spec_merge check 快閘
`spec_merge.py check [<root>]` SHALL 驗 `docs/changes/*/spec.md`、`tasks.md` 與 `SPEC.md` 的結構，不寫檔，
缺檔一律跳過不紅。

#### Scenario: Requirement 沒情境
- **WHEN** 任一 delta 的 ADDED／MODIFIED Requirement 底下沒有 `#### Scenario:`
- **THEN** 退出碼 1 並指出檔案與 Requirement 名

#### Scenario: task 行格式錯
- **WHEN** `tasks.md` 有 `- [` 開頭的行不符合 `- [ ] N.M <結果>`（勾只准空白或 x）
- **THEN** 退出碼 1 並指出行號

#### Scenario: 沒鋪就綠
- **WHEN** `docs/changes/` 不存在
- **THEN** 退出碼 0，摘要寫「不存在跳過」

#### Scenario: 超量只警告
- **WHEN** 進行中 change 超過 3 個，或某 change 任務全勾未歸檔
- **THEN** 印 `⚠️` 但退出碼 0

#### Scenario: 未勾 task 缺所有權
- **WHEN** 未勾的 task 找不到至少一個反引號路徑的所有權。認得的寫法只有：task 行上的 `｜所有權：`，或它底下（到下一條 task 或任何 `#` 開頭的標題為止）以 `- 所有權：`／`- **所有權**：` 開頭的子行；冒號後空白時，看它更深一層 `- ` 子項裡的反引號路徑
- **THEN** 退出碼 1，指出行號與 N.M；已勾的 task 不查；寫成半形 `所有權:` 時訊息提示改全形「：」
