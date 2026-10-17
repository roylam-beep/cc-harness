# Mod 與 hook 建議（2026-10-17）

依據三份調查：社群 mod 目錄（3 支官方範例＋22 支社群 mod，只讀原始碼、沒有安裝）、
380 個 session／2,928 則使用者訊息（2026-08-18～10-17）、全帳號 memory／BACKLOG／
decisions／hook 盤點。下文數字都是關鍵字比對得到的近似值。原始報告放在 session
scratchpad，不進版控（內容含原文引用與客戶 repo 名）。

## 0. 結論：先做這 6 件

| 順序 | 做什麼 | 對到的問題 | 規模 |
|---|---|---|---|
| 1 | 備份 `~/.claude/projects/*/memory/` | 盤點途中 7 個專案目錄、7 個 memory 檔消失，而且零備份 | 小 |
| 2 | 輪換曾貼進對話的金鑰，裝 `transcript-redactor` | 5 則訊息把疑似金鑰原文貼進對話 | 小（輪換是人工閘） |
| 3 | 裝官方 `blast-radius`，接手 guard-bash 的刪除／reset／force 三類 | guard-bash 既誤擋又漏擋（§5 實測） | 小 |
| 4 | 自製 mod「完成前檢查」：改了檔卻沒驗證就說完成時標紅 | 最常見的兩類錯誤之一；cc-gate 只看 `src/**`，網站類 repo 永遠不觸發 | 中，約 1 輪 session |
| 5 | 自製 mod「狀態面板＋一鍵 push」 | 打「push」140 則、問進度 73 則、問 local／remote 21 則 | 中，約 1 輪 session |
| 6 | 裝 `tool-diet` | 掛了大量 MCP 工具，每次請求都在載入用不到的工具描述 | 小 |

## 1. 比 mod 更急的兩件事

### 1.1 memory 沒有備份

- `~/.claude/.gitignore` 排除了 `/projects/`，2026-09-03 的 review 已經點出「零備份」，至今沒補。
- 盤點途中實際觀察到目錄消失（54 → 47 個目錄、107 → 100 個 memory 檔）。
- 可能的原因：`cleanupPeriodDays` 沒設定，Claude Code 會照預設保存天數清掉舊 session。
  它會不會連 `memory/` 一起清 [需確認]。
- 做法：設定 `cleanupPeriodDays`，並且把 `projects/*/memory/` 加進 `~/.claude` 版控白名單，或另外排定時備份。
  兩者都會動到 `~/.claude/settings.json` 或 `.gitignore`，要你核准。

### 1.2 金鑰貼進過對話

- 4 個 session、5 則訊息含 `gmk_`／`Bearer`／JWT 開頭的字串，其中一則是完整的 API key。
- 這些內容已經寫進 transcript 檔。建議到對應服務輪換，這是人工閘。
- 之後由 `transcript-redactor` 在內容進入 transcript 前遮掉（§3）。不另外寫 hook，免得兩套機制做同一件事。

## 2. 你的模式 → 對應解法

| 發現 | 證據 | 解法 | 落點 |
|---|---|---|---|
| 手動打「push」 | 140 則；其中 79% 是回應 agent 結尾的「要 push 嗎」 | push 仍要當輪授權，但改成按鈕：有未 push 的 commit 時，面板顯示 Push 鍵 | 自製 mod B |
| 規則寫了「commit 是常態」，你仍手動叫 commit | 規則 08-22 寫入後，每週 13／2／15／12／8／1／11 則，沒有下降 | 回合結束時列出「本 session 改過但未 commit」的檔 | 自製 mod B |
| 沒驗證就交付 | 糾正訊息 12 則；memory 5 檔；集中在網站與 harness 類 repo | 回合結束時，若本回合改過檔，卻沒跑測試、gate 或瀏覽器，就在答案下方標紅 | 自製 mod A |
| 看不懂（不是太長） | 叫 cc-explain 56 次（用量第一）；只打「???」163 則；抱怨太長只有 3 則 | 訊息只有問號，或只有「白話／看不懂」時，自動走 cc-explain | 自製 mod C |
| 已授權還停下來問 | 糾正訊息 16 則；memory 6 檔 | 主要是規則矛盾造成的（§6 C4、C7），先修規則，不靠 mod | 規則 |
| 派工後不監看 | 糾正訊息 11 則 | AbovePrompt 一行顯示 Cursor agent 的狀態；PR 交給 `cc-pr-tracker` | 自製 mod D＋社群 mod |
| 設計工作沒叫 skill | 糾正訊息 10 則；memory 4 檔 | 設計類 repo 寫 `*.html`／`*.css` 前，若本 session 沒叫過設計 skill，就提醒 | 自製 mod A 加一條規則 |
| 回覆語言跑掉 | 糾正訊息 7 則 | 回合結束時掃回覆裡的簡體字和港式字（排除 code block） | 自製 mod A 加一條規則 |
| token／慢 | 46 則 | `tool-diet`、`reread-guard`，加一個用量顯示（三選一，見 §3） | 社群 mod |

