# harness-optimize — 把 cc- harness 做成可安裝、可測、可量測的一套

日期 2026-09-03，v1.1（同日對照 Opus 5／Sonnet 5 官方指引修訂，見 review 最後一節）。
依據：`../reviews/2026-09-03-harness-review.md`（所有數字出處在那）。

**v1.1 改了什麼**：P3 方向反轉（減約束再 A/B，不是加約束）；cc-explore／cc-plan 列退役候選；
四支寫檔 skill 加 `disable-model-invocation`；P2 補 A/B 拿掉 UserPromptSubmit echo 與搬歷史敘述；
P1 補評估內建 `/goal`；P5 補 subagent env cap。原則加第 7 條。
規模單位一律用 **session 輪數**（小 <1 輪／中 ≈1 輪／大 2–3 輪／特大先拆）。

## 目標與完成定義

**目標**：一個 Claude Code plugin（`cc-harness`），裝進任何 repo 後得到同一套
skill 家族、hook、閘、安裝器；每條規則有可算的死法；skill 使用量有唯一資料源。

**整體 DoD**（全部可用指令驗）：
- `python3 tools/skill-usage.py --family` 有輸出，且 `session-start` 開場印一行摘要。
- `tests/` 全綠：frontmatter、引用路徑存在、寫檔 skill 的 allowed-tools 是白名單、`$ARGUMENTS`
  與 argument-hint 一致、cross-ref 指到存在的 skill、每支有可算的死法。
- 帳號層 `~/.claude/commands/` **不再有 cc-*.md**，全部由 plugin 提供；`~/.claude/CLAUDE.md`
  只剩仲裁序、安全紅線、輸出憲法、寫入邊界，其餘搬進 plugin 或 repo。
- review 列的 5 條「兩份事實」（帳號層 :72／:91、cc-harness 死路徑、BACKLOG 來源 discoveries、
  ICEBERG 分母、eli5 vs simple-explain）全部只剩一份。
- 每個裝了 plugin 的 repo，開場印「本 session 常駐載入 N 字元」，N 有上限且由 gate 守。

## 原則（從 review 提煉，違反任一條就是走回頭路）

1. **先量測，再立規則。** 沒有資料的死法不算死法。`skill-usage.py` 是唯一使用記錄。
2. **內建的不重造，內建沒給鉤子的用寫入規則補。** memory 是內建，只能約束 agent 怎麼寫。
3. **約束放在用得多的一邊。** handover／close／gate 扛 49/52 的量，它們要先有死法與白名單。
4. **改名有成本，成本是計數器歸零。** 90 天改名凍結；要改先進 `ALIASES`。
5. **per-repo 套用，不 symlink，不跨 repo 讀寫**（沿用 2026-08-19 使用者定案）。
6. **一條規則只能有一份。** 帳號層／plugin／repo 三層各管各的，不互抄。
7. **Opus 5 世代：減約束再 A/B，不加約束。** 官方明說舊模型的步驟腳本、自檢指令、
   數字上限在新模型上會降品質。改 skill 一律先刪再測，用 `skill-usage.py` 與逐字稿 tool_use 數比前後。
   精確保留的只有 fragile bridge：檔案首行格式、commit 訊息格式、安裝步驟。

## 目標形態

```
cc-harness/                          ← 本 repo，可有 remote（無憑證）
├ .claude-plugin/plugin.json         ← plugin 宣告
├ commands/cc-*.md                   ← skill 家族（從 ~/.claude/commands 搬來，SSOT 在這）
├ skills/cc-explain/SKILL.md         ← simple-explain 併入（見 P3 待拍板）
├ hooks/                             ← session-start.sh／guard-bash.mjs 通用版
├ templates/                         ← AGENTS.md 骨架、BACKLOG 檔頭、round.md、handovers/README
├ tools/skill-usage.py／check_docs.py／install-hooks.sh
├ tests/test_skills.py               ← 機械檢查（P5）
└ docs/plans／reviews／decisions.md
```

帳號層剩下：`CLAUDE.md`（仲裁序、紅線、憲法、寫入邊界）、`settings.json`（啟用 plugin）、
`output-styles/eli5.md`。repo 層剩下：`AGENTS.md`、`BACKLOG.md`、`docs/round.md` 等**內容**，
骨架由 plugin 的 `/cc-harness` 產。

## 階段

### P0 — 立基（本輪，已完成）
建 repo、寫本計畫、搬 review、放 `skill-usage.py`。DoD：`git log` 有第一個 commit。

