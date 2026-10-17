# 新 session 工具對派工的影響（2026-10-17）

研究問題：桌面 app Code 分頁新出的「另開 session」工具（`start_session` 等，下稱 session 工具），
要不要拿來改 cc-harness 的執行者、clone／worktree 與派工流程。

依據：本 session 載入的工具說明（`mcp__ccd_session__start_session`、`list_sessions`、`get_session`、
`send_message`、`clean_up_worktrees`）、本 session 系統說明的〈Starting other sessions〉節、
`commands/cc-dispatch.md`、`commands/cc-claude.md`、`docs/decisions.md` 2026-10-04 那條、
被拿掉的 session 模式原文（`git show b6cf343`）。**下文所有工具行為都只讀說明、沒有實測。**

## 0. 結論

**現在不換。** session 工具補上了 2026-10-04 拿掉 session 模式時缺的「本機開 session 的工具」，
但那條的翻案條件是「sub-agent 吃派工 session 額度撐不住」，這件事沒有量過、也沒有發生過。
另外查到三條硬限制，其中第一條直接打斷「一波合完自動派下一波」：

| # | 限制 | 出處 | 打到哪裡 |
|---|---|---|---|
| L1 | 由別的 session 訊息或自動事件開始的那一輪，app **拒絕開新 session**，只能改成提案卡 | 系統說明〈Starting other sessions〉 | 自動推進派下一波、接手重派——這兩件都發生在被叫醒的那輪 |
| L2 | 只有「自己開的 session 全部停下、且自己閒著」才會被叫醒；連續很多次叫醒都沒有使用者訊息，之後的通知會壓到下一次使用者開口 | 同上 | 先做完的 PR 要等最慢那條才驗收；長時間無人看守的派工可能停在半路（「很多次」是幾次，說明沒寫） |
| L3 | `target: "cloud"` 的 session **不會回報、不會叫醒**；`mcp__ccd_*` 只在桌面 app 有，CLI 與雲端 session 沒有 | `start_session` 的 `wake_when_done` 說明；系統說明 | 雲端主力路線（`docs/plans/2026-09-24-cloud-orchestrator.md`）用不上；skill 得同時寫「有／沒有這組工具」兩條路，正是 10-04 砍掉的那種分岔 |

## 1. 執行者：sub-agent → session

### 1.1 真的變好的

- **id 活得比派工 session 久。** session 有 `local_<id>`，`list_sessions {linked:true}` 列得出來，
  `SendMessage` 用 id 就能追問。現在的 `agent:<handle>` 跟派工 session 同生同死，所以 `cc-dispatch`
  開頭那段接手對帳（查 PR → 查 `exec/<slug>-N.M` 分支 → 重開）才存在；換成 session，本機那條路可以改成「列出來、直接追問」。
- **定址名稱是正式參數。** `start_session` 有 `name`；本環境的 `Agent` 沒有（BACKLOG #18），
  所以 `agent:<handle>` 追問現在其實一定走備案。
- **使用者看得到、插得了手。** 執行者是側邊欄一列，可點進去看、直接跟它講話、並排顯示；sub-agent 只看得到最後回報。
- **派工 session 被插話時可以交出去。** `hand_off_to_session` 把手上的派工整包移走，這邊空出來回答。

### 1.2 沒變的

- **還是沒有冪等鍵。** 不像 Cursor 的 `--agent-id`，重送一次就是多開一個；「先寫 `runs.md` 再開」照留。
- **額度。** session 與 sub-agent 都吃同一個帳號；session 不吃派工 session 的 context，但 sub-agent 也只回最後一段，
  差距小。有沒有額度差 [需確認]。

### 1.3 要改寫的

- **叫醒方式換了。** sub-agent 是「一個做完叫一次」；session 是 `<side-sessions-event>`，受 L2 限制變成「一波全停才叫一次」，
  `cc-dispatch`「被叫醒時」的觸發與節奏要重寫。通知只引前 400 字，契約前言「最後一行只回 `PR <網址>`」剛好夠用。
- **`initiation` 只能是 `user_asked`。** `offer` 會再問一次「New session／Do it here」，違反「派工指令就是同意」。
- **分支名會被 app 改掉。** `branch_name` 說明：app 會加使用者的分支前綴和尾碼。執行者推送要寫成
  `git push origin HEAD:exec/<slug>-N.M`，不然「PR head 等於 `exec/<slug>-N.M`」那道身分核對會全部失敗。
