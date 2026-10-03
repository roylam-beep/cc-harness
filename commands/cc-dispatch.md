---
description: 照 docs/changes/<slug>/tasks.md 派工——算目前波次、替每條未勾 task 套契約 prompt、使用者下指令就是同意、不再問、每條經執行者原語開一個（gate.env 的 EXECUTOR：沒寫＝/cc-cursor，agent／session＝/cc-claude）、記進 runs.md；PR 回來後跑閘＋獨立驗收，過了才合進整合分支，一波全合就自動派下一波，全勾後合進 main 前才問。`from-plan <計畫檔>` ＝先把 plan mode 計畫檔起草成工單再派。`sync` ＝用 gh 對帳已合併 PR 並打勾（gh 不能用就走 GitHub MCP）。驗收員固定 Opus。自己不碰任何 cursor_*／create_session 工具
argument-hint: "<slug> [sync | from-plan <計畫檔路徑>]"
allowed-tools: Bash(gh pr list:*), Bash(gh pr view:*), Bash(git remote:*), Bash(git status:*), Bash(git log:*), Bash(git fetch:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git pull:*), Bash(git switch:*), Bash(gh pr create:*), Bash(gh pr checks:*), Bash(gh pr merge:*), Bash(sh:*), Bash(uuidgen:*), Bash(cp:*), Bash(mkdir:*), Bash(python3 scripts/spec_merge.py:*), Bash(sed:*), Bash(ls:*), Bash(grep:*), Bash(git ls-remote:*), Bash(gh auth status:*), Bash(gh pr ready:*), Read, Write, Edit, Skill, Agent, ToolSearch, mcp__claude-code-remote__send_later, mcp__github__create_pull_request, mcp__github__list_pull_requests, mcp__github__search_pull_requests, mcp__github__pull_request_read, mcp__github__update_pull_request, mcp__github__merge_pull_request
---

照工單派工。$ARGUMENTS