## 3. 建議裝的社群 mod

安裝會改 `~/.claude/settings.json`（`enabledPlugins`），要你核准；本輪沒有裝任何東西。
裝之前先在 Code tab 打 `/status`，確認 **Claude Code** 那一列 ≥ `2.1.286`。
每支都可以先跑 `claude plugin validate <目錄>`，列出它掛了哪些事件、會做哪些事，這一步不會執行它的程式。

| # | mod | 做什麼 | 風險能力 | 跟 cc-harness 的關係 |
|---|---|---|---|---|
| 1 | `blast-radius`（官方範例） | 刪除、`reset --hard`、`checkout -- .`、`git clean`、force push（含 `+ref`）、migration 先攔，列出會丟掉什麼，用 Proceed／Cancel 按鈕決定 | 只為了量測影響範圍而跑 `git`／`find`／`du`；不連網、不呼叫模型 | **跟 guard-bash 第 1–3 類重疊**。裝了就把那三類從 guard-bash 拿掉，否則同一個指令會問兩次。guard-bash 保留 `--no-verify`、前景 `wait-for-run.js`、`branch -D` |
| 2 | `transcript-redactor`（ray-amjad） | 金鑰在進入 transcript 前換成佔位符，呼叫工具時才放回真值 | 讀檔；不連網；判斷失敗時寧可擋下 | 不重疊。注意它的 marketplace 名稱 `claude-code-mods` 跟另外 3 個 repo 撞名 [需確認] |
| 3 | `tool-diet`（claude-pro-kit） | 最近 5 個 session 沒用過的非核心工具，改成用到時才載入。作者實測每次請求少 36% | 無 | 不重疊 |
| 4 | `flightdeck`（scasella） | 即時看 context、花費、每次權限判定、每個子 agent 的狀態 | 無（原始碼已讀過，只觀察不決定） | 派 gate／audit 子 agent 時看得到誰卡住 |
| 5 | `cc-pr-tracker`（sezaakgun） | 在 prompt 上方追 PR 的合併、review、checks 狀態 | 每 60 秒跑一次 `gh` | 補 cc-dispatch 派完不監看的洞 |

條件式（先不裝，理由寫在旁邊）：

- `commit-cadence`：每回合都把提示注入 prompt，會多花 token；共用 worktree 時，別人的 dirty 檔也會被列出來，跟「只 stage 自己的檔」衝突。改由自製 mod B 用「本 session 改過的檔」來判斷。
- `output-diet`：會截短子 agent 的回報，cc-gate／cc-audit 的驗收結果也會被截。
- `reread-guard`：省 token，但 compaction 後需要重讀時可能被擋。等 `tool-diet` 跑一陣子再評估。
- 用量顯示：`token-weather`（官方）、`pro-hud`、`context-bar` 三選一。它們搶同一個 prompt 上方的位置，也會蓋掉 `blast-radius` 的按鈕。建議只裝 `token-weather`，或乾脆用 `flightdeck`。
- `console-status`：功能幾乎就是 cc-harness 的 UI 版，但它有自己的 STATUS 檔格式，裝了會變成兩套 SSOT（唯一事實來源）。適合當參考，不建議直接用。

## 4. 不要裝

