# Harness review — 2026-09-03（對 repo HEAD 4d58e5f、~/.claude f101d8c）

四次增補：①8 弱點重評＋第 9 個 ②四層發現審計 ③memory 歸屬釐清（內建 vs 自建）④cc- skill 家族實測使用量與機械檢查。

所有「實測」都是本 session 用唯讀指令核對過的；沒核對的標 [需確認]。

## 一句話判定

這套 harness 的**輸入端**（規則、閘、hook）做得很扎實，**輸出端**（有沒有人真的照做、
規則有沒有在用）一個量測都沒有。8 個已知弱點裡有 4 個（#1 #3 #5 #6）是同一個根因的
不同面孔：**把「寫了一條規則」當成「有了一個機制」**。這不是 8 個問題，是 1 個問題
加 4 個獨立問題。

## 8 個裡最嚴重：#3（死法沒機器驗），#6 是它的同一件事

**為什麼是它**：整套「常駐層怎麼維持小」的三條防復發機制，第三條「每條規則要帶死法」
是唯一針對**既有堆積**的那條（第一、二條只擋新增與搬家）。它取代的「凍結」被穿透兩次，
理由寫得很清楚：凍結是純自律。但「帶死法」也是純自律——而且比凍結更弱：

- 凍結至少是一個二元狀態，穿透時看得見。
- 死法是一個**條件句**（「連續 6 輪沒抓到」「連續幾次判定照原案」），要成立必須有人在數。
  現在沒有任何東西在數：沒有 skill 使用記錄、沒有 gate 命中記錄、沒有規則被引用的記錄。
- 9 支 skill 每支都寫了死法，但 cc-plan 的死法引用 cc-grill 的行為、cc-grill 的死法引用
  自己的判定分布——全部不可觀測。**這些死法在現況下永遠不會觸發**，等於沒寫。
- #6 是同一件事的證據：退役 cc-diagnose-source／cc-hermes-mcp-test 時，唯一能找的
  「使用記錄」是 rounds.md 裡人寫的敘述。你們已經撞到「沒有使用記錄」這面牆一次了，
  然後把結論寫成「退役判準」而不是「補記錄」。

**後果**：下一次膨脹會走跟 08-21→08-31 一模一樣的路——堆到使用者覺得「太重」才發現。
差別只是這次牆在 4,000 字（#4），所以撞得更快。

**最便宜的修法**（不是提案，是把已存在的東西接起來）：`session-start.sh` 已經在每個
session 開場算 dirty 檔數、ahead 數、交接單落差——它印給 agent 看然後丟掉。
把同一行 append 到一個 gitignored 的 `.harness-log`（或 `~/.claude/projects/*/`），
就有了第一個輸出端訊號。skill 使用記錄可用 UserPromptSubmit hook 對 `$PROMPT` 抓 `/cc-` 前綴。
成本：小（<1 輪）。沒有這個，#1 #3 #5 #6 全部只能靠自律。

## 第 9 個：harness 沒有閉環，而且今天的開場輸出就是證據

**今天 SessionStart hook 印出來的三件事**，每一件都是「規則存在、行為沒發生」：

1. `handovers/2026-08-23-audience-tools.md：基準 5feddd3 在本 repo 找不到`
   ——08-31 把單點 HANDOVER.md 改成一 session 一份，理由是「壞一份只影響那一份，
   接手完成的人刪掉自己接的那份就沒了」。這份從 08-31 重構那個 commit（4ee35a1）之後
   沒人碰，孤兒了 3 天、每個 session 開場印一次。**修法假設「有人會刪」，沒人刪。**
   問題沒解決，只是從「一份壞全壞」變成「壞的那份永遠在」。
2. 12 個 `docs/plans/2026-08-19-*.md` ＋ `docs/kickoff-llm-direct-api.md` **未追蹤兩週**
   （實測 mtime 08-19～08-25）。帳號層規則「做完卻把改動留在工作區，等於把善後丟給下一個
   session」每輪都載入，每輪都被看到，每輪都沒動。
3. `BACKLOG 20/20`（實測）——見下方 #8 的重新評級。

