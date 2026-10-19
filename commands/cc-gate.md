---
description: 獨立驗收 gate。git push 被 guard-bash 擋下（要推的 commit 動到程式檔、HEAD 沒有 gate 紀錄）時，自己派子 agent 照本支驗（只回報、缺陷當場修，最多兩輪）；另可新 session 手動跑。不准改被測程式。EN: acceptance gate, verify before push, independent review
argument-hint: "[可選：輪次代號，如 R4；或聚焦範圍，如「只驗寫入閘」]"
allowed-tools: Bash, Read, Glob, Grep, Write, Edit
---

對**一輪 session 的產出**跑獨立驗收。$ARGUMENTS

價值全來自「跑的人不是寫的人」——寫的人帶著寫錯時的同一組假設，自己驗不出「跑得動但語意錯」。

**跑的必須是乾淨 context。** 兩種都算：使用者在新 session 打 `/cc-gate`；或 push 被擋時用 Agent 工具
派子 agent 照本檔跑（子 agent 只看得到派工 prompt，看不到寫程式那段對話）。本 session 就是寫那輪的 session、
又不是被派來的子 agent：不要自己驗，改派一個子 agent（`model` 預設 `"opus"`；有 `docs/changes/<slug>/gate.env` 的 `REVIEWER_MODEL=` 就用它，否則環境變數 `CC_REVIEWER_MODEL`），prompt 只給本檔路徑、輪次代號、
要驗的檔案路徑，**不轉述這輪經過**——轉述就把寫的人的假設帶過去了。

## 約束

1. **只作用於當前 repo。** 一輪動了兩個 repo 就跑兩次（典型：專案＋帳號層 `~/.claude`），
   兩份判定各自獨立。任一份沒跑，整輪不得判 pass，收尾必須明列「本次只驗 X，Y 未驗」。
2. **不改被測物。** 不動實作、測試、CI、harness。**diff 只能碰輸出契約指定的那一個檔**
   （`docs/changes/<slug>/tasks.md`，或 `docs/plans/**`；都沒鋪才退回 `IMPLEMENTATION_PLAN.md`）。交接單、`BACKLOG.md`、`AGENTS.md`、
   `CLAUDE.md`、`docs/decisions.md`、`.claude/rules/**` 一律不寫——這是角色分工不是權限，
   gate 去寫會和收輪互鎖。想加的規則寫成「規則候選」留在計畫檔，由收輪 reconcile。
   想動手修就是搞錯角色：缺陷寫進下一輪 prompt，由下一輪修。
3. **實跑，不信宣稱。** 上一輪說跑過的檢查自己實跑一次，看報告不算驗收。每條缺陷附
   「怎麼重現」與「錯在哪個 `檔案:行號`」，不確定標 `[需確認]`。同一檢查最多跑兩次，
   第二次仍失敗即記 blocked，不繞路。
4. **缺陷與範圍外發現分開。** 缺陷（上一輪該做對而沒做對）進計畫檔下一輪 kickoff 的最前面；
   範圍外發現寫在計畫檔的 `## 範圍外` 節，由收輪第②步收進 `BACKLOG.md`。混在一起等於把缺陷埋了。

## 驗什麼

有 `docs/changes/<slug>/` 就以它為準：`spec.md` 逐 Scenario 打勾打叉、`tasks.md` 逐條實跑 `驗：` 後面那句；
沒有才讀交接單裡上一輪的**完成定義**（都沒有就先寫下你認定的那份，並在結論標明是你補的）。
另外對照**宣稱跑過的檢查**，逐條附實際輸出。上上輪 gate 留下的缺陷，
逐條重跑原始重現步驟，確認是真的修好、不是換個地方壞。

自動化抓的是「跑不動」。**gate 只報「跑得動但結果錯」那一類**，而且有界（與 `/cc-dispatch` 驗收員同一套界線）：
- **只驗列出來的**：上面那份 Scenario／`驗：`／完成定義逐條驗，不去找清單外的路；「任何輸入都成立」這類全稱性質不當缺陷。
- **只報會發生的**：反例要是本 repo 的工具會產生、或外部呼叫者觸發得了；只有自家程式回傳壞資料才會發生的，記在計畫檔 `## 非阻擋`。
- 在清單內挑最會靜默出錯的地方看：送出去的欄位名、留空的選填參數、新旗標有沒有真的改變行為、錯誤路徑回什麼。