只作用於當前 repo。`docs/changes/<slug>/tasks.md` 不存在就停（`from-plan` 除外），回報「沒有這份工單；有計畫檔就
`/cc-dispatch <slug> from-plan <路徑>`」（plan mode 的計畫檔在 `~/.claude/plans/`）。
`docs/changes/README.md` 不存在（老 repo 常見）就先
`mkdir -p docs/changes && cp "${CLAUDE_PLUGIN_ROOT}/templates/docs/changes/README.md" docs/changes/`，
它是契約 prompt 的必讀檔，cloud agent 只讀得到 remote 上的檔，跟工單一起寫進 BASE。
**派執行者的每一步都經原語**：`gate.env` 的 `EXECUTOR` 沒寫或 `cursor` → `/cc-cursor`；`agent`／`session` → `/cc-claude --mode <它>`。
`EXECUTOR_MODEL` 有寫就以 `--model` 帶給原語，沒寫不帶（Cursor 用其預設、Claude 用 Sonnet）。本 skill 不直接呼叫 `cursor_*`、`create_session`。
下文「agent」泛指執行者，「追問同一個 agent」＝`/cc-cursor <bc-id> <追問>` 或 `/cc-claude <執行者 id> <追問>`。
`/cc-claude` 回「執行者已不在」（sub-agent 跟舊 session 沒了）→ 照派工第 4 步在同一個 `exec/<slug>-N.M` 開新執行者（前言會讓它接著做），
prompt 末尾附上這次追問內容，`runs.md` 該列換成新 id；這不算重派、不另開 PR。
`BASE`＝`docs/changes/<slug>/gate.env` 的 `BASE=`，沒有這檔或這行就用 `main`。
**新工單預設整合分支 `claude/<slug>`**：開工時 `gate.env` 沒有 `BASE=`，
就開它——`git switch -c claude/<slug> origin/main`，`gate.env` 寫 `BASE=claude/<slug>`，commit 後 `git push -u origin HEAD`。
寫明 `BASE=main` 的工單照舊（每次合併都問）。
**寫進 BASE**：BASE 是整合分支就直推（`git push origin HEAD:<BASE>`，`templates/AGENTS.md` 允許）；
BASE 是 `main` 一律走 PR，不直推（main 可能有 ruleset 擋直推，見 `/cc-harness` W4.5）：
`git switch -c dispatch/<slug>-<用途>` → 只 stage 該批檔 → commit → `git push -u origin HEAD` →
`gh pr create --base <BASE> --fill` → `gh pr checks <n> --watch`（Bash `run_in_background: true`；回報沒有任何 check＝repo 沒裝 workflow，直接下一步）→
綠了 `gh pr merge <n> --merge --delete-branch` → `git switch <BASE> && git pull --ff-only`。下文「寫進 BASE」就是這兩種之一。
**`gh` 不能用**（`gh auth status` 失敗，雲端常見）：全文每個 `gh pr …` 換成 GitHub MCP（先 `ToolSearch` 載入）——
create→`create_pull_request`；list／search（含 sync、`--head` 查分支）→`search_pull_requests`／`list_pull_requests`；view／checks→`pull_request_read`；
ready→`update_pull_request`（`draft: false`）；merge→`merge_pull_request`（`merge_method: merge`）。MCP 沒有刪分支：`--delete-branch` 那步略過，分支留著無妨。
MCP 不能 `--watch`：checks 還在跑就排 `send_later` 10 分鐘後再查，不在前景等。`gh pr checkout` 在驗收員那邊換成 `git fetch origin pull/<n>/head:pr-<n> && git switch pr-<n>`。
**使用者下指令就是同意，不問**：使用者打 `/cc-dispatch`，或用文字叫你派工／派 Cursor／派 Claude，就涵蓋全部波次、開整合分支、合進整合分支、
每條執行者的花費。不要再印清單等「同意」——那是使用者已經回答過的問題。一波全合併就自動派下一波（見「自動推進」）。
只在兩種時候停下等使用者：停止條件成立，或要把整合分支合進 `main`。
session 斷了：新 session 打 `/cc-dispatch <slug>`，從 `tasks.md`、`runs.md` 接續。Claude 執行者的 `starting`／`running` 列先對帳：
該 task 已有標題 `<slug> N.M:` 的 PR → 記進該列走驗收；session 模式有 `session_…` id → `/cc-claude --poll 1 <id>` 接回輪詢；
agent 模式（sub-agent 跟著舊 session 沒了）沒 PR 但 `git ls-remote --heads origin exec/<slug>-N.M` 有分支 → 照派工第 4 步再開一個，它會在該分支續做；都沒有才重派。

## 派工（`$ARGUMENTS` 只有 slug）

1. **算目前波次。** 讀 `tasks.md`，`## N.` 是波次。目前波次＝**第一組**還有 `- [ ] N.M` 的那組。
   同一波內的 task 可併行，下一波要等上一波全部合併——這是依賴的唯一表達方式。
2. **拼契約 prompt**，每條 task 一段，逐字包含：

   ```
   你在 <owner/repo>（分支從 <BASE> 開，PR 目標也是 <BASE>）。先讀：SPEC.md（沒有就跳過）、docs/changes/README.md、
   docs/changes/<slug>/spec.md、docs/changes/<slug>/tasks.md。
   只做這一條：<tasks.md 那一行原文>
   規矩：測試與實作同一個 PR；開 PR 前跑「驗：」後面那句，輸出貼進 PR body 的 ## 驗；
   不改 tasks.md；spec.md 寫錯就在這個 PR 裡改；spec 沒寫、但你做了決定的介面約定（參數範圍、檔案格式、資料放哪）也寫進 spec.md；
   不碰 spec.md「## 不做」列的東西。不准用 skip 表達依賴還沒到；依賴沒到就在 PR body 寫明「工單切錯」。
   該 task 有列「所有權：」就只改那些檔（外加 docs/changes/<slug>/spec.md）。開 PR 前、以及每次被追問之後，先 `git merge origin/<BASE>` 再推。
   PR 標題逐字（反引號內那段，不帶句號）：`<slug> N.M: <一句>`。PR body 可選 ## 學到的（一行一條，別人會再踩的坑）。
   ```
