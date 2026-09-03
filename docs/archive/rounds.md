# rounds — 每輪的實作筆記與檢討

一輪一節，新的加在最上面。**耐久知識不留在這裡**：決策進 `../decisions.md`，
A／B 類教訓只留一行指標，落點在別處。這個檔會被反覆追加，不揹任何唯一事實。

---

## R3 — P4：memory 寫入規則、20→7 條整理、/goal 定案（2026-09-03）

範圍：本 repo `543c7ca..54a6999`（3 個 commit，**其中 `6790bc6` 不是本 session 做的**——
23:40 由另一手改 `BACKLOG.md` 第 1 條，本輪 23:31 開場的快照沒有它，寫本節時才發現）。
外加帳號層 `~/.claude` 的 `7a1718c`、`google-meta-ads-ga4-mcp` 的 `bfecbb4`，兩邊都沒跑收輪。

**做了什麼**（細節在 commit 訊息與 `../decisions.md`〈memory 寫入規則〉，不在這裡重述）
- 帳號層 `CLAUDE.md` 加兩條 memory 內容規則（使用者當輪核准）。
- `google-meta-ads-ga4-mcp` 的 memory 20 → 7 條、索引 3,930 → 2,030 字元；
  7 條 harness 治理類搬進本 repo 的 memory 目錄。
- `/goal` 順延三次後定案「不取代『做完才叫做完』」，帶實測證據與翻案條件。

**教訓升格：A 2／B 1／C 1**

- **A｜memory 不得抄 repo 已有 SSOT 的事實，只留一行指標。**
  落點：`~/.claude/CLAUDE.md`「帳號層寫入邊界」節規則①。
  實例佐證：原 `account-layer-write-permission-split` 抄了一份路徑清單，抄完就跟
  `CLAUDE.md` 走針——它寫 `commands/`／`output-styles/` 可寫，`CLAUDE.md` 寫的是未經核准不得改。
- **A｜每條 `feedback` memory 帶一行「失效條件」，成立就刪不留註記。**
  落點：同節規則②。沒有失效條件的規則只會累積，沒人敢刪。
- **B（能機器化）｜`grep -L 失效條件 <memory>/*.md` 對 feedback 類應為空。**
  **不在本輪做**：memory 目錄不進任何 git（`~/.claude/.gitignore` 明文排除 `projects/`），
  git hook 掃不到它，落點只能是 `consolidate-memory` 或 `cc-close` 自己跑。
  死法沿用計畫 P4 那條：兩條規則上線後 memory 仍每月新增 >5 條重複 → 規則無效，
  改用 hook 擋寫入路徑。指標：`../plans/2026-09-03-harness-optimize.md` P4。
- **C（一次性）｜怎麼零成本驗一個 CLI flag 存不存在。**
  `claude --goal`（**不帶值**）→ 存在會回 `option '--goal <...>' argument missing`，
  不存在回 `error: unknown option '--goal'`。實測回後者。不必開 session、不花 token、
  不必讀 binary。配合 `strings -a <binary> | grep -i goal` 看內部字串，就能分辨
  「binary 裡有這個字串」與「使用者真的能用這個介面」——本輪 `--goal` 兩者不一致。

**一處偏離計畫**：P4 寫「hermes runbook 與 otto 分析進 `docs/`」，實際上 2026-09-01 的
memory 分流已把兩者的 repo-safe 部分寫進該 repo `docs/ops-facts.md`，所以只搬 render
部署事實、刪 hermes 原條、otto 原條留在 memory（含客戶名不能進 git）。已記在計畫 P4 節。

**未收輪的 repo**：`~/.claude`（`7a1718c`）與 `google-meta-ads-ga4-mcp`（`bfecbb4`）本輪各動一個檔，
兩邊都沒跑收輪——前者沒鋪 `docs/archive/`，後者只是搬入一節文件，改動已完整記在 commit 訊息。

---

## R2 — P3：skill 家族減約束、退役兩支、擋 agent 自派（2026-09-03）

範圍：本 repo `280814d..2636598`（2 個 commit），外加帳號層 `~/.claude` 的 `c4d1ef0`
（該 repo 未跑收輪，見本節末）。

**做了什麼**（細節在 commit 訊息，不在這裡重述）
- 實測 `commands/*.md` 吃不吃 `allowed-tools`／`argument-hint`／`disable-model-invocation`
  ——計畫 P3 的 `[需確認]` 結案，結論在 `../decisions.md`。
- `tools/skill-usage.py` 加 `--toolcount`，凍結 A/B 基線 `../ab/2026-09-03-p3-baseline.md`。
- 三支扛量的 skill 改寫成四段；四支寫檔 skill 加 `disable-model-invocation`；
  `cc-explore`／`cc-plan` 退役。

**教訓升格：A 1／B 1／C 1**

- **A（可反覆套用）｜欄位語意一律實測，不照文件或名稱推。**
  本輪三個欄位裡有一個（`allowed-tools`）名字像白名單、官方 schema 描述也寫成
  「Tools available to the model」，實測卻完全不收斂工具。照名字推就會做出一個假的閘。
  落點：`README.md`「規矩」第 4 條。
- **B（能機器化）｜skill frontmatter 可解析 ＋ 死法段以外不得有日期。**
  兩條都是本輪手跑的一次性指令，該變成常駐檢查。**不在本輪做**——計畫 P5 的
  `tests/test_skills.py` 已排定同一件事，現在做會變成兩份。
  指標：`../plans/2026-09-03-harness-optimize.md` P5 第 2 條；死法沿用該階段的
  「連續 6 輪沒抓到東西且改 skill 時被迫改它 → 拆成只驗路徑存在」。
- **C（一次性）｜怎麼從 Claude Code binary 讀出行為。**
  `grep -a -o -b '<字串>' <binary>` 拿 byte offset，再
  `dd if=<binary> bs=1 skip=$((off-N)) count=M | tr -d '\0' | cat -v` 印上下文。
  本輪靠這個找到 `TXo()`（載 `commands/`）呼叫 `FWe()`（`SKILL.md` 同一支解析器）。
  只在「官方文件沒寫、又必須知道」時用；黑箱 headless 測得出來的就別讀二進位。

**兩處偏離計畫，都已記在 `../decisions.md`**：allowed-tools 白名單只做半套、
simple-explain 不加死法。

**未收輪的 repo**：`~/.claude` 本輪也動了（7 支 skill 改寫、2 支退役、README 表更新，
commit `c4d1ef0`）。本次只在 cc-harness 跑收輪，帳號層那邊沒跑——它沒鋪 `docs/archive/`，
且改動內容已完整記在本輪 commit 訊息與 `../decisions.md`。