## push 前（hook 擋，不靠記得）

`hooks/guard-bash.mjs` 第十類：`git push` 時，要推的 commit（`@{u}..HEAD`；沒 upstream 退回 `origin/HEAD` 指的預設分支，再退回 `origin/main`、`origin/master`）
動到程式檔（副檔名不是 `.md`／`.mdx`／`.txt`，暫存與 memory 不算；`CC_DOC_EXTS`／`CC_NONCODE_PATHS` 可追加，見 `hooks/code-path.mjs`），而且 HEAD 在 `.git/harness-gate` 沒有紀錄，就擋下。被擋時：
- **派法**：Agent 工具、`model` 用擋下訊息 hint 寫的那個（`CC_REVIEWER_MODEL`，沒設＝`"opus"`）。prompt 第一句寫「你是 push 前的 gate 子 agent，只回報、不寫檔」，
  接著給本檔路徑（`ls "${CLAUDE_PLUGIN_ROOT}/commands/cc-gate.md"`）、**使用者這次要求的原文**、`git diff --name-only @{u}..HEAD` 的檔案清單；不轉述做法。
- **驗什麼**：有 `docs/changes/<slug>/` 照上面〈驗什麼〉；沒有就拿使用者要求原文當完成定義，一樣有界。
- **輸出**：**不寫檔、不 commit**（下面〈輸出契約〉不適用），回傳判定一行＋缺陷清單（每條附重現與 `檔案:行號`）。
- **之後**：缺陷當場修，修完再派一次；第二次仍有缺陷就停，原樣回報給使用者、**不推**。判定 passes 才寫紀錄再重推：
  `echo "$(git rev-parse HEAD) pass" >> "$(git rev-parse --git-path harness-gate)"`。
  使用者**當輪明說**跳過 gate，才把 `pass` 換成 `skip`；`skip` 只對寫下當時的 HEAD 有效，`pass` 之後只多文件 commit 仍算過。
  commit 和 push 分成兩個指令下，hook 看的是下指令當下的 HEAD。回報一定帶一行「gate：<判定>」。

## 輸出契約

新 session 手動跑的才走這節。判定三選一，**逐字寫在 commit 訊息第一行**：

- `R<N> gate: passes with nothing to fix`
- `R<N> gate: <一句話講最嚴重那條缺陷>`
- `R<N> gate: blocked on <什麼>`

寫回落點：有 `docs/changes/<slug>/` 就寫進它的 `tasks.md` 最前面，新開一組
`## 0. 上一輪 gate 缺陷`（每條缺陷一個未勾 `- [ ] 0.N … ｜驗：<重現方式>`，規則候選行放在該組底下）；
沒有才落在 `docs/plans/**`。兩種落點都是同一份檔裡三件事：

1. 缺陷逐條寫進下一輪待辦，**排在該輪主體之前**，註明「上一輪 gate 發現」與重現方式；
   可能造成靜默錯誤資料的排最前面。
2. 開一節 `## 下一輪 kickoff 第一件事（gate 草稿，待收輪併入交接單）`，內容就是那段文字。
   收輪第③步會把它抄進 kickoff prompt——gate 不直接改交接單。
3. 會重犯的錯寫成規則候選，格式逐字：
   `規則候選：<一句規則>｜出處：<檔案:行號 或 commit>｜建議落點：<.claude/rules/xxx.md、docs/decisions.md 或 AGENTS.md>`
   優先建議 path-scoped 規則檔，不要往常駐契約塞。落點與措辭由收輪的 A／B／C 判定決定。

commit 時只 stage 那一個檔（`docs/changes/<slug>/tasks.md` 或 `docs/plans/**`）。

## 怎麼驗

回報帶這幾項，不重貼整份缺陷清單：判定、缺陷條數與最嚴重那條、實際跑過哪些檢查／哪些沒跑、
本次驗了哪個 repo／另一個驗了沒、留下幾條規則候選。

## 防什麼

寫的人帶著寫錯時的同一組假設自己驗收，「跑得動但語意錯」漏過去。
