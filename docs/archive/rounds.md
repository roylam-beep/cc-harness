# rounds — 每輪的實作筆記與檢討

一輪一節，新的加在最上面。**耐久知識不留在這裡**：決策進 `../decisions.md`，
A／B 類教訓只留一行指標，落點在別處。這個檔會被反覆追加，不揹任何唯一事實。

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