### P1 — 出口端量測（小，<1 輪）— **已完成 2026-09-03**
review 說「如果只做一件事」就是這件。
- 動：`session-start.sh` 尾端加 `python3 <plugin>/tools/skill-usage.py --oneline --days 30`
  ＋印「本 session 常駐載入：CLAUDE.md a ＋ AGENTS.md b ＋ MEMORY.md c ＝ N 字元」。
- 動：同一行 append 到 `~/.claude/projects/<hash>/harness.log`（gitignored 位置，不進任何 repo）。
- 不動：任何規則文字。這階段只加感測器。
- 動：使用量改用 hook 即時記，不只靠事後掃逐字稿：`UserPromptExpansion`（slash command 在這一步展開，
  官方 hooks.md 列有此事件）記使用者打的；`PreToolUse` matcher `Skill` 記 agent 派的；
  `InstructionsLoaded` 事件記每 session 實際載入了哪些 CLAUDE.md／rules——這就是 P6 要的常駐總量，
  不必自己加字元。三個都 append 到 `harness.log`。
  **已確認（2026-09-03，實測 Claude Code 2.1.259 的 `HOOK_EVENT_REGISTRY`）**：
  `UserPromptExpansion` 的 payload 含 `command_name`，所以不必退回只用 `PreToolUse`；
  欄位表見 `../decisions.md`。實作：`hooks/log-harness-event.mjs`＋`hooks/session-start.sh`，
  測試 `test/log-harness-event.test.mjs`（14 項）。
- **未做**：評估內建 `/goal` 能不能取代帳號層「做完才叫做完」那段散文。
  順延到 P3（那一階段本來就要做減約束的 A/B，同一批一起測比較省）。
- 驗證：開新 session，開場看到兩行。
- 死法：`harness.log` 連續 30 天沒被任何決策引用（收輪回報、退役理由）→ 拆掉 append，只留印。

### P2 — 清兩份事實與殘留（小，<1 輪；需使用者當輪核准改帳號層）— **部分完成 2026-09-03**

已做：CLAUDE.md :72／:91、`cc-harness.md` 砍退役史（5,847→4,751，**≤3,500 未達**，
見 `../decisions.md`）、`guard-bash.mjs` 加兩類＋3 個測試、拿掉 `UserPromptSubmit` echo
（A/B 起算 2026-09-03）、google-meta-ads 的 BACKLOG 6 條來源標籤與 ICEBERG 分母
（commit 412bcce／a9df233）。
`cc-gate.md` 的 3 處日期敘述也清了，所以驗證第 3 條（`cc-*.md` 殘留日期全 0）過。
未做（順延到 P3，都屬「減約束」同一批）：`retired-commands/README.md` 的
cc-diagnose-source 退役理由改寫（要先有 `skill-usage.py --repo` 逐 repo 數字）、
帳號層 CLAUDE.md 檔頭那句 rules 併入史、強制詞 10 → 只留帶 because 的。
- `~/.claude/CLAUDE.md:72` 刪「不直寫 BACKLOG」句；`:91` 改成「commit 前跑該 repo 的
  pre-commit 那組，verify 在 push」。
- `retired-commands/README.md` 的 cc-diagnose-source 那列改寫理由：附 `skill-usage.py` 實測
  （11 次／3 repo／末見 08-18），退役理由改成「低頻且一句話可替代」，不再寫「從沒跑過」。
- `cc-harness.md` 砍退役史（`rules/shared/`、`HARNESS.md`、`discoveries/`、`FACTS.md`、`HANDOVER.md`
  五段）→ 搬 `retired-commands/README.md` 一張表。目標 5,847 → ≤3,500 字。
- `guard-bash.mjs` 加兩類：`--no-verify`（push／commit）、`git clean -f`。附測試。
- google-meta-ads repo：BACKLOG 5 條「來源：discoveries」改「來源：範圍外發現」；
  ICEBERG 檔頭撈回率分母改「deferred＋stale」。（在該 repo commit，不在本 repo。）
- `~/.claude/settings.json` 的 `UserPromptSubmit` echo 拿掉一週 A/B（官方：每輪重插指令是舊模型的
  retention crutch）；一週後回覆長度沒變差就永久拿掉。
- 所有 skill 與 CLAUDE.md 的歷史敘述（「2026-08-20 使用者定案」「原 rules/ 已於… 併入」）搬
  `docs/decisions.md`，規則本文只講現行規則。帳號層 CLAUDE.md 強制詞 10 → 只留帶 because 的。