**結構性原因**：所有機器閘都在**入口**（commit 時掃憑證、push 時跑 verify、Bash 前攔
指令）。沒有任何東西在**出口**問：這輪 commit 了幾次？dirty 檔多久沒動？哪條規則被
違反了幾次？08-31 那次唯一的回饋訊號是使用者自己覺得「開發很慢、死不 commit」——
人的挫折感是這套系統唯一的感測器。

## 其他 6 個的重新評級（按實際殺傷力，不按你原本的順序）

**#7 `--no-verify` 繞過（升級為第二嚴重）**
你把它評成「不留記錄」的問題，低估了。實測：`guard-bash.mjs` 只在註解裡提到
`--no-verify`（第 202 行），不擋。而 memory 記錄「push/merge main ＝ Render 自動部署
~90 秒」[需確認：ops-facts.md 沒明寫觸發條件]。如果成立，`pre-push` 不是「CI 之前的一道閘」，
是**生產部署前的最後一道閘**——CI 紅燈時程式已經上線 90 秒了。CI 在這裡是驗屍不是防線。
修法：`guard-bash.mjs` 加一類「`git push`／`git commit` 帶 `--no-verify`」→ exit 2。
成本：小，且已有測試骨架 `test/guard-bash.test.mjs`。

**#8 BACKLOG 20/20（升級：不是缺提醒，是死鎖）**
兩條規則同時成立時互鎖：(a) 「範圍外發現直接寫 BACKLOG 一行，當輪 commit」是強制的；
(b) `check_docs.py` 在第 21 條擋 commit；(c) 逐出順序寫死「已完成 → 3 輪沒動 → 才輪到
價值判斷（收輪時一個使用者決定）」。滿載時任何 session 要加一行，必須先逐出一行；
若前兩級沒有候選，第三級需要使用者決定，而那個 session 正在做別的事。
可預測的結果：agent 要嘛不寫（違規看不見），要嘛自己做價值判斷（違反 (c)）。
沒有第三條路。這在 20/20 的今天已經是現況，不是風險。
修法二選一：滿載時放行到 25 但 commit 訊息強制帶 `backlog-overflow`，收輪必排水；
或把「已完成／3 輪沒動」的逐出機器化（BACKLOG 條目已有日期）。我選後者。

**#4 4,000 字上限沒實證（維持，但點出量錯了東西）**
「常駐層小」量的是 AGENTS.md 一個檔。實際每個 session 載入的是：
帳號層 CLAUDE.md 3,223 ＋ eli5 577 ＋ AGENTS.md 3,858 ＋（動 src 時）implementation.md
上限 6,000 ＋ 9 支 skill 的 description 進 skill 清單。一個動 `src/**` 的 session 常駐
文字約 13,700 字——跟重構前 14,944 差不到 10%。**重構把重量從一個檔搬到四個檔，
單檔指標變好看，總負載沒變。** 該量的是「一個典型 session 開場實際載入的字元數」，
不是任何單一檔案。這個數字現在沒人知道。

**#2 ~/.claude 沒 remote（降級）**
「永不加 remote」是對的，但把它跟「沒有異地備份」綁在一起是假二元。
`git -C ~/.claude bundle create` 到加密外接／iCloud 是一行，不需要 remote。
另外這份 review package 本身已經是 harness 的可重建快照。真正會丟的只有 memory 目錄。
成本：小。嚴重度：低。

**#5 cc-gate 同 session（維持中等，但不可機器化）**
「新 session」從 prompt 檔內部偵測不到，這條只能是文字。可做的是弱化它的必要性：
gate 的 commit 第一行已有固定格式，`session-start.sh` 可以印「上輪 gate 由 <hash> 完成，
距今 N commit」——至少讓「有沒有跑過」可見。

**#1 skill 零測試（維持低）**
真正會靜默壞的只有三件：frontmatter 的 `allowed-tools` 拼錯（skill 直接不能用某工具）、
`argument-hint` 與正文的 `$ARGUMENTS` 用法不一致、正文引用的檔案路徑（`docs/round.md`、
`scripts/check_docs.py`）不存在。這三件一支 30 行的腳本就能驗，可以掛進 `check_docs.py`
（它現在 10.6KB，離 250 行上限還有空間 [需確認]）。其餘「宣稱與行為漂移」本質上不可測。