| mod | 理由 |
|---|---|
| `auto-handoff`、`cache-warmer` | 會自動 `/clear`、自動送 prompt，或自動花用量 |
| `switchboard`、TypeSafe Jev 系列、`gemini-review` | 把 prompt 或 diff 送到第三方模型；你處理客戶資料 |
| `network`、`shared-session`、`mod-store` | 對外發布，或替你安裝沒審過的程式碼 |
| `git-commit`（KilimcininKorOglu） | 會清掉 `Co-Authored-By` 署名行 |
| `secret-redactor` | 已下架，改用同作者的 `transcript-redactor` |
| `skill-diet` | 不列 skill 描述，cc-gate 這類靠描述觸發的 skill 會失效 |
| hamzafer 版的 `blast-radius`／`token-weather` | 跟官方版同名但不同物；它的 blast-radius 沒人回應 60 秒就自動取消 |

## 5. 自製 mod／hook

原則：**用「問」或「標示」取代「擋」**。你同時要求「加閘」又抱怨「什麼都擋」，mod 的按鈕可以兩邊都顧到。
規模以 session 輪數估。

| 代號 | 名稱 | 掛的事件 | 做什麼 | 規模 | 跟既有決定的關係 |
|---|---|---|---|---|---|
| A | 完成前檢查 | `tool.call`（記錄本 session 改過的檔與跑過的指令）、`turn.complete` | 本回合改過檔，卻沒有測試、gate 子 agent 或瀏覽器呼叫時，在答案下方加一行紅字；回覆含簡體字或港式字時也標示；設計類 repo 寫網頁檔前沒叫設計 skill 時也標示 | 中，約 1 輪 | 不擋，所以不違反 `decisions.md:35-36`（commit 閘不放 PreToolUse）。同時補上 cc-gate 只看 `src/**` 的洞 |
| B | 狀態面板＋一鍵 push | `session.start`、`turn.complete`、`ui.render`（Pane）、`ui.press` | 顯示本 session 改過但未 commit 的檔、ahead／behind、開著的 PR、BACKLOG 條數。有未 push 的 commit 時顯示 Push 鍵，按下去等於你送出「push」 | 中，約 1 輪 | push 仍由你當輪按鍵授權，安全紅線不變 |
| C | 「???」轉 cc-explain | `prompt.submit` | 訊息只有問號，或只有「白話／看不懂／重講」時，改寫成 `/cc-harness:cc-explain` | 小 | **推翻 `decisions.md:83-84`**（2026-09-03 決定不加回 UserPromptSubmit）。mod 的 `prompt.submit` 跟 settings hook 是不同機制，但精神上是同一件事，要你明確同意 |
| D | Cursor agent 監看 | `$.clock.every`＋`$.mcp.call`（cursor-cloud）、`ui.render`（AbovePrompt） | 一行顯示派出去的 agent：跑多久、狀態、有沒有 PR | 小～中 | 補 cc-dispatch 派完不監看的洞；跟 `cc-pr-tracker` 分工：一個看 agent，一個看 PR |
| E | `~/.claude` 受保護路徑確認 | `tool.check`（Write／Edit／Bash） | 寫 `CLAUDE.md`、`settings*.json`、`commands/`、`output-styles/`、`skills/` 時跳確認按鈕 | 小 | 取代 classifier 擋法不一致、agent 換工具繞路（BACKLOG #9） |
| F | memory 失效條件檢查 | `tool.call`（Write 到 `projects/*/memory/*.md`） | `type: feedback` 沒有 `失效條件：` 時提醒；目前 43 條裡有 11 條缺 | 小 | 機械化帳號層既有規則 |
| G | guard-bash 修補 | 既有 `hooks/guard-bash.mjs` | 交給 blast-radius 的三類拿掉；補 `git commit -nm`、`git push +ref`、`bash -c`；修 `2>/dev/null` 被當成目標 | 小 | 見下方實測 |

A、B、D、E、F 可以包成同一個 plugin（cc-harness 本身就是 plugin，可以直接加 hooks module）。
C 要你先決定要不要推翻 09-03 的決定。

### guard-bash 實測（2026-10-17，`node hooks/guard-bash.mjs`）