- 驗證：`grep -n "不直寫" ~/.claude/CLAUDE.md` 為空；`node test/guard-bash.test.mjs` 綠；
  `grep -cE '20[0-9]{2}-[0-9]{2}-[0-9]{2}' ~/.claude/commands/cc-*.md` 全部 0。

### P3 — skill 家族重整：減約束、加觸發閘、A/B（中，≈1 輪＋一週觀察）— **已做完 2026-09-03，等一週 A/B（人工閘，不計輪）**

**本輪結果**：`[需確認]` 那條已結案（三個欄位都吃，但語意不同，見 `../decisions.md`）；
三支扛量的已改寫成四段；四支寫檔 skill 加 `disable-model-invocation` 並實測擋得住；
cc-explore／cc-plan 已進 `retired-commands/`；基線凍結在 `../ab/2026-09-03-p3-baseline.md`。
兩處偏離計畫（allowed-tools 只做半套、simple-explain 不加死法）已記在 `../decisions.md`。
**未做**：評估內建 `/goal` 能不能取代帳號層「做完才叫做完」（P1 順延來的，再順延到 P4 同批做）。
2026-09-10 重跑 A/B，判定條件見 `../decisions.md`。

**v1.1 反轉方向**：原案「加白名單＋加死法」是在舊腳本上再加約束；官方對 Opus 5 的指引是
拿掉步驟腳本與自檢指令再 A/B。**不改名**（原則 4）。
- **三支扛量的**（handover／close／gate）各改寫成四段：目標一句、約束、**輸出契約**（精確保留：
  交接單前兩行、kickoff 骨架、gate commit 首行格式）、怎麼驗。步驟編排與「自檢／寫完檢查」措辭刪。
  cc-gate 保留「必須換 session」（Claude Code 官方 fresh-context reviewer 背書），六類掃描清單
  改成一句：只報影響正確性或明列需求的缺口。
- **四支寫檔 skill 加 `disable-model-invocation: true`**——官方對有副作用 workflow 的標準做法；
  直接解 handover 被 agent 自派 22 次、孤兒交接單沒人認領。[需確認：官方 skills.md 只列 `description`／`invocationSample`／`arguments`；`allowed-tools`、`argument-hint`
  與 `disable-model-invocation` 對 `commands/*.md` 的支援要實測，P3 第一件事就是測這三個欄位]
- allowed-tools 白名單照原案（gate／harness 從裸 `Bash, Write, Edit` 收成逐條）。
- **死法**照原案加，但只加可算的：handover「14 天無人接且未刪→標 abandoned」；close「連續 3 輪
  meta commit＞產品 commit→收輪程序該減」；gate「連續 3 次 passes→降抽查」。
- **數字上限改質性**：「5 行內」→「只回判定與最重要一條」。冰山憲法「結論＋最多 1 個待決」是結構不是字數，留。
- **cc-explore／cc-plan 退役候選**：兩支的存在理由是「幫使用者派 Explore／Plan subagent」，
  官方說 Opus 5 已過度派、要抑制；`skill-usage.py` 三天合計 2 次。進 `retired-commands/`，
  理由寫「與 Opus 5 官方指引反向＋使用量」。cc-grill／cc-audit／cc-show／simple-explain 死法改日期型：
  「2026-12-01 前合計 <5 次→退役」。
- **A/B**：改寫前先用 `skill-usage.py` 加逐字稿 tool_use 計數存一週基線；改寫後跑一週；比較每次
  收輪／交接的 tool call 數、產出檔是否仍符合契約（P5 tests 驗）。變差就 revert 該支。
- 驗證：P5 tests 綠；A/B 兩週數字寫進 `docs/decisions.md` 一行。

### P4 — memory 寫入規則（小，<1 輪；帳號層改動需核准）
memory 是內建，只能管 agent 怎麼寫。在 `~/.claude/CLAUDE.md`「帳號層寫入邊界」節加兩條：
1. repo 裡有 SSOT 的事實（registry、ops-facts、rules）不進 memory；memory 只留一行指標。
2. 每條 `feedback` 帶「失效條件」一行；條件成立的下次 `consolidate-memory` 時刪。
官方事實（code.claude.com/docs/en/memory）：每 session 只載入 `MEMORY.md` 前 200 行或 25 KB，
超過時 Claude 自己會把細節搬到主題檔；可用 `autoMemoryEnabled: false` 整個關掉。所以「沒上限」
要修正為「索引有硬上限、內容檔沒有」；現在索引 3,930 字元離上限還遠，問題仍是內容重複與失效。
然後對 google-meta-ads 的 20 條跑一次：7 條重複→指標、3 條放錯層→搬 repo
（render 事實進 `docs/ops-facts.md`，hermes runbook 與 otto 分析進 `docs/`）、
polish-phase 標「已失效 2026-08-31（進入直接做模式）」。目標 20 → ≤8 條。
- 驗證：`wc -c MEMORY.md` 下降；`grep -L 失效條件 memory/*.md` 對 feedback 類為空。
- 死法：兩條規則加了之後 memory 仍每月新增 >5 條重複 → 規則無效，改用 hook 擋寫入路徑。