## 兩個你沒列、但實測抓到的具體缺陷

**A. 帳號層與 repo 層對「閘掛在哪」互相矛盾，且每輪都同時載入。**
`~/.claude/CLAUDE.md:91`「commit 前跑該 repo 的閘（有 npm run verify 就跑）。紅的不 commit」
vs `AGENTS.md:21`「pre-push 自動跑，commit 那關不跑」。仲裁序說 repo 層贏，所以行為上
沒事，但這正是你們自己定義的 `dup:`——同一事實兩份、內容還相反。08-31 改 pre-push 時
漏改帳號層。這條也說明**沒有任何機器在比對帳號層與 repo 層的一致性**。

**B. `cc-harness` 5,846 字，其中約 1/3 是退役史（FACTS.md、rules/shared/、discoveries/、
HANDOVER.md 各自「不再產、已存在不動、回報一行」）。**
這是安裝器在揹歷史。用你們自己 `cc-audit` 的第一問：「不知道這條的人會在什麼時候踩到？」
——只有在一個 08-21 之前鋪過 harness 的 repo 重跑安裝時。那些 repo 有幾個？搬到
`retired-commands/README.md` 或 `docs/decisions.md`，安裝器回到「建缺件」一件事。

## 主張逐條判定

- **主張 1（常駐層小）**：方向對，指標錯。見 #4。
- **主張 2（帶死法）**：目前是儀式。見 #3。**這是整份裡最像自我安慰的一條。**
- **主張 3（閘掛 push）**：對，而且有現場證據支持。唯一漏洞是 #7 ＋ 自動部署。
- **主張 4（動手沒 skill）**：對，不用碰。
- **主張 5（不重造內建）**：對。cc-explore／cc-plan 的存在理由（subagent 使用者打不出來）成立。

## 如果只做一件事

接出口端訊號：`session-start.sh` 印的那幾行同時 append 到一個 log。
有了它，#3 #5 #6 #8 第一次有資料可談，第 9 個才有機會關起來。
沒有它，其餘所有修法都是再加一條規則——就是這套系統已經證明過不管用的那招。

---

# 補充：發現／知識的四層審計（memory、BACKLOG、ICEBERG、discoveries）

實測日 2026-09-03。數字全部來自指令輸出。

## 先修正題目：不是 4 層，是 8 個落點

一個「範圇外發現」或「學到的事」今天可以落在：
memory（帳號層）／BACKLOG／ICEBERG／`docs/plans/`／`docs/archive/rounds.md`（58 KB）／
`docs/decisions.md`／`.claude/rules/*.md` 的「已驗證事實」／`handovers/`。discoveries 是第 9 個，
09-01 已退役。路由規則散在四處：`docs/round.md` 的 A/B/C、`BACKLOG.md` 檔頭、帳號層 CLAUDE.md、
Claude Code 的 memory 系統指令。**沒有一個地方把「什麼東西去哪」寫成一張表。**

## 逐層

### memory（最沒人管、卻每輪都載入的那層）

**先釐清歸屬（2026-09-03 討論後補）：這層是 Claude Code 內建的 auto-memory，不是你的 harness。**
目錄 `~/.claude/projects/<repo-hash>/memory/`、`MEMORY.md` 索引每輪自動載入、frontmatter 的
`type: user | feedback | project | reference` 四分類、「寫完在索引加一行」——全部由 Claude Code
系統提示驅動。你的 harness 只在兩處碰過它：帳號層 CLAUDE.md「`projects/*/memory/` ＝ agent
可自由寫入」，以及 `~/.claude/.gitignore` 排除 `projects/`。

這改變下方問題的歸責：
- **沒上限、沒死法、沒 `check_docs.py` 覆蓋** → 不是你漏設計，內建功能本來就沒給鉤子。
  能控制的只有三件：寫進去的內容（用 CLAUDE.md 規則約束 agent）、`anthropic-skills:consolidate-memory`
  這支內建 skill 定期整理、帳號層加一條「repo 有 SSOT 的事實不進 memory，只留一行指標」。
