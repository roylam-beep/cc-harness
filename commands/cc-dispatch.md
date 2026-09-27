---
description: 照 docs/changes/<slug>/tasks.md 派工——算目前波次、替每條未勾 task 套契約 prompt、一波只問一次、每條經 /cc-cursor 開一個 agent、記進 runs.md；PR 回來後跑閘＋獨立驗收，過了才合併。`from-plan <計畫檔>` ＝先把 plan mode 計畫檔起草成工單再派。`sync` ＝用 gh 對帳已合併 PR 並打勾。自己不碰任何 cursor_* 工具
argument-hint: "<slug> [sync | from-plan <計畫檔路徑>]"
allowed-tools: Bash(gh pr list:*), Bash(gh pr view:*), Bash(git remote:*), Bash(git status:*), Bash(git log:*), Bash(git fetch:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git pull:*), Bash(gh pr merge:*), Bash(sh:*), Bash(uuidgen:*), Bash(cp:*), Bash(mkdir:*), Bash(python3 scripts/spec_merge.py:*), Bash(sed:*), Bash(ls:*), Bash(grep:*), Read, Write, Edit, Skill, Agent
---

照工單派工。$ARGUMENTS

只作用於當前 repo。`docs/changes/<slug>/tasks.md` 不存在就停（`from-plan` 除外），回報「沒有這份工單；有計畫檔就
`/cc-dispatch <slug> from-plan <路徑>`」（plan mode 的計畫檔在 `~/.claude/plans/`）。
`docs/changes/README.md` 不存在（老 repo 常見）就先
`mkdir -p docs/changes && cp "${CLAUDE_PLUGIN_ROOT}/templates/docs/changes/README.md" docs/changes/`，
它是契約 prompt 的必讀檔，cloud agent 只讀得到 remote 上的檔：`from-plan` 併進它第 4 步那次確認；
一般派工則在第 3 步那次確認一併問「commit＋push 這個檔」，同意才推。
**派 agent 的每一步都經 `/cc-cursor`**，本 skill 不直接呼叫 `cursor_*`。
`BASE`＝`docs/changes/<slug>/gate.env` 的 `BASE=`，沒有這檔或這行就用 `main`。下文的 main 一律指它。
**一波一個 session**：派、驗收、合併都在同一個 session 做完，下一波開新 session——被叫醒時才看得到這波的同意與脈絡。

## 派工（`$ARGUMENTS` 只有 slug）

1. **算目前波次。** 讀 `tasks.md`，`## N.` 是波次。目前波次＝**第一組**還有 `- [ ] N.M` 的那組。
   同一波內的 task 可併行，下一波要等上一波全部合併——這是依賴的唯一表達方式。
2. **拼契約 prompt**，每條 task 一段，逐字包含：

   ```
   你在 <owner/repo>（分支從 <BASE> 開，PR 目標也是 <BASE>）。先讀：SPEC.md（沒有就跳過）、docs/changes/README.md、
   docs/changes/<slug>/spec.md、docs/changes/<slug>/tasks.md。
   只做這一條：<tasks.md 那一行原文>
   規矩：測試與實作同一個 PR；開 PR 前跑「驗：」後面那句，輸出貼進 PR body 的 ## 驗；
   不改 tasks.md；spec.md 寫錯就在這個 PR 裡改；不碰 spec.md「## 不做」列的東西。
   該 task 有列「所有權：」就只改那些檔。開 PR 前、以及每次被追問之後，先 `git merge origin/<BASE>` 再推。
   PR 標題逐字（反引號內那段，不帶句號）：`<slug> N.M: <一句>`。PR body 可選 ## 學到的（一行一條，別人會再踩的坑）。
   ```
3. **一波只問一次。** 列出這波的 task 編號與一句、repo、同時上限 `MAX_CONCURRENT`（取 `docs/changes/README.md`「派工」節那行，找不到用 3），**等使用者同意**。
4. **逐條派。** 先對照 `runs.md`：已有 `runId` 的 task 不再派（重派＝多開一個 agent）；有 `agentId` 沒 `runId` 的用那個 id 重跑。
   新的每條先 `uuidgen` 生 `bc-<小寫 uuid>`，**先寫進 `runs.md` 再開**（檔在 `docs/changes/<slug>/`，不存在就建，表頭如下）。
   前 `MAX_CONCURRENT` 條各呼叫一次 `/cc-cursor --base <BASE> --name "<slug> N.M" --agent-id <id> <契約 prompt>`（Skill 工具），
   cc-cursor 自己那句確認視為本次已同意、不再問；它回報後把 runId 填進該列。超過的先記 `queued`。
5. **結束這一輪。** 回報：派了幾條、排隊幾條、`runs.md` 路徑。

### runs.md 表頭

```
| task | agentId | runId | 狀態 | PR | 備註 |
|---|---|---|---|---|---|
```

狀態值：`running`／`queued`／`finished`／`failed`／`stalled`／`merged`／`closed`／`reverted`。

## from-plan（`$ARGUMENTS` 第二個字是 `from-plan`，第三個是計畫檔路徑）

1. `docs/changes/<slug>/` 已存在 → 停，回報「工單已存在，直接 `/cc-dispatch <slug>`」，不寫任何檔。
2. 讀計畫檔，照 `docs/changes/README.md` 的格式起草兩個檔，**只轉寫計畫裡有的東西，不自己加需求**：
   - `spec.md`：`## Purpose` 取計畫的「為什麼」；`## 不做` 取計畫明說不碰的（沒寫就只列「計畫以外的一切」）；
     計畫的每個可觀察結果寫成 `### Requirement:`＋至少一個 `#### Scenario:`。
   - `tasks.md`：一個 PR 能獨立變綠的量切一條 task；互相依賴的放後一波。「驗：」取計畫裡的驗證方式，
     計畫沒寫就用 repo 的測試指令，都沒有就寫「驗：[需確認]」並在第 4 步點名。
   - 每條 task 用 `git log --oneline -30` 對照；找得到對應 commit 的寫 `- [x]`，第 4 步點名該 hash。