### P5 — plugin 化＋測試（大，2 輪，第 2 輪含 handover）
- 輪 1：`.claude-plugin/plugin.json`；`git mv` 九支進 `commands/`；`tests/test_skills.py`
  六類檢查（見 DoD 第 2 條）；`hooks/` 收通用版 session-start／guard-bash；`templates/`
  收骨架。本機以 local marketplace 裝，`~/.claude/commands/` 清空 cc-*。
- 輪 2：`/cc-harness` 改成從 plugin `templates/` 產骨架，不再內嵌全文；在第二個 repo
  （建議 gsc-mcp，它用過 cc-handover／cc-plan／cc-audit）實裝驗證。
- plugin settings 帶 `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` 與 `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`
  （官方硬上限，預設 20 並行／3 層深；需 Claude Code ≥2.1.217，本機 2.1.259 [實測 claude --version]）。
  另可設 `CLAUDE_CODE_SUBAGENT_MODEL=haiku` 讓 subagent 用便宜模型；`settings.json` 有 `effortLevel`
  欄位可設 session 預設 effort（`low`…`max`），但它是全 session 的，不能按 skill 分——收輪這種
  機械寫檔想省 effort 只能靠 `/effort` 手動切，先不列入計畫。
- 不做：不動 codex-harness；不做 remote（**待拍板②**）。
- 驗證：`claude plugin validate .`；兩個 repo 開場都印 P1 那兩行；tests 綠。
- 死法（gate 級）：`test_skills.py` 連續 6 輪沒抓到東西且改 skill 時被迫改它 → 拆成只驗路徑存在。

### P6 — 常駐載入預算（小，<1 輪；在 P1 有數字之後）
用 P1 印出的 N 訂上限（建議：取 P1 上線後 5 個 session 的中位數 ×1.1，**只降不升**），
寫進 `check_docs.py` 當第 6 類判定：帳號 CLAUDE.md ＋ AGENTS.md ＋ MEMORY.md 合計。
這才是 review #4 說的「量對的東西」。死法：連續 6 輪沒紅且改任何一檔都要先算它 → 改成只印不擋。

## 待拍板（兩件，各給我的選擇）

① **simple-explain 併入家族嗎？** 併＝改名 cc-explain、eli5 重講協議刪掉只留指標，一份定義；
不併＝留在 `skills/`，eli5 那節刪、skill 留，也只剩一份。
**我選不併**：它 31 次的計數器不該為了命名對稱歸零，違反原則 4；只砍 eli5 那段就解掉 dup。

② **本 repo 要 remote 嗎？** 要＝private GitHub，harness 第一次有異地備份；
不要＝維持本地，跟 `~/.claude` 一樣。
**我選要**：本 repo 規矩 1 保證無憑證無真實 ID，`~/.claude` 不能有 remote 的理由在這裡不成立。
P5 輪 1 開，push 前照慣例當輪問。

## 順序與依賴

P1 → P2 → P3 → P4 可各自獨立成一輪也可合併；P5 依賴 P3（skill 定稿才搬）；P6 依賴 P1（要數字）。
建議：**P1＋P2 同一輪**（都小、都不改設計）→ P3（1 輪＋一週 A/B 觀察，人工閘不計輪數）→ P4 → P5×2 → P6。合計約 6 輪。

## 不做（整個計畫）

- 不重造 Claude Code 內建（Explore／Plan agent、plan mode、/code-review、/simplify、memory）。
- 不加新 skill。家族 9 支只減不增，直到 `skill-usage.py` 顯示某個缺口連續出現。
- 不在 skill 裡加「驗證你的工作」「double-check」「先規劃再動手」類指令——Opus 5 自帶，加了是反效果。
- 不動 codex-harness、不做跨 harness 共用層。
- 不改 AGENTS.md 4,000 上限（等 P6 有總量數字再談）。