- **內容重複、與現行規則相反、專案知識只存在 memory** → 這三件是 agent 寫入行為造成的，
  仍歸你的規則層管。下方 a／b／c／d 四類全部屬於這一邊。

| 事實 | 數字 |
|---|---|
| 檔數／總量 | 20 檔／49,050 字元 |
| 索引 MEMORY.md 每 session 載入 | 3,930 字元（**AGENTS.md 4,000 上限沒算它**） |
| type 分布 | feedback 15／project 3／reference 2 |
| 版控 | `~/.claude/.gitignore` 排除 `projects/`（正確：含真實 ID）→ **零備份** |
| `check_docs.py` 覆蓋 | 無。沒上限、沒死法、沒保留期 |

四類問題，各舉實例：

**a. 與 repo SSOT 重複（7 檔）。** 產品規則已落在 `skills/registry.json`，memory 又抄一份：
`zero-impression-not-an-issue`（registry 3 處）、`gads-no-attribution-lag-excuse`
（registry `outputBrevityRule`）、`gads-smart-bidding-calibration`（memory 自己寫「已落地到
registry.json（SSOT）」然後還是留了 2.3 KB 全文）。harness 規則也一樣：
`gate-cannot-be-in-same-round` ＝ `cc-gate.md:13`；`shared-worktree-parallel-sessions` ＝
`guard-bash.mjs` 檔頭。這正是你們自己定義的 `dup:`，而且是**單向漂移**：registry 改了 memory 不會跟。

**b. 放錯層（3 檔）。** `render-paid-no-coldstart`（3.6 KB）是部署事實，`docs/ops-facts.md` 才是
指定落點，但 ops-facts 裡搜不到「冷啟動」——**repo 裡沒有這個事實，只有 memory 有**。
`hermes-live-account-testing`（5.7 KB）是一份 runbook；`otto-ads-mcp-competitive-analysis`
（4.1 KB）是一份報告，rounds／decisions／BACKLOG／ICEBERG 對它 0 次提及。
這三份加起來 13.4 KB 的專案知識只存在一台機器的 gitignored 目錄裡。

**c. 與現行規則相反、且仍在每輪載入（1 檔，最嚴重）。** `polish-phase-propose-first`
（07-25）：「先提案等核准再改、不要做完再報告、現在是打磨階段不求快」。
現行 `AGENTS.md`「預設：直接做……做完 commit，不用問」與帳號層「範圍內直接做，不要問」
是它的反面。兩者都宣稱是 owner 明確指示。索引每輪印一行「打磨階段：先提案等核准再改」，
agent 看到就得自己猜哪個是現行——這是 08-31 前後 owner 心態轉變沒有寫進 memory 的結果。
memory 沒有「失效」欄位，所以舊 feedback 永遠與新規則並列。

**d. 指向不存在於 git 的檔。** `harness-dreaming-and-governance-plan` 指向
`docs/plans/2026-08-19-harness-dreaming-implementation.md`——那是 12 個未追蹤檔之一。
memory 在替一個從沒進 git 的計畫背書。

**判定**：memory 是 8 個落點裡**唯一沒有任何機器守、卻每輪必載**的一層。守不了是內建限制；
但它的實際問題不是太大（49 KB），是**沒有出口**：沒有「已被 repo 吸收」的標記、沒有與 SSOT
的比對、沒有失效條件——這三件都能用「約束 agent 怎麼寫」補，不需要內建功能配合。
15 條 feedback 裡真正屬於「使用者是誰、怎麼跟他工作」而 repo 沒地方放的，
粗估 6 條（avoid-global-find-scans、official-docs-before-experiments、no-cross-project-globals、
markdown-budget-reflow-useless、git-partial-staging、polish-phase 修訂版）。其餘 14 條
要嘛搬進 repo、要嘛縮成一行指標。