3. **不問，直接派。** 同時上限取 `docs/changes/README.md`「派工」節：Cursor 用 `MAX_CONCURRENT`（找不到用 8），
   Claude 執行者用 `MAX_CONCURRENT_CLAUDE`（找不到用 3）。下文 `MAX_CONCURRENT` 指當前執行者那個上限。
   派完那則回報一行列出全部波次、repo、BASE、執行者，讓使用者看得到要跑什麼——是告知，不是請示。
4. **逐條派。** 先對照 `runs.md`，**先寫進 `runs.md` 再開**（檔在 `docs/changes/<slug>/`，不存在就建，表頭如下）。超過上限的先記 `queued`。
   - Cursor：已有 `runId` 的 task 不再派（重派＝多開一個 agent）；有 `agentId` 沒 `runId` 的用那個 id 重跑。
     新的每條先 `uuidgen` 生 `bc-<小寫 uuid>` 寫進 `agentId`，再呼叫 `/cc-cursor --base <BASE> --name "<slug> N.M" --agent-id <id> [--model <EXECUTOR_MODEL>] <契約 prompt>`（Skill 工具），
     它回報後把 runId 填進該列。
   - Claude（`agent`／`session`）：沒有冪等鍵。已有執行者 id 的列不再派。新的每條先寫一列 `starting`、`agentId` 空、`runId` 寫 `-`，再呼叫
     `/cc-claude --mode <EXECUTOR> --base <BASE> --name "<slug> N.M" --branch exec/<slug>-N.M [--model <EXECUTOR_MODEL>] <契約 prompt>`（Skill 工具），
     它回報後把它給的執行者 id（`agent:…` 或 `session_…`）填進 `agentId`、狀態改 `running`。
5. **結束這一輪。** 回報：派了幾條、排隊幾條、`runs.md` 路徑。

### runs.md 表頭

```
| task | agentId | runId | 狀態 | PR | 備註 |
|---|---|---|---|---|---|
```

`agentId`＝執行者 id（Cursor `bc-…`、`agent:…`、`session_…`）。狀態值：`starting`／`running`／`queued`／`finished`／`failed`／`stalled`／`merged`／`closed`／`reverted`。

## from-plan（`$ARGUMENTS` 第二個字是 `from-plan`，第三個是計畫檔路徑）

1. `docs/changes/<slug>/` 已存在 → 停，回報「工單已存在，直接 `/cc-dispatch <slug>`」，不寫任何檔。
2. 讀計畫檔，照 `docs/changes/README.md` 的格式起草兩個檔，**只轉寫計畫裡有的東西，不自己加需求**：
   - `spec.md`：`## Purpose` 取計畫的「為什麼」；`## 不做` 取計畫明說不碰的（沒寫就只列「計畫以外的一切」）；
     計畫的每個可觀察結果寫成 `### Requirement:`，本文每個可觀察子句都要對到一條 Scenario（README「spec.md」節）。
   - `tasks.md`：一個 PR 能獨立變綠的量切一條 task；要讀別條 task 產出的檔就放後一波，同波所有權不交集。「驗：」取計畫裡的驗證方式，
     計畫沒寫就用 repo 的測試指令，都沒有就寫「驗：[需確認]」並在第 4 步點名。「驗：」讓不出反例變紅的（只驗格式、UI 不開瀏覽器）
     在第 4 步回報標 `[驗法弱]`——告知，不停。
   - 每條 task 用 `git log --oneline -30` 對照；找得到對應 commit 的寫 `- [x]`，第 4 步點名該 hash。
   - `gate.env`：`BASE=claude/<slug>`、`GATE_1=` 取 repo 的測試指令；repo 有 `scripts/spec_merge.py` 就加
     `GATE_2="python3 scripts/spec_merge.py check ."`（沒有測試指令就只放這條當 `GATE_1`）。
