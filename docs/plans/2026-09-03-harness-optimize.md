# harness-optimize — 把 cc- harness 做成可安裝、可測、可量測的一套

日期 2026-09-03。依據：`../reviews/2026-09-03-harness-review.md`（所有數字出處在那）。
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

### P1 — 出口端量測（小，<1 輪）
review 說「如果只做一件事」就是這件。
- 動：`session-start.sh` 尾端加 `python3 <plugin>/tools/skill-usage.py --oneline --days 30`
  ＋印「本 session 常駐載入：CLAUDE.md a ＋ AGENTS.md b ＋ MEMORY.md c ＝ N 字元」。
- 動：同一行 append 到 `~/.claude/projects/<hash>/harness.log`（gitignored 位置，不進任何 repo）。
- 不動：任何規則文字。這階段只加感測器。
- 驗證：開新 session，開場看到兩行。
- 死法：`harness.log` 連續 30 天沒被任何決策引用（收輪回報、退役理由）→ 拆掉 append，只留印。

### P2 — 清兩份事實與殘留（小，<1 輪；需使用者當輪核准改帳號層）
- `~/.claude/CLAUDE.md:72` 刪「不直寫 BACKLOG」句；`:91` 改成「commit 前跑該 repo 的
  pre-commit 那組，verify 在 push」。
- `retired-commands/README.md` 的 cc-diagnose-source 那列改寫理由：附 `skill-usage.py` 實測
  （11 次／3 repo／末見 08-18），退役理由改成「低頻且一句話可替代」，不再寫「從沒跑過」。
- `cc-harness.md` 砍退役史（`rules/shared/`、`HARNESS.md`、`discoveries/`、`FACTS.md`、`HANDOVER.md`
  五段）→ 搬 `retired-commands/README.md` 一張表。目標 5,847 → ≤3,500 字。
- `guard-bash.mjs` 加兩類：`--no-verify`（push／commit）、`git clean -f`。附測試。
- google-meta-ads repo：BACKLOG 5 條「來源：discoveries」改「來源：範圍外發現」；
  ICEBERG 檔頭撈回率分母改「deferred＋stale」。（在該 repo commit，不在本 repo。）
- 驗證：`grep -n "不直寫" ~/.claude/CLAUDE.md` 為空；`node test/guard-bash.test.mjs` 綠。

### P3 — skill 家族重整（中，≈1 輪）
依使用量分兩組處理，**不改名**。
- **扛量的三支**（handover／close／gate）：
  - allowed-tools 改白名單：gate 從 `Bash, Write, Edit` 改成 `Bash(git log:*), Bash(git diff:*),
    Bash(npm run:*), Bash(node:*), Bash(python3:*), Read, Glob, Grep, Write, Edit`。harness 同理。
  - 各加死法：handover「交接單建立後 14 天無人接手且未刪 → 該檔由下次收輪標 abandoned」；
    close「連續 3 輪 meta commit ＞ 產品 commit → 收輪程序本身該減」；gate「連續 3 次
    passes with nothing to fix → 降為抽查」。三條都能從 git log／handovers/ 算。
  - handover 加「認領」欄：agent 建的交接單首行第三行 `擁有者：agent｜使用者`，
    收輪時 agent 建且 14 天無人接的直接標 abandoned——解 08-23 孤兒問題。
- **低頻六支**（explore／plan／grill／audit／show ＋ simple-explain）：
  - 死法從「連續 N 次…」改成**日期型**：「2026-12-01 前 `skill-usage.py` 合計 <5 次 → 退役」。
    有日期才會真的被檢查。
  - simple-explain：**待拍板①**。
- 驗證：P5 的 tests 綠；`skill-usage.py --family` 對照表更新進 README。

### P4 — memory 寫入規則（小，<1 輪；帳號層改動需核准）
memory 是內建，只能管 agent 怎麼寫。在 `~/.claude/CLAUDE.md`「帳號層寫入邊界」節加兩條：
1. repo 裡有 SSOT 的事實（registry、ops-facts、rules）不進 memory；memory 只留一行指標。
2. 每條 `feedback` 帶「失效條件」一行；條件成立的下次 `consolidate-memory` 時刪。
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
建議：**P1＋P2 同一輪**（都小、都不改設計）→ P3 → P4 → P5×2 → P6。合計約 6 輪。

## 不做（整個計畫）

- 不重造 Claude Code 內建（Explore／Plan agent、plan mode、/code-review、/simplify、memory）。
- 不加新 skill。家族 9 支只減不增，直到 `skill-usage.py` 顯示某個缺口連續出現。
- 不動 codex-harness、不做跨 harness 共用層。
- 不改 AGENTS.md 4,000 上限（等 P6 有總量數字再談）。