**最便宜的修法**：給 memory 加兩條跟 BACKLOG 一樣的規則就夠——
①「repo 有 SSOT 的事實，memory 只留一行指標」；②每條 feedback 帶「失效條件」
（polish-phase 的失效條件就是「owner 說進入直接做模式」，08-31 已成立）。
不需要新工具，`anthropic-skills:consolidate-memory` 已經存在。成本：小。
這兩條寫在帳號層 CLAUDE.md「帳號層寫入邊界」那節底下最合適——那是唯一已經提到 memory 目錄的地方。

### BACKLOG（機制在、沒人執行）

20/20。日期分布：08-21 ×4、08-22 ×10、08-23 ×1、08-31 ×1、09-01 ×7。
08-22 之後收了 3 輪（R-dg-video-copy、R-dg-audiences、R-admin-panel）。
檔頭寫「逐出順序寫死：已完成 → 3 輪沒動 → 才輪到價值判斷」。
**08-21 那 4 條已滿足「3 輪沒動」，仍在。** 逐出的第二級是純機械判準（有日期、有輪次），
卻靠人在收輪時記得算。R-admin-panel 09-01 收輪時 BACKLOG 是 -4/+5，逐出的 4 條是什麼理由
[需確認]，但 08-21 的沒被動到。

另外 BACKLOG 條目「來源：discoveries」還有 5 條——來源欄指向一個已退役的層。無害，但說明
退役時沒回頭改既有條目，跟帳號層那句「不直寫 BACKLOG」是同一種殘留。

### ICEBERG（設計沒問題，指標有問題）

29 條：deferred 11／absorbed 9／stale 6／done 3。撈回率 7% 這個數字是**對整個 ICEBERG 算的**，
但 absorbed（已被別處吸收）和 done 本來就不該撈，它們是 12 條。對「可撈」的 17 條
（deferred＋stale）算，撈回率是 2/17 ≈ 12%。結論不變（保留期合理），但死法「撈回率回到 20%
以上就取消保留期」的分母該是 17 不是 29，否則永遠碰不到 20%。

### discoveries（退役是對的，殘留沒清）

目錄已不存在，decisions.md 有退役理由（「它和 BACKLOG 是同一個入口」）。殘留三處：
1. **帳號層 `~/.claude/CLAUDE.md:70–72` 自相矛盾**：第 70 行「範圍外發現寫進 BACKLOG.md 一行」，
   第 72 行「**不直寫 BACKLOG.md**——那是收輪角色的檔」。第 72 行是 discoveries 時代的原句
   （原本是「寫進 discoveries，不直寫 BACKLOG」），09-01 只換了第 70 行的目標。
   這句**每個 session 每個 repo 都載入**，且與 repo 層「任何 session 都可以加一行」相反。
2. BACKLOG 5 條「來源：discoveries」。
3. `cc-harness.md` 第二段仍花一行講 discoveries 已退役。

## 四層合起來看：這是一個沒有 reconcile 的多入口系統

8 個落點裡只有 memory 是 Claude Code 內建（無法加閘），其餘 7 個全是自建（可以加閘卻沒加跨層比對）。

- 入口有 8 個，**沒有一個機器在跨層比對**：memory 與 registry 重複、memory 與 ops-facts
  互補缺漏、帳號層與 repo 層相反、BACKLOG 來源指向死層——每一種都是「兩份事實」，
  而 `check_docs.py` 只驗每層自己的水位。
- **唯一每輪必載的三份**（帳號 CLAUDE.md 3,223 ＋ AGENTS.md 3,858 ＋ MEMORY.md 3,930）裡，
  只有 AGENTS.md 有上限。另外兩份合計 7,153 字元不在任何預算內。
  「常駐層 4,000 字」實際是 11,011 字，跟重構前的 14,944 差 26%，不是差 74%。
- 09-01 砍 discoveries 是往正確方向走，但砍的是**入口最少**的一層（它只是 BACKLOG 的前廳）。
  重複最多、無守、每輪載入的 memory 層沒被碰。

## 補充後的排序（只列跟這四層有關的）

1. memory 與現行規則相反的條目仍在每輪載入（c 類）——內建層無閘，唯一解是約束寫入規則。
2. 帳號層 CLAUDE.md:72 那句「不直寫 BACKLOG」——一行字、跨所有 repo、與 repo 規則相反。
3. 13.4 KB 專案知識只存在 gitignored memory（b 類）。
4. BACKLOG 「3 輪沒動」逐出判準有資料可算卻沒人算。
5. ICEBERG 撈回率分母算錯，死法永遠不觸發。