3. repo 有 `scripts/spec_merge.py` 就跑 `python3 scripts/spec_merge.py check .`，紅就改到綠；沒有就記「未驗格式」。
4. **不問，直接寫進去**：照開頭「新工單預設整合分支」開 `claude/<slug>`，把兩個工單檔、`gate.env`（加上開頭補的 README）commit 直推，
   接著從派工第 1 步跑——cloud agent 只讀得到 remote 上的。`git status -sb` 若顯示本機領先 remote，在回報裡點名
   （整合分支從 `origin/main` 開，本機沒推的 commit 它看不到）。各波 task 裡標成 `[x]` 的，回報點名對應 commit。
   全部 task 都是 `[x]` → 不派，回報「計畫已做完，工單只留作紀錄」。

## 被叫醒時

cc-cursor／cc-claude 回報那一行後：把該列 `狀態` 與 `PR` 補上；`runs.md` 還有 `queued` 就再派一條（同樣經該原語，不再問）。
`failed`／`blocked`／`stalled` 不自動重派，回報 `said:` 那句給使用者決定。有 PR 就接著驗收。

## 被叫醒時：驗收

發包者**不寫產品程式碼**，一行也走追問；只寫 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`。
1. `sh "${CLAUDE_PLUGIN_ROOT}/tools/gate.sh" docs/changes/<slug> <PR#>`（沒有 `gate.env` 就先照 README 建；一律用 Bash `run_in_background: true` 跑，結束會叫醒）。
   退出碼 1 → 把紅的那幾條原樣追問同一個 agent；2 → 停，回報環境錯；3 → 追問同一個 agent「先 merge origin/<BASE>」。
2. 閘綠 → 用 Agent 工具派 **1 位**對抗型驗收員，**一律帶 `model: "opus"`**（不論執行者是誰），限時 45 分鐘。prompt 要寫明：
   - **自己 clone**：`git clone <repo url> <scratchpad>/review-<n>-r<k>` → `gh pr checkout <n>`（不用 `isolation: "worktree"`——發包者 cwd 常不在工單 repo），
     再在本機暫存分支 `git merge origin/<BASE>`，**在合進 BASE 後的狀態**核對。
   - **核對對象**：`spec.md` 該 task 對應 Requirement 的**本文每個子句**＋每條 Scenario、PR diff、所有權、`## 驗`（自己重跑比對，skip 數也記）。
     負向 Scenario 要做 mutation（故意改壞實作，看測試會不會紅，改完還原）。
   - **BLOCKER 只有四種**：(a) Scenario 或 Requirement 子句在合進 BASE 後不成立；(b) 改了所有權外的檔（本 change 的 `spec.md` 不算）；(c) `## 驗` 與重跑不符；
     (d) 重跑 skip>0，或 mutation 顯示某條 Scenario 的反例測不到。其餘一律寫進 `## 非阻擋`，不擋合併。
   - **不會卡死**：第一步先寫出檔頭 `VERDICT: pending`，之後邊查邊追加；不開互動式瀏覽器（畫面靠 `gate.env` 的瀏覽器冒煙）。
   全文寫主 checkout 的 `docs/changes/<slug>/reviews/PR-<n>-r<k>.md`（給絕對路徑），最後把檔頭改成兩行
   `VERDICT: merge|fix-needed`、`BLOCKERS: <條列或「無」>`。發包者只讀這兩行，不讀全文、不自己複驗。
3. `fix-needed` → 把 BLOCKERS 追問同一個 agent，並要它先 merge origin/<BASE>；回來從第 1 步重跑，k+1。
   第 3 輪還不過就停，回報給使用者，**不准自己修**。驗收員卡住或逾時就重派一次，再卡住就回報。