| 指令 | 結果 | 應該 |
|---|---|---|
| `git commit -nm x` | 放行 | 擋（`-n` 等於 `--no-verify`） |
| `git push origin +main` | 放行 | 擋（`+` 等於 force） |
| `bash -c "rm -rf src"` | 放行 | 擋或問 |
| `git add -A && git commit -m wip` | 放行 | 帳號層規則禁止，hook 沒做 |
| `rm -rf <scratchpad>/x` | 放行 | 放行（正確） |
| `rm -rf <scratchpad>/x 2>/dev/null` | **擋**，理由寫「目標是 `2>/dev/null`」 | 放行 |

## 6. 規則矛盾（只列不改；改帳號層或 skill 本文要你核准）

| # | 矛盾 | 出處 |
|---|---|---|
| C1 | 組織指令「不加摘要、結語」vs ELI5「回覆只給路徑＋3 行摘要」 | `~/.claude/output-styles/eli5.md:12-13` |
| C3 | 帳號層規定台灣繁中，但 3 個專案的 AGENTS.md 寫「香港繁體中文書面語」 | 各專案 `AGENTS.md` |
| C4 | 花錢：帳號層「燒錢的要問」、cc-dispatch「token 無限」、某條 memory「貴的先說」，三份不一致 | `CLAUDE.md:91`、`commands/cc-dispatch.md:32-33` |
| C5 | 帳號層「說跑 gate 才進流程」vs cc-gate「不用等使用者叫就自派」 | `CLAUDE.md:73`、`commands/cc-gate.md:43-45` |
| C7 | cc-cursor 的 description 寫「一律先問」，本文寫「不問」。description 是每個 session 都會載入的那份 | `commands/cc-cursor.md:2` vs `:25` |
| C8 | cc-grill「確認後只交清單」vs 你 10-04 否決過這個做法（該條 memory 只在一個 repo 載入，其他 repo 會重犯） | `commands/cc-grill.md:42` |
| C10 | 「commit 前跑 lint／test」vs pre-commit 模板只跑文件檢查 vs decisions 說保證點在 CI | `CLAUDE.md:113`、`templates/hooks/pre-commit` |
| C15 | 某條 memory 宣稱有 UserPromptSubmit hook 和 `~/.claude/rules/`，實際上兩者都不存在 | 某專案 `memory/blowup-diagnosis-five-layers.md` |
| C17 | `skill-authoring-hygiene.md` 的失效條件已經成立，卻沒刪 | 本 repo memory |
| — | cc-gate 自派只認 `src/**`，「沒驗證就交付」最多的網站／影片 repo 沒有 `src/` | `commands/cc-gate.md:45` |

## 7. 你自己的盲點（客觀描述）

- **嫌重又一直加**：問「會不會太重」27 則；同期要求「存成 skill／加 hook」31 則。帳號層 CLAUDE.md 4,012 字，分配額 1,500。
- **「直接做」和「先別動」並存**：「建議??／要不要」這類問句有 237 則，照「問題就只是問題」的規則，agent 不該動手，所以你得再打「動手」（82 則）。
  可以考慮給 agent 一個區分方式，例如問句結尾加「→做」就代表授權。
- **嫌 token 貴，但輸入很重**：27 則貼上超過 5,000 字，最長一則是整頁 HTML 原始碼。56% 的時間同時開 2 個以上 session。
- **規則管的是長度，痛點卻是聽不懂**：見 §2。冰山和 ELI5 壓的是字數；你的訊號是術語、編號、ID 看不懂。
- **自己的訊息常用港式詞**（「攪」15 次等），agent 讀你的輸入可能被帶偏。
- **沒有任何量測**：skill 使用量 log 已在 09-24 拆掉，現在不知道哪條規則有沒有被照做。自製 mod A／B 的紀錄可以順便當量測。
- **9 個 repo 掛著未提交改動 4–10 週**，最多一個 60 檔。

## 8. 附錄（原始報告，不進版控）

位置：session scratchpad（`/private/tmp/claude-501/…/scratchpad/`），重開機可能被清掉。

- `mods-catalog.md`：25 支 mod 的逐支評估、mod 事件與 API 清單、Desktop 限制
- `user-patterns.md`：訊息統計與引用（已抹除客戶名）
- `agent-errors.md`：13 類錯誤、17 條矛盾、hook 對照表、11 個盲點
- `ana/`：中間檔，**含未抹除的原文與金鑰**，看完請刪
