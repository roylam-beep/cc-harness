---
description: 鋪設或體檢當前 repo 的 harness 標準件（留空＝建缺件並自檢；doctor＝唯讀體檢，不寫任何檔）。寫入一律限於當前 repo。
argument-hint: "[doctor]（留空＝安裝＋自檢；doctor＝唯讀體檢，不寫任何檔）"
allowed-tools: Bash, Read, Glob, Grep, Write, Edit
disable-model-invocation: true
---

本檔即權威規格，自我完備，不需要讀任何外部規格檔。

- 留空 → 依序跑第一段、第二段；第二段 1–3 項發現問題**當場修**。
- 含 `doctor` → 只跑第二段，**唯讀**，發現問題只回報不修。

## 🔒 寫入邊界（最高優先，覆蓋本檔其餘任何敘述）

**所有寫入必須落在當前 repo 根目錄底下。** repo 外只能讀，用途是比對與回報。
唯讀存取只有兩處：`~/claude-harness/tools/check_docs.py`（安裝時複製進 repo）
與 `~/.claude/`（第二段第 4 項比對在場與否）。

禁止寫入 `~/.claude/`、`~/.codex/`、`~/claude-harness/`，以及任何以 `/`、`~`、`..`
開頭而解析後落在當前 repo 之外的路徑——**即使偵測到它缺少或內容不符**。
帳號層的寫入邊界權威定義在 `~/.claude/CLAUDE.md`「帳號層寫入邊界」一節，
本檔不另立一套，只規定本 skill 自己比那節更嚴：對帳號層一律唯讀。
發現全域層缺件時只回報一行「全域層 X 缺（未動，請自行處理）」，不代勞。

**每次呼叫 Write／Edit／含 `>`、`>>`、`rm`、`mv`、`ln` 的 Bash 之前先看目標路徑**：
落在 repo 內＝允許；落在 repo 外＝停手，在收尾回報寫明「拒絕寫入 X（越界）」。
這是行為規則不是腳本——`Write`／`Edit` 不經過 shell，shell 守衛管不到它們，
而標準件幾乎全部由 `Write` 建立；唯一有效的驗收是收尾那份寫入清單。

**禁止指向 repo 外的 symlink**，因為它讓「編輯本 repo」變成「編輯所有 repo」，
且斷鏈時不會報錯。套用一律 per-repo：本 skill 只把標準件**複製成 repo 自有檔**。

## 舊式殘留：一律不動

`FACTS.md`、`HANDOVER.md`、`.claude/rules/shared/`、`.claude/rules/verified-facts.md`、
`docs/HARNESS.md`、`docs/HOOKS.md`、`docs/discoveries/` 都已退役，**本 skill 不產也不刪**，
偵測到就回報一行「舊式殘留 X，遷移由收輪處理」。遷移是收輪角色的事。
退役理由與復活條件見 `~/.claude/retired-commands/README.md` 的表。

## 第一段：repo 標準件（只加不改；同名檔一律保留）

不是 git repo 也照建文件，只有 `pre-commit` 那項會略過。在**當前 repo** 建立缺少的：

- `CLAUDE.md`：唯一內容 `@AGENTS.md`＋一行指向 `AGENTS.md`。**已存在則不動**；
  若其內容是規則本文而非指標，列出差異給使用者一個決定。
- `AGENTS.md`：無則建**七節空殼**（唯一程序權威）：使命／硬性規則／回覆與範圍／
  收輪三步／BACKLOG queue 規則／hook 清單／定案決策；有則不動。
  **建了空殼＝一筆待辦，不准靜默**（W4.1）：收尾明列一行「`AGENTS.md` 尚未填寫使命
  （空殼）」，並寫進 `BACKLOG.md` 一行「填寫 AGENTS.md 使命／硬性規則
  （來源：/cc-harness 安裝，<日期>）」。判定：`使命` 一節底下沒有任何非空白、
  非樣板佔位（`<…>`、`TODO`）的文字。
- `handovers/`：無則建目錄＋`README.md`（寫明「一 session 一份 `<slug>.md`、首行
  `基準：<HEAD 短 SHA> @ <ISO 時間>`、同名加 `-2` 後綴、接手完成只刪自己那份」）。
  三節骨架的權威源是 `/cc-close`；不一致時以該 skill 為準，並在回報指出漂移。
- `.claude/rules/implementation.md`：無則建骨架（含「已驗證事實」小節），
  **檔名固定不隨 repo 改**。frontmatter `paths` 依型別偵測（`go.mod`→`internal/**, cmd/**`；
  `package.json`→`src/**`；`pyproject.toml`→`src/**, lib/**`）；**偵測到的目錄在本 repo
  不存在時**改填實際存在的原始碼目錄並註明原因——照抄不存在的路徑等於規則永不載入。
  **兩者都判不出來時不准靜默寫一個猜的**（W4.3）：在 frontmatter 下方留一行
  `TODO(paths): 未能偵測原始碼目錄，請填實際路徑後刪除本行`，並列給使用者一個決定。
  這行由 `scripts/check_docs.py` 檢查——還在＝gate 紅，所以不會被忘記。