- **L1 的可能繞法（未驗證的草案）：工人池。** 在使用者下指令的那一輪先開 N 個 session（N＝最寬那一波，上限 8），
  之後每一波、每次退件都用 `SendMessage` 交新任務——追問不算「開新 session」，不受 L1 擋。
  代價：工人的 context 跨波累積；它要自己 `git fetch` 再從 `origin/<BASE>` 開新分支；某個工人卡住時整池怎麼補沒想清楚。

## 2. clone → worktree

- **執行者可以換，驗收員不行。**
  - 執行者：現在 clone 的理由是「發包者 cwd 常不在工單 repo」（`cc-dispatch` 驗收第 2 步）。`use_worktree: true` 只能開
    **這個** repo 的 worktree，`cwd` 要使用者當輪點名地點才准用。`/cc-dispatch` 本來就要求在工單 repo 裡跑，所以執行者適用。
  - 驗收員：它要寫主 checkout 的 `docs/changes/<slug>/reviews/PR-<n>-r<k>.md`，而且一律 Opus。`start_session` 的 `model`
    「只能同級或更便宜，更高的會被忽略」——派工 session 若跑 Sonnet，就開不出 Opus 驗收員。**驗收員留在 `Agent`＋clone。**
- **worktree 從本機分支切。** `source_branch` 要求「已存在的本機分支」，本機 `claude/<slug>` 落後 remote 時執行者就從舊點開工；
  契約「先 `git merge origin/<BASE>`」擋得住，但前言要多一句先 `git fetch`。
- **hook 會不會跟著。** worktree 共用同一個 `.git` 目錄，`.git/hooks` 應該會照跑（clone 不會）[需確認]。
  這不推翻 2026-09-28「保證點在 CI＋ruleset」——Cursor 與 `gh pr merge` 照樣繞得過本機 hook。
- **硬碟。** 8 個 worktree 共用物件庫，比 8 份 clone 省；但每份還是要各裝一次相依套件。
  `clean_up_worktrees` 只清 30／60／90 天沒動的，而且要使用者核准。

## 3. 如果要做，派工流程哪幾段要動

只列位置，不寫新條文。

| 檔 | 段落 | 改什麼 |
|---|---|---|
| `commands/cc-claude.md` | 參數、第 3 步前言、第 4 步「開」 | 加 session 載體；前言改 `HEAD:exec/…` 推送與先 fetch；開法換 `start_session`（`user_asked`、`use_worktree: true`、`name`） |
| 同上 | 第 5 步追問、被叫醒時 | 追問用 `local_<id>`；叫醒來源換 `<side-sessions-event>` |
| `commands/cc-dispatch.md` | 開頭接手對帳 | 本機改成 `list_sessions {linked:true}` 列出來追問；雲端與 CLI 照舊 |
| 同上 | 派工第 4 步 Claude 分支、`runs.md` 的 `agentId` 格式 | `agent:<handle>` → `local_<id>` |
| 同上 | 被叫醒時、自動推進 | L1：下一波改走工人池追問，或停下等使用者點；L2：一波一驗的節奏 |
| 同上 | 停止條件 | 加「session 等在權限提示」——它停在使用者要回答的畫面時，app 不會叫醒派工 session |
| `SPEC.md`、`templates/docs/changes/README.md` | `EXECUTOR` 值 | 多一個值（例如 `session`），或 `claude` 底下分載體 |

## 4. 不動的

Cursor 執行者整條（`/cc-cursor`、看守丟背景）；有界驗收（三種 BLOCKER、3 輪就停）；驗收員 Opus＋clone；
快閘保證點在 CI＋ruleset；整合分支 `claude/<slug>` 與「合進 main 前才問」；`sync` 用 PR 對帳。

## 5. 規模與時機

- 規模：**中，約 1 輪 session 含測試**（被拿掉的 session 段在 `b6cf343` 撈得回骨架，但叫醒方式不同，大半要重寫）；
  工人池若要做，另加一輪，而且要先實測 L1／L2。
- 該做的時機（任一成立）：sub-agent 執行者真的撞到額度或速率限制（10-04 原翻案條件）；
  或使用者需要邊派工邊點進執行者看、插話。
- 現在就能做、不用改派工的：`/cc-gate` 的「新 session 手動跑」可以由使用者一句話讓 agent 用 `start_session` 開。

## 6. 沒驗證的

L1、L2、L3、分支名改寫、模型上限、worktree 的 hook 行為——全部只讀說明。要做第 3 節之前，先用一個兩波、每波兩條的玩具工單實測這六項。