3. repo 有 `scripts/spec_merge.py` 就跑 `python3 scripts/spec_merge.py check .`，紅就改到綠；沒有就記「未驗格式」。
4. **只問一次**：工單路徑、各波 task（標出 `[x]` 的與其 commit）、要 commit＋push 的檔
   （兩個工單檔，加上開頭補的 README）、`git status -sb` 若顯示本機領先 remote 也點名——
   cloud agent 從 remote 的 main 開分支，本機沒推的 commit 它看不到。
   這次同意＝同意本次 commit＋push，**也**＝同意派目前波次，派工第 3 步不再問。不同意就留在工作區，不 commit。
5. 同意後只 stage 上述檔、commit、`git push`，再從派工第 1 步接著跑（跳過第 3 步）。
   全部 task 都是 `[x]` → 不派，回報「計畫已做完，工單只留作紀錄」。

## 被叫醒時

cc-cursor 回報那一行後：把該列 `狀態` 與 `PR` 補上；`runs.md` 還有 `queued` 就再派一條（同樣經 `/cc-cursor`，不再問）。
`failed` 不自動重派，回報 `said:` 那句給使用者決定。有 PR 就接著驗收。

## 被叫醒時：驗收

發包者**不寫產品程式碼**，一行也走追問；只寫 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`。
1. `sh "${CLAUDE_PLUGIN_ROOT}/tools/gate.sh" docs/changes/<slug> <PR#>`（沒有 `gate.env` 就先照 README 建；一律用 Bash `run_in_background: true` 跑，結束會叫醒）。
   退出碼 1 → 把紅的那幾條原樣追問同一個 agent；2 → 停，回報環境錯；3 → 追問同一個 agent「先 merge origin/<BASE>」。
2. 閘綠 → 用 Agent 工具（`isolation: "worktree"`，在那裡 `gh pr checkout <n>`）派 **1 位**對抗型驗收員，限時 45 分鐘：讀 `spec.md` 該 task 的每條 Scenario 與 PR diff，逐條核對；
   負向 Scenario 要做 mutation（故意改壞實作，看測試會不會紅，改完還原）。全文寫主 checkout 的 `docs/changes/<slug>/reviews/PR-<n>-r<k>.md`（給絕對路徑），
   檔頭兩行 `VERDICT: merge|fix-needed`、`BLOCKERS: <條列或「無」>`。發包者只讀這兩行，不讀全文、不自己複驗。
3. `fix-needed` → 把 BLOCKERS 追問同一個 agent，並要它先 merge origin/<BASE>；回來從第 1 步重跑，k+1。
   第 3 輪還不過就停，回報給使用者，**不准自己修**。驗收員卡住或逾時就重派一次，再卡住就回報。
4. `merge` → 本機要在 BASE 上。`runs.md` 該列記 `merged`，commit＋push `docs/changes/<slug>/`（runs.md、reviews/）；
   其他檔有改動就停（不 stash）。再 `gh pr merge <n> --merge`、`git pull --ff-only`。BASE 是 `main` 時，push 與合併前都先問使用者當輪確認。

## sync（`$ARGUMENTS` 第二個字是 `sync`）

1. **收集事件。** `gh pr list --state merged --search "<slug> " --limit 200 --json title,url,mergedAt`：
   標題符合 `^<slug> (\d+\.\d+):` ＝完成、符合 `^Revert "<slug> (\d+\.\d+):` ＝撤回（GitHub Revert 按鈕的標題），時間取 `mergedAt`。
   再 `git fetch origin main` 後 `git log origin/main --format='%cI %s' --grep='^Revert "'`，subject 符合同一個撤回樣式的也算撤回。
   subject 不含 `<slug> N.M:` 的 revert 抓不到（單 commit 的 squash 用 commit 訊息當標題）——不猜，這是已知盲點。
2. **每條 N.M 取時間最晚的事件**，只動那一行（`sed` 精準比對）：完成 → `- [ ] N.M ` 改 `- [x] N.M `、`runs.md` 該列 `merged`；
   撤回 → `- [x] N.M ` 改回 `- [ ] N.M `、`runs.md` 該列 `reverted`。撤回後又有新的完成就照常打勾。
3. `gh pr list --state closed --search "<slug> " --json title,url,mergedAt` 裡 `mergedAt` 為空的 → `runs.md` 記 `closed`，不動 `tasks.md`。
4. 全部勾完就印 `python3 scripts/spec_merge.py docs/changes/<slug>` 這行提醒下一步，不代跑（那是收輪的事）。
5. 沒裝 `gh` 或沒登入：回報一行「無法對帳」，不猜。

## 怎麼驗

回報不重貼 prompt。派工：幾條派出、幾條排隊、哪幾條因 `runs.md` 已有 runId 跳過。sync：勾了哪幾條、改回未勾哪幾條（reverted）、幾條 closed。
from-plan：工單路徑、推上去的 commit hash、`spec_merge.py check` 綠或「未驗格式」，再接派工那句。

## 防什麼

逐條手派時漏讀必讀檔、PR 標題對不上 `sync`、上一波沒合完就開下一波。

退役訊號（每季 `/cc-audit` 看）：連續 3 個歸檔的 change 都沒有 `runs.md`（＝都是手動或 `/cc-cursor` 直接派）→ 派工器多餘，只留 `/cc-cursor`。