- `BACKLOG.md`：無則建，表頭寫死 queue 規則（≤20 條×≤120 字＋日期＋來源）。
- `docs/archive/rounds.md`、`docs/archive/ICEBERG.md`：無則建（ICEBERG 含撈起規則說明）。
- `scripts/check_docs.py`：無則從 `~/claude-harness/tools/check_docs.py` **複製**進來；
  來源不存在→略過並回報，不算錯誤。**複製後自檢它含哪幾類判定**（應有四類）：
  ①文件字元上限 ②`BACKLOG.md` 條數與行長 ③`.claude/rules/**` 字元預算＋殘留
  `TODO(paths)` ④`.claude/settings.json` 的 hook command 指到的腳本存在。
  缺哪一類就逐一列出——缺的那類等於那道防線在本 repo 不存在。
- `.gitignore`：確保含 `.claude/settings.local.json`。
  （`.claude/rules/**` 是真實檔案，**要進版控**，不列入忽略。）
- `.git/hooks/pre-commit`：無則裝
  ```sh
  #!/bin/sh
  ROOT="$(git rev-parse --show-toplevel)"
  [ -f "$ROOT/scripts/check_docs.py" ] || exit 0
  exec python3 "$ROOT/scripts/check_docs.py" "$ROOT"
  ```
  指向 **repo 內**複本，不依賴家目錄路徑；腳本不存在時直接放行，
  絕不讓一個缺檔擋住所有 commit。**先跑一次 check_docs，現有檔過不了就不裝**，
  把違規清單留給使用者一個決定。非 git repo→略過並回報原因。

## 第二段：自檢與拉回

安裝模式：1–3 項發現問題當場修。doctor 模式：**一個字都不寫**，只讀與回報。

1. repo 標準件齊全（7 件：`CLAUDE.md`／`AGENTS.md`／`handovers/`／`BACKLOG.md`／
   `docs/archive/{rounds,ICEBERG}.md`／`.claude/rules/`／`scripts/`）？
   `AGENTS.md` **要嘛自己寫了收輪／queue／hook／決策四節，要嘛有指到它們本文的路標**
   （`docs/round.md`、`BACKLOG.md` 檔頭、`docs/hooks.md`、`docs/decisions.md` 之類）——
   **兩者皆可，缺的是「找不到」不是「沒寫在 AGENTS.md 裡」**。
   `handovers/` 裡每份交接單首行都有基準行？
2. `.claude/rules/` 底下每個檔都是**真實檔案**而非 symlink（`test -L` 為真＝舊版外連；
   安裝模式改成複本，doctor 只回報）？不與任何外部來源比對——本 repo 的複本就是權威。
3. `python3 scripts/check_docs.py "$(pwd)"` 綠？**檔案不存在＝紅**（W4.2），
   判定寫「紅：文件檢查未安裝」——沒有它就沒有任何文件上限的機器保證，
   靜默容忍等於體檢報綠但實際無防線。（`pre-commit` 缺腳本時仍放行照舊，但 doctor 必須報。）
4. **唯讀比對全域層**：`~/.claude/CLAUDE.md`、`output-styles/eli5.md`，以及 `settings.json`
   的四個 harness hook（`SessionStart`／`UserPromptExpansion`／`PreToolUse` matcher `Skill`／
   `InstructionsLoaded`）是否在場。**只回報，不補、不改。**
5. 判定歪的類型：機械漂移（1–3）／行為漂移（貼下方憲法即拉回）／
   規則本身壞了（明說「這要改設計」，不硬修）。

### 拉回機制（doctor 結束時原文貼出，這是唯一允許全文貼規則的場合）

原文內嵌於此，**不從外部檔讀取，也不憑記憶重述**。貼出來的作用是讓這 6 條回到
context 最新位置，行為當場拉正。

```markdown
## 冰山輸出憲法
1. 回覆＝結論＋最多 1 個待決事項；預設精簡，不硬卡行數。
2. 細節、發現、完整報告不砍也不貼進對話——寫檔，回覆附路標（路徑＋數量）。
3. 狀態類問題（what next／現在情況／繼續）只回 delta＋下一步一句。
4. 問句只回答案，不啟動調查、不改檔；說「動手」才動手。
5. 明說「完整／詳細／報告」才全文輸出。
6. 結尾禁止反問或新提案；下一步只能是已指派工作的下一步。
```

## 收尾回報（統一條款）

1. 一句：「建立 X／補 Y／略過 Z（原因）」
2. 一行自檢結果。**下列三種一律明列，不得吞掉**：`AGENTS.md` 仍是空殼（W4.1，
   並已寫進 `BACKLOG.md`）／`scripts/check_docs.py` 未安裝（W4.2，判定＝紅）／
   任何規則檔還留著 `TODO(paths)`（W4.3）。
3. **寫入清單**：本次寫入的所有檔案路徑逐一列出，末尾聲明「repo 外 0 個檔被寫入」。
   有任何一筆落在 repo 外＝bug，必須明講而不是隱藏。
4. 一句下一步

不重貼檔案內容（doctor 模式的憲法 6 條除外）。