---

# 補充：cc- skill 家族審計（每天在用的那層）

資料來源：`~/.claude/projects/*/*.jsonl` 逐字稿，14 個 repo，訊息內嵌 `timestamp` 取日期
（不是檔案 mtime）。使用者打的取 `<command-name>` 標籤，agent 派的取 `Skill` tool_use。
本 session（f191dbc8）已排除。**這份資料一直都在，一支 40 行 python 就抓得到——
但 08-31 退役兩支、寫九條死法時，沒有人看過它。**

## 一、實際使用量（所有 repo 合計，含改名前的舊名）

| 現名 | 舊名 | 使用者打 | agent 派 | 合計 | 首見→末見 |
|---|---|---|---|---|---|
| cc-handover | handover | 6 | 22 | **28** | 07-16 → 09-03 |
| （已刪）next-round | — | 15 | 10 | **25** | 08-14 → 08-21（**一週**） |
| （已消失）goal | — | 25 | 0 | **25** | 07-03 → 08-01 |
| cc-close | round／next-round 部分 | 6 | 5 | 11 | 08-21 → 09-02 |
| cc-gate | gate | 4 | 6 | 10 | 08-17 → 08-30；**cc-gate 改名後 0 次** |
| cc-diagnose-source（退役） | diagnose-source | 4 | 7 | **11** | 07-14 → 08-18 |
| cc-harness | ff-harness／harness | 3 | 1 | 4 | 08-14 → 08-31 |
| cc-audit | （08-31 新） | 1 | 2 | 3 | 09-02 → 09-03 |
| cc-plan | （08-31 新） | 1 | 1 | 2 | 09-02 |
| cc-hermes-mcp-test（退役） | hermes-mcp-test | 0 | 1 | 1 | 08-13 |
| cc-show | show | 1 | 0 | 1 | 08-31（改名當天） |
| cc-explore | （08-31 新） | 0 | 0 | **0** | — |
| cc-grill | （08-31 新） | 0 | 0 | **0** | — |
| （家族外）simple-explain | — | 28 | 3 | **31** | 08-18 → 09-03 |

## 二、五個判定

### 1. 退役 cc-diagnose-source 的證據是錯的（#6 從「可能誤殺」升為「已誤殺一次」）

`retired-commands/README.md` 寫「三層判斷從沒被實際跑過（rounds.md 只有一次提及）」。
逐字稿：**11 次**，跨 3 個 repo，使用者親手打 4 次，其中 07-21 那次的參數是
「以上 2 次的 bug 你都沒呼叫這 skill 去診斷!!? why」——使用者在要求 agent 用它。
最後一次 08-18，退役日 08-31，只隔 13 天。
退役的**結論**（低頻＋一句話就能講）不一定錯，但**證據**是錯的：拿人寫的 rounds.md 敘述
當使用記錄，而真正的使用記錄就在旁邊的目錄。這正是前文 #3／#6 說的「死法沒資料可算」
的第一個實際受害者。

### 2. 家族的真實重心是「收尾」，不是「摸清／決定」

handover 28 ＋ close 11 ＋ gate 10 ＝ **49 次**；explore 0 ＋ plan 2 ＋ grill 0 ＋ show 1 ＝ **3 次**。
五段對應表（摸清→決定→動手→驗收→收尾）是設計上的對稱，使用上是一邊倒。
兩個後果：
- explore／grill／plan／show 的死法全是「連續 N 次…」型，**以現在的頻率，這些條件
  幾個月內都不會有足夠樣本可判**。它們不是會被退役，是會被遺忘。
- agent 派 handover（22）是使用者打（6）的 3.7 倍。交接單多數是 agent 決定要寫的——
  這跟前文「08-23 那份孤兒交接單沒人刪」是同一件事：**agent 建的東西沒有人認領**。

### 3. 使用者最常用的 skill 不在家族裡、也不在 review package 裡