4. `merge` → 本機要在 BASE 上。驗收後 BASE 若已合進別的 PR，先重跑第 1 步的閘（同波併發時常見）；PR 是 draft（Cursor 常開成 draft）就先 `gh pr ready <n>`。
   `gh pr checks <n> --watch --required`（背景跑；沒有任何 check＝沒裝 workflow，直接下一步）綠了才
   `gh pr merge <n> --merge`、`git pull --ff-only`，BASE 是 `main` 時合併前先問使用者當輪確認。`runs.md` 該列記 `merged`。
   記帳：BASE 是整合分支就每合一條把 `docs/changes/<slug>/`（runs.md、reviews/）commit 直推；BASE 是 `main` 就等這波全部合併後經 PR。
   其他檔有改動就停（不 stash）。這波全部 `merged` → 走「自動推進」。

## 自動推進（一波全部 `merged` 之後）

1. 照 sync 第 1–2 步替這波打勾，`tasks.md` 連同記帳寫進 BASE。
2. 還有未勾的波次 → 回派工第 1 步派下一波，**不再問**（使用者的派工指令涵蓋）。
3. 全部勾完、BASE 是整合分支 → `gh pr create --base main --head <BASE> --title "<slug>: 整合進 main" --fill` →
   `gh pr checks <n> --watch`（背景跑）綠了 → **問使用者一次**：PR 網址、波數、合併 PR 數、退回次數。同意才 `gh pr merge <n> --merge`，
   之後提醒 `/cc-close` 歸檔（`spec_merge.py` 由它跑，本 skill 不代跑）。

**停止條件**（任一成立就停下回報、不派新 agent；已在跑的照常跑完驗收）：某 PR 第 3 輪驗收仍 `fix-needed`；
執行者 `failed`／`blocked`／`stalled`；驗收員卡住兩次；`gate.sh` 退出碼 2；執行者或驗收員回報要追加 task、改所有權或動 `## 不做`；
下一波有 task 的「驗：」是 `[需確認]`。

## sync（`$ARGUMENTS` 第二個字是 `sync`）

1. **收集事件。** `gh pr list --state merged --search "<slug> " --limit 200 --json title,url,mergedAt`：
   標題符合 `^<slug> (\d+\.\d+):` ＝完成、符合 `^Revert "<slug> (\d+\.\d+):` ＝撤回（GitHub Revert 按鈕的標題），時間取 `mergedAt`。
   再 `git fetch origin <BASE>` 後 `git log origin/<BASE> --format='%cI %s' --grep='^Revert "'`，subject 符合同一個撤回樣式的也算撤回。
   subject 不含 `<slug> N.M:` 的 revert 抓不到（單 commit 的 squash 用 commit 訊息當標題）——不猜，這是已知盲點。
2. **每條 N.M 取時間最晚的事件**，只動那一行（`sed` 精準比對）：完成 → `- [ ] N.M ` 改 `- [x] N.M `、`runs.md` 該列 `merged`；
   撤回 → `- [x] N.M ` 改回 `- [ ] N.M `、`runs.md` 該列 `reverted`。撤回後又有新的完成就照常打勾。
3. `gh pr list --state closed --search "<slug> " --json title,url,mergedAt` 裡 `mergedAt` 為空的 → `runs.md` 記 `closed`，不動 `tasks.md`。
4. 全部勾完就印 `python3 scripts/spec_merge.py docs/changes/<slug>` 這行提醒下一步，不代跑（那是收輪的事）。
5. `gh` 不能用就照開頭換 GitHub MCP（`search_pull_requests` 帶 `<slug> ` 與 `is:merged`／`is:closed`）；MCP 也沒有才回報一行「無法對帳」，不猜。

## 怎麼驗

回報不重貼 prompt。派工：幾條派出、幾條排隊、哪幾條因 `runs.md` 已有 runId 跳過。sync：勾了哪幾條、改回未勾哪幾條（reverted）、幾條 closed。
from-plan：工單路徑、合進 BASE 的 PR、`spec_merge.py check` 綠或「未驗格式」，再接派工那句。

## 防什麼

逐條手派時漏讀必讀檔、PR 標題對不上 `sync`、上一波沒合完就開下一波。

退役訊號（每季 `/cc-audit` 看）：連續 3 個歸檔的 change 都沒有 `runs.md`（＝都是手動或 `/cc-cursor` 直接派）→ 派工器多餘，只留 `/cc-cursor`。
