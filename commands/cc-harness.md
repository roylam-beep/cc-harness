---
description: 鋪設或體檢當前 repo 的 harness 標準件（留空＝建缺件並自檢；doctor＝唯讀體檢，不寫任何檔）。作用範圍限於當前 repo：repo 外不寫，也不讀帳號層。
argument-hint: "[doctor]（留空＝安裝＋自檢；doctor＝唯讀體檢，不寫任何檔）"
allowed-tools: Bash, Read, Glob, Grep, Write, Edit
disable-model-invocation: true
---

模式由 `$ARGUMENTS` 決定：留空 → 第一、二段都跑，第二段 1–3 項發現問題**當場修**；
含 `doctor` → 只跑第二段，**唯讀**，發現問題只回報不修。

## 🔒 寫入邊界（最高優先，覆蓋本檔其餘任何敘述）

**所有寫入必須落在當前 repo 根目錄底下。** repo 外唯一允許的存取，是讀
`${CLAUDE_PLUGIN_ROOT}/`（樣板與 `tools/`）好把骨架複製進來。

**帳號層 `~/.claude/` 一律不碰——不寫也不讀、不比對、不回報缺件。**
帳號 `CLAUDE.md`、`output-styles/`、`claude plugin list` 在不在場不是本 skill 的事，
歪了靠帳號層自己的閘抓。唯一例外：第二段第 3 項的 `check_docs.py` 第 7 類會讀帳號
`CLAUDE.md` 與 `MEMORY.md` 算常駐字元——唯讀，寫入仍只落在 repo。

同樣禁止寫入 `~/.codex/`、`${CLAUDE_PLUGIN_ROOT}/`，以及任何解析後落在當前 repo
之外的路徑——**即使偵測到它缺少或內容不符**。邊界的權威定義在帳號層 `CLAUDE.md`
「帳號層寫入邊界」節（每 session 常駐，不必另讀）；本檔只比那節更嚴。

**每次呼叫 Write／Edit／含 `>`、`>>`、`rm`、`mv`、`ln` 的 Bash 之前先看目標路徑**：
落在 repo 內＝允許；落在 repo 外＝停手，在收尾回報寫明「拒絕寫入 X（越界）」。
這是行為規則不是腳本——`Write`／`Edit` 不經過 shell，shell 守衛管不到它們。

**禁止指向 repo 外的 symlink**，因為它讓「編輯本 repo」變成「編輯所有 repo」，
且斷鏈時不會報錯。一律**複製成 repo 自有檔**。

## 舊式殘留：一律不動

`FACTS.md`、`HANDOVER.md`、`.claude/rules/shared/`、`.claude/rules/verified-facts.md`、
`docs/HARNESS.md`、`docs/HOOKS.md`、`docs/discoveries/` 都已退役，**本 skill 不產也不刪**，
偵測到就回報一行「舊式殘留 X，遷移由收輪處理」。理由記在帳號層退役史，本 skill 不去讀。

## 第一段：鋪標準件（只加不改；同名檔一律保留）

**照 `${CLAUDE_PLUGIN_ROOT}/templates/README.md` 那張對照表複製**，缺什麼補什麼，
已存在的一律不動。本檔不重述那張表：改樣板不該回頭改本檔。

```bash
sh "${CLAUDE_PLUGIN_ROOT}/tools/install-hooks.sh"        # git hook（非 git repo 略過）
cp "${CLAUDE_PLUGIN_ROOT}/tools/check_docs.py" scripts/  # 沒有 scripts/check_docs.py 才複製
```

複製之後三件事**不准靜默**：

- **W4.1**：`AGENTS.md` 是剛建的空殼（`使命` 節底下沒有非樣板文字）→ 收尾明列一行，
  並寫進 `BACKLOG.md` 一行「填寫 AGENTS.md 使命／硬性規則（來源：/cc-harness 安裝）」。
- **W4.2**：`scripts/check_docs.py` 沒裝成 → 判定＝紅，不是 warning。
- **W4.3**：`.claude/rules/implementation.md` 的 frontmatter `paths` 依型別偵測
  （`go.mod`→`internal/**, cmd/**`；`package.json`→`src/**`；`pyproject.toml`→`src/**, lib/**`），
  **偵測到的目錄不存在就改填實際存在的原始碼目錄並註明**；兩者都判不出來就留樣板那行
  `TODO(paths)` 不動，列給使用者一個決定。照抄不存在的路徑＝規則永不載入。

`CLAUDE.md` 已存在但內容是規則本文而非指標時，列出差異給使用者一個決定，不自己改。

## 第二段：自檢與拉回

安裝模式：1–3 項發現問題當場修。doctor 模式：**一個字都不寫**，只讀與回報。

1. 標準件齊全（`CLAUDE.md`／`AGENTS.md`／`handovers/`／`BACKLOG.md`／
   `docs/archive/{rounds,ICEBERG}.md`／`.claude/rules/`／`scripts/`）？
   `AGENTS.md` **要嘛自己寫了收輪／queue／hook／決策四節，要嘛有指到它們本文的路標**——
   **兩者皆可，缺的是「找不到」不是「沒寫在 AGENTS.md 裡」**。
   `handovers/` 裡每份交接單首行都有基準行？
2. `.claude/rules/` 底下每個檔都是**真實檔案**而非 symlink（`test -L` 為真＝舊版外連）？
3. `python3 scripts/check_docs.py "$(pwd)"` 綠？**檔案不存在＝紅**（W4.2）。
   複製進來的那支應有**七類**判定：①文件字元上限 ②`BACKLOG.md` 條數與行長
   ③`.claude/rules/**` 預算＋殘留 `TODO(paths)` ④hook command 指到的腳本存在
   ⑤`.git/hooks/` 與版控真身一致 ⑥`plugin.json` 元件路徑存在 ⑦常駐載入預算。
   缺哪一類就列出來——缺的那類等於那道防線在本 repo 不存在。
4. 判定歪的類型：機械漂移（1–3）／行為漂移（貼下方憲法即拉回）／
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

## 收尾回報

1. 一句：「建立 X／補 Y／略過 Z（原因）」
2. 一行自檢結果，W4.1／W4.2／W4.3 三種一律明列，不得吞掉。
3. **寫入清單**：逐一列出本次寫入的路徑，末尾聲明「repo 外 0 個檔被寫入、帳號層 0 次存取」。
   有一筆落在 repo 外＝bug，必須明講而不是隱藏。
4. 一句下一步。

不重貼檔案內容（doctor 模式的憲法 6 條除外）。

## 死法

**2026-12-01 前 `skill-usage.py --family` 合計 <5 次 → 退役**，鋪骨架改成一句
`cp -r "${CLAUDE_PLUGIN_ROOT}/templates/." .` 加人工檢查。
或連續 3 次 doctor 全綠無漂移＝標準件已穩定到不需體檢，一樣退役。