`simple-explain`（`~/.claude/skills/simple-explain/SKILL.md`，91 行）31 次，超過任何一支 cc-。
它的觸發詞「看不懂／重講／??／wait what」與 `eli5.md` 的「重講協議」一節**完全重疊**——
同一個行為有兩份定義（output style 是被動觸發、skill 是主動呼叫），兩處都要改。
review package 把 `skills/` 整個標成「影片製作等，與 harness 無關，本份不列」，
漏掉了使用量第一的那支。**「harness」的邊界是照目錄畫的，不是照使用量畫的。**

### 4. 六週改名四輪，每次都把使用記錄歸零

goal（07 月，25 次）→ 消失，`~/.claude` git 史查不到（版控前就刪了 [需確認]）；
next-round（08-14→21，一週 25 次，家族史上單週最高）→ 08-21 當「轉發檔」刪掉；
ff-harness → harness → cc-harness；round → cc-close；kickoff（3 次）→ 刪。
改名後 cc-gate **0 次**、cc-show 只有改名當天 1 次（使用者打的是舊名 `/show`）、
08-30 使用者還在打 `/round`。每次改名都讓「這支上次被跑是什麼時候」重新開始算——
**死法的計數器被改名重設，而改名本身沒有死法。**

### 5. 機械檢查（這是 #1「零測試」實際會抓到的東西）

- **3 個死路徑**：`cc-harness.md` 引用 `.claude/rules/shared/`、`docs/HARNESS.md`、
  `docs/discoveries/`，在本 repo 都不存在（都是「已退役、若存在只回報」的敘述，
  但一支 30 行的路徑檢查會把它們標紅，逼你決定要不要繼續揹這段歷史）。
- **寫入範圍沒有機器守**：`cc-gate.md` 鐵則 1「diff 只能碰 `docs/plans/**`」，
  但 `allowed-tools: Bash, Read, Glob, Grep, Write, Edit`——不受限的 Bash ＋ Write。
  `cc-harness.md` 同樣。對比 `cc-close`／`cc-handover` 的 allowed-tools 是逐條列的
  `Bash(git status:*)` 這種白名單。**最需要限制寫入的兩支，是唯二不限制工具的。**
  （allowed-tools 能限工具、限不了路徑，所以只能縮到「Bash 白名單＋Write」，
  至少擋掉 `rm`／`git push`。）
- **`cc-harness.md` 沒有 `$ARGUMENTS`**，但 argument-hint 說吃 `doctor`。
  Claude Code 在檔內沒有 `$ARGUMENTS` 時把參數附在 prompt 尾 [需確認]，
  所以大概能動，但這是靠副作用不是靠宣告。
- **cc-close 與 `docs/round.md` 有 5 段逐字相同**（kickoff 骨架那幾行）。cc-close 自稱
  「缺省版，repo 有 round.md 就照它」，所以這是刻意的 fallback——但兩份要同步改，
  而沒有比對。上一次 round.md 改了 cc-close 有沒有跟？無法從檔案判斷。
- 4 支寫檔 skill（close／gate／handover／harness）**沒有死法**，只有 5 支唯讀的有。
  最重、最常被跑、最會留殘留的那 4 支，是唯一不需要證明自己該活著的。
- 尺寸：cc-harness 5,847 字，是第二大 cc-gate（3,068）的 1.9 倍，其中約 1/3 是退役史
  （見前文 B 項）。

## 三、家族整體判定

**這 9 支裡真的在扛的是 3 支（handover／close／gate），另外 6 支合計 6 次。**
前者沒有死法、寫入不受限、留下沒人認領的檔；後者有死法但沒資料可判。
設計把約束放在用得少的一邊，把自由放在用得多的一邊。

如果只改一件事：**用逐字稿當唯一使用記錄。** 上面那張表就是一支腳本的輸出，
可以掛在 `session-start.sh` 印一行「本 repo 近 30 天 skill 使用：handover 5／gate 2／…」，
或收輪時跑一次。有了它：#6 的退役判準有實據、9 條死法第一次可算、改名前先看計數器、
simple-explain 這種家族外的高頻工具會自己浮上來。成本：小（腳本已經寫出來了，
就是產生本節那支）。
