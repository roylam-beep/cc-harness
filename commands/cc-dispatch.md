---
description: 照 docs/changes/<slug>/tasks.md 派工——算目前波次、替每條未勾 task 套契約 prompt、一波只問一次、每條經 /cc-cursor 開一個 agent、記進 runs.md。`sync` ＝用 gh 對帳已合併 PR 並打勾。自己不碰任何 cursor_* 工具
argument-hint: "<slug> [sync]"
allowed-tools: Bash(gh pr list:*), Bash(gh pr view:*), Bash(git remote:*), Bash(sed:*), Bash(ls:*), Bash(grep:*), Read, Write, Edit, Skill
---

照工單派工。$ARGUMENTS

只作用於當前 repo。`docs/changes/<slug>/tasks.md` 不存在就停，回報「沒有這份工單」。
**派 agent 的每一步都經 `/cc-cursor`**，本 skill 不直接呼叫 `cursor_*`。

## 派工（`$ARGUMENTS` 只有 slug）

1. **算目前波次。** 讀 `tasks.md`，`## N.` 是波次。目前波次＝**第一組**還有 `- [ ] N.M` 的那組。
   若它前面還有任何組別有未勾 task，停：回報「第 <N-1> 波未合完，先 `/cc-dispatch <slug> sync`」。
   同一波內的 task 可併行，下一波要等上一波全部合併——這是依賴的唯一表達方式。
2. **拼契約 prompt**，每條 task 一段，逐字包含：

   ```
   你在 <owner/repo>（分支從 main 開）。先讀：SPEC.md（沒有就跳過）、docs/changes/README.md、
   docs/changes/<slug>/spec.md、docs/changes/<slug>/tasks.md。
   只做這一條：<tasks.md 那一行原文>
   規矩：測試與實作同一個 PR；開 PR 前跑「驗：」後面那句，輸出貼進 PR body 的 ## 驗；
   不改 tasks.md；spec.md 寫錯就在這個 PR 裡改；不碰 spec.md「## 不做」列的東西。
   PR 標題逐字（反引號內那段，不帶句號）：`<slug> N.M: <一句>`。PR body 可選 ## 學到的（一行一條，別人會再踩的坑）。
   ```
3. **一波只問一次。** 列出這波的 task 編號與一句、repo、同時上限 3，**等使用者同意**。
4. **逐條派。** 前 3 條各呼叫一次 `/cc-cursor <契約 prompt>`（Skill 工具），cc-cursor 自己那句確認視為本次已同意、不再問；
   第 4 條起先記 `queued`。每派一條就在 `docs/changes/<slug>/runs.md` 加一列（檔不存在就建，表頭如下）。
5. **結束這一輪。** 回報：派了幾條、排隊幾條、`runs.md` 路徑。

### runs.md 表頭

```
| task | agentId | runId | 狀態 | PR | 備註 |
|---|---|---|---|---|---|
```

狀態值：`running`／`queued`／`finished`／`failed`／`stalled`／`merged`／`closed`。

## 被叫醒時

cc-cursor 回報那一行後：把該列 `狀態` 與 `PR` 補上；`runs.md` 還有 `queued` 就再派一條（同樣經 `/cc-cursor`，不再問）。
`failed` 不自動重派，回報 `said:` 那句給使用者決定。

## sync（`$ARGUMENTS` 第二個字是 `sync`）

1. `gh pr list --state merged --search "<slug> " --json title,url,mergedAt` → 標題符合 `^<slug> (\d+\.\d+):` 的，
   把 `tasks.md` 該行 `- [ ] N.M ` 改成 `- [x] N.M `（只動那一行，`sed` 精準比對），`runs.md` 該列 `merged`。
2. `gh pr list --state closed --search "<slug> " --json title,url,mergedAt` 裡 `mergedAt` 為空的 → `runs.md` 記 `closed`，不動 `tasks.md`。
3. 全部勾完就印 `python3 scripts/spec_merge.py docs/changes/<slug>` 這行提醒下一步，不代跑（那是收輪的事）。
4. 沒裝 `gh` 或沒登入：回報一行「無法對帳」，不猜。

## 怎麼驗

回報不重貼 prompt。派工：幾條派出、幾條排隊、哪幾條被擋（波次未合完）。sync：勾了哪幾條、幾條 closed。

## 死法

`ls docs/archive/changes | wc -l` 連續 3 個歸檔的 change 裡 `runs.md` 都不存在（＝都是手動或 `/cc-cursor` 直接派）
→ 派工器多餘，退役，只留 `/cc-cursor`。
