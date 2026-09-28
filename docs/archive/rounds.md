# rounds — 每輪的實作筆記與檢討

一輪一節，新的加在最上面。**耐久知識不留在這裡**：決策進 `../decisions.md`，
A／B 類教訓只留一行指標，落點在別處。這個檔會被反覆追加，不揹任何唯一事實。

---

## R12 — /cc-root 新增、/cc-grill 改成訪談、decisions 去人工（2026-09-29）

範圍：本 session 的 `c7d9705`、`481c726`、`2b49a3a`、`ef8e051`、`8676751`、`952e1d7`（都在 R11 收輪 `4e62d02` 之前
commit，R11 明寫不替它們判教訓，所以另收一節）；帳號層 `~/.claude` `cc30c1b`。全部已 push。
`50a8dcd`、`f45b20f`、`4e62d02` 是別的 session，本節不判。

**做了什麼**（細節在 commit 訊息）
- `/cc-root`：不變量 → 同根症狀 → 問到設計決定 → L0–L3，預設 3 個 `Plan` 提案＋1 紅隊；0.4.4。上限 120，實際 102。
  首跑拿 brag 兩缺口，紀錄在 `../reviews/2026-09-28-cc-root-first-run.md`。
- `/cc-grill` 照 mattpocock `grilling` 改成訪談使用者（決策樹、`AskUserQuestion` 一輪 ≤4 題）。上限 80，實際 58。
  帳號 `CLAUDE.md` 冰山憲法第 1 條加例外。
- `decisions.md` 四處「使用者手動／人工判」改成 LLM 執行；guard-bash 總開關刻意保留在使用者手上。
- 本機四個 repo 的 project scope 卡舊版：`update --scope project` 升到 0.4.4，版控檔零變動（`../decisions.md`）。
- 刪 remote 分支 6 條（PR 已合或已關）、本機 `claude/review-loop-v04` 1 條；remote 存檔那條保留。
- changes 歸檔 0｜PR 合併 0／退回 0｜gate 缺陷 0（直接 commit 到 main，沒派工）。

**教訓升格：A 1／B 0／C 3**

- **A｜多角度對抗時，「拿掉」鏡頭會悄悄變成「換層」。** 落點：`commands/cc-root.md` B 鏡頭「必須以『拿掉 X』開頭」。
- **C｜推薦破壞性指令前沒讀完 `--help`**：只看到 `uninstall --scope`，漏看 `update --scope`，差點拆掉 cloud 靠的 `enabledPlugins`。
- **C｜headless `claude -p` 驗收在 OAuth 過期時只驗得到「載入」**，驗不到子 agent；「slash command 內開 Agent」仍未驗。
- **C｜zsh 不會把 `$B` 拆成多個參數**：`git push --delete $B` 整串當一個 refspec 失敗，改用陣列 `"${B[@]}"`。

---

## R11 — 快閘保證點搬到 CI＋ruleset、W4.3 paths 泛化（2026-09-29）

範圍：本 repo `0717450..` 本收輪 commit（收輪前 8 個，已 push `f45b20f`）。本 session 做的是 `50a8dcd`、`f45b20f`；
`c7d9705`／`481c726`（/cc-root）、`2b49a3a`、`ef8e051`／`8676751`（/cc-grill 訪談化）、`952e1d7` 是別的 session，本節不替它們判教訓。

**做了什麼**（細節在 commit 訊息）
- brag 兩缺口（cloud 上 pre-commit 沒跑、`.gitignore` 排除 `.claude/`）：原修法 → /cc-grill 退回 → /cc-root 3 鏡頭＋紅隊收斂到 K1（L2）。
  `templates/.github/workflows/harness.yml`＋W4.5 ruleset（當輪同意才建）＋cc-dispatch 寫進 BASE 一律走 PR；0.4.5。上限 90 行，實際 +90。
- W4.3 `paths` 從「列舉三種專案檔」改成「依被追蹤檔的頂層目錄檔數取八成」；0.4.6。
- changes 歸檔 0｜PR 合併 0／退回 0｜gate 缺陷 0（直接 commit 到 main，沒派工）。

**教訓升格：A 1／B 0／C 3**

- **A｜PreToolUse 只適合擋指令本身，不適合當狀態閘。** 落點：`../decisions.md` 2026-09-28 快閘那條的否決句。
- **C｜偵測規則用列舉（三種專案檔），名單外的 repo 全部掉到「問使用者」。** 已改成看實際檔案分布；「八成」門檻未驗。
- **C｜ruleset API 形狀、「required check 擋直推」、fork 的 Actions 會不會觸發，都只讀文件未實測。** 翻案條件在 `../decisions.md`。
- **C｜BACKLOG #8 再重現**：模擬 CI 時 `rm -r "$S"` 被擋，繞法是換新目錄名不刪。

---

## R10 — cc-cloud-env 搬進 plugin、cc-cursor 加 --effort（2026-09-28）

範圍：本 repo `cb420e4..` 本收輪 commit（收輪前 2 個 `57c8cf7`、`362dccc`，已 push）；帳號層 `~/.claude` `df6b28a`（已 push）。全是本 session 做的。
本輪沒做 R9 kickoff（真跑驗收迴圈），那份 kickoff 原樣轉進本輪交接單。

**做了什麼**（細節在 commit 訊息）
- 帳號層 `cursor-cloud-env` → `commands/cc-cloud-env.md`，加 Claude 雲端骨架、開頭問平台；0.4.2。上限 160 行，實際 +128。
- `/cc-cursor --effort`：從 `cursor_list_models` 的 variants 挑一行當 `modelParams`；0.4.3。
- 否決「沒指定 effort 就由 agent 依任務自動挑」：說不出防哪個失敗（規矩 2），翻案條件是結果因 effort 不足被退、調高後過，且不只一次。
- changes 歸檔 0｜PR 合併 0／退回 0｜gate 缺陷 0（直接 commit 到 main，沒派工）。

**教訓升格：A 1／B 0／C 2**

- **A｜Cursor 模型參數名依模型而異，`modelParams` 只能從 variants 清單整行抄。** 落點：`commands/cc-cursor.md` 第 1 步。
- **C｜Claude 雲端骨架只讀官方文件、未實測。** 翻案條件在 `../decisions.md` 2026-09-28 那條。
- **C｜本 repo 的 project-scope 安裝蓋過 user scope，`check-plugin-sync.sh` 驗不出來。** 進 BACKLOG #17，不在本輪修。

---

## R9 — review-loop 回到 0.4.0 輕量重做：gate.sh＋驗收節（2026-09-27）

範圍：本 repo `6eb4179..` 本收輪 commit（收輪前 1 個 `93f2b5a`，已 push）。全是本 session 做的。
`6eb4179`（PR #2，cloud 編排 R1）不是本 session 做的，本節不替它判教訓。

**做了什麼**（細節在 `93f2b5a` 訊息）
- `/cc-audit` 判整合分支 `claude/review-loop-v04` 過度工程 → 不合併、留 remote 存檔；PR #6 已關（使用者當輪同意）。
- main 上輕量重做：`tools/gate.sh`＋`test/gate.test.sh`、cc-dispatch「被叫醒時：驗收」、cc-cursor 冪等旗標；0.4.1。
  上限 180 行，實際 +126／−21。
- changes 歸檔 0｜PR 合併 0／退回 0｜gate 缺陷 0（直接 commit 到 main；獨立驗收 2 輪：r1 退 3 條、r2 過）。

**教訓升格：A 1／B 1／C 2**

- **A｜計畫先寫死新增行數上限，超過就停砍。** 落點：`README.md`「規矩」第 4 條。
- **B｜`test/gate.test.sh` 進 `test/run-all.sh`。** 死法寫在 `../decisions.md` 2026-09-27 那條。
- **C｜發包者自己寫的小 diff 也值得 1 位獨立驗收員**：r1 抓到 hook 誤判衝突、合併前工作區必髒、mutation 沒隔離，三條都成立。
- **C｜guard-bash 對 scratchpad 變數 `rm -rf $S` 照擋**，BACKLOG #8 重現一次，繞法是不刪、直接覆寫。

---

## R8 — loop engine R-b：sync 抓 revert、迴路量測、MAX_CONCURRENT（2026-09-24）

範圍：本 repo `37e865f..` 本收輪 commit（收輪前 4 個，已 push `85821d8`）。全是本 session 做的。

**做了什麼**（細節在 commit 訊息，不在這裡重述）
- `loop-rb` 三條：`7533765` sync revert、`54e6705` cc-close ① 迴路量測、`85821d8` 範本派工節＋0.3.6。
- changes 歸檔 1｜PR 合併 0／退回 0｜gate 缺陷 0（loop-rb 無 `runs.md`、`gh` 查無 `loop-rb ` PR：本輪直接 commit 到 main）。
- 本輪首次照新版 ① 記這行；`PR 合併 0` 是本輪自己不走 PR 流的結果，不是派工器沒被用。

**教訓升格：A 0／B 0／C 2**

- **C｜給 agent 讀的程序，驗收分兩層：規則模擬（本輪用 python 照 sync 規則跑實資料＋造例，3 種情境都對）與真跑。**
  只做了第一層；真跑要一個 closed／reverted 的 PR，屬對外動作，留給下一次實際派工。
- **C｜在 main 直接 commit 的 harness 輪次，迴路量測恆為 `PR 合併 0`。** 死法「連續 6 輪 `PR 合併 0`」會被這類輪次誤觸；
  若真觸發，先分辨是「沒派工」還是「沒在用派工器」，再決定砍不砍。

---

## R7 — /cc-dispatch from-plan：老 repo 的計畫檔起草成工單（2026-09-23）

範圍：本 repo `4c18811..` 本收輪 commit（收輪前 2 個）。`fa53d2e`（P3 A/B 作廢）**不是本 session 做的**，本節不替它判教訓。
起因：另一 repo 的 session 回報「有完整 plan 檔（`~/.claude/plans/*.md`）但沒有 `tasks.md`，派不出工」。

**做了什麼**（細節在 `38e0b9a` 訊息，不在這裡重述）
- `commands/cc-dispatch.md` 加 `from-plan <計畫檔>`；任一模式缺 `docs/changes/README.md` 就從範本複製。0.3.5，已 push。
- `changes 歸檔 1`：`dispatch-from-plan` 併進 `SPEC.md`（6 → 8 條 Requirement）。from-plan **未對真實老 repo 實跑**。

**教訓升格：A 0／B 0／C 2**

- **C｜skill 的輸入格式只有鋪過 harness 的 repo 產得出來時，老 repo 會靜默用不了。** 已用 from-plan 補，不另立規則。
- **C｜cloud agent 從 remote 的 main 開分支，本機沒推的 commit 與工單它都看不到。** from-plan 第 4 步已點名；
  **一般派工模式沒檢查本機領先 remote**——候選缺口（BACKLOG 滿載未進，併入 #15 那組缺口時一起處理）。

---

## R6 — spec 層＋loop engine R-a：/cc-cursor、/cc-dispatch v0 實跑（2026-09-23）

範圍：本 repo `43b6ab9..` 本收輪 commit（收輪前 23 個 commit）。**R5 之後到 `470bab5` 那段（spec 層、
guard-bash 0.2.8–0.3.2）沒有單獨收輪**，內容只從 commit 訊息得知，本節不重述，也不替它判教訓。
本 session 做的是 `caae7e2` 之後：升版、3.1 實跑、PR #1 合併、BACKLOG 15、本收輪。全部已 push（使用者當輪授權），
收輪 commit 本身 push 與否見交接單。另一 repo `cursor-api` 的 `bae1988` 也已 push（沒跑收輪，無 `docs/archive/`）。

**做了什麼**（細節在 commit 訊息，不在這裡重述）
- dispatch-v0 工單 3.1 真派一次：agent `bc-1a363a5f…`、129s、exit 0、PR #1；叫醒回報與 `## 驗` 都對，標題多一個「。」。
- `changes 歸檔 2`：`dispatch-v0`、`spec-layer` 併進新建的 `SPEC.md`（6 條 Requirement），搬進 `archive/changes/2026-09-23-*`。

**教訓升格：A 1／B 1／C 3**

- **A｜新增或刪除 command 檔也要 bump。** 本文讀原始 repo，但「有哪幾支」從安裝快取列；`57c1f35` 新增兩支沒升版，
  快取 0.3.2 沒這兩檔、skill 清單也不出現。落點：`README.md`「改了 command 就生效」表格第二列。
- **B｜`tools/check-plugin-sync.sh` 多比 `commands/` 檔名。** 負向測試：多放一個 `zz-probe.md` → FAIL、exit 1。
  死法寫在該檔檔頭：連續 6 輪沒抓到 → 刪掉檔名比對那段。
- **C｜要 agent 逐字照抄的值寫在句號前，agent 會連句號一起抄。** 已改 `commands/cc-dispatch.md` 用反引號包（`341797f`）。
- **C｜`spec_merge.py --apply` 首次建 `SPEC.md` 時拿第一份 change 的 `## Purpose` 當整份的 Purpose。**
  本輪手改成 repo 層一句。候選：首建時改留 `TBD`（BACKLOG 滿載未進，下次有空位再記）。
- **C｜GitHub squash 只有一個 commit 的 PR，merge commit 用那個 commit 的訊息，不用 PR 標題。**
  `cc-dispatch sync` 用 `gh pr list` 比 PR 標題，不受影響。

---

## R5 — P6：常駐載入預算、simple-explain 併入家族（2026-09-04）

範圍：本 repo `a7b46f3..43b6ab9`（4 個 commit，**其中 `75aa6a2` 不是本 session 做的**
——開場快照 HEAD 已經是它，kickoff 卻寫基準 `a7b46f3`）。外加帳號層 `~/.claude` 的
`3803ef3`。**兩邊本輪都 push 了**（使用者當輪兩次明確授權）；`~/.claude` 的 `bd2ac34`
在本 session 進行中已由另一手推掉。

**做了什麼**（細節在 commit 訊息與 `../decisions.md`，不在這裡重述）
- P6：`check_docs.py` 第 7 類常駐載入預算，`test/check-docs-resident.test.sh` 4 項守。
- 上限 4,879 → 6,500：中位數取樣偏了（樣本 4/5 來自沒有 `AGENTS.md` 的 repo）。
- `simple-explain` 併入並改名 `cc-explain`，`ALIASES` 接回計數器（實測 32 次）；
  `eli5.md` 的〈重講協議〉改成一行指標，帳號層那支刪除。

**教訓升格：A 2／B 2／C 1**

- **A｜上限調高只有一種正當理由：分母取錯。超標永遠不是理由。**
  本輪 4,879 → 6,500 是重訂分母，不是放寬。指標：`../decisions.md`
  〈harness 感測與量測〉2026-09-04（P6）兩條；規則本文落在 `check_docs.py` 檔頭。
- **A｜量測之前先問「這批樣本代表誰」。**
  `harness.log` 5 個樣本有 4 個來自本 repo（沒有 `AGENTS.md`），中位數 ×1.1
  因此算出一個涵蓋不了 `AGENTS.md` 的數。指標同上。
- **B（能機器化）｜常駐載入預算已成閘**：`check_docs.py` 第 7 類，
  死法在該檔檔頭與 `../decisions.md`。
- **B（能機器化）｜同一個數字在兩處實作 → 加一道直接比對兩邊輸出的測試**，
  不是各自單測。已做：`test/check-docs-resident.test.sh` 第 4 項比對
  `check_docs.py` 與 `hooks/session-start.sh` 算出的 N，分岔就紅。死法同第 7 類。
- **C（一次性）｜`check_docs.py` 行數上限 250 → 285**。不拆檔的理由是安裝為單檔 `cp`。
  翻案條件（下次先拆檔）寫在 `../decisions.md`。這不是規則，是本輪的具體讓步。

**沒做的**
- **gate 積壓三輪**：`/cc-gate r2-p3`、`r3-p4`、`r4-p5` 都沒跑過，本輪的 `r5-p6` 也沒。
  四道都要新 session，本輪不能自己跑（memory 已記：gate 不能排在同一輪）。
  **不升格成閘**——為「有沒有跑 gate」再加一道 meta 閘是收輪程序在製造工作。
- P3 A/B 判定仍等 2026-09-10（人工閘）。三支扛量 skill 本輪一個字都沒動。
- P2 未做完那三件（`retired-commands/README.md` 改寫、帳號層 `CLAUDE.md` 檔頭
  rules 併入史、強制詞只留帶 because 的）。
- BACKLOG 第 10 條：常駐上限 6,500 的分配假設帳號 `CLAUDE.md` 是 1,500，實際 3,585。

---

## R4 — P5：plugin 化＋測試，兩輪（2026-09-04）

範圍：本 repo `8d9d1dd..a7b46f3`（7 個 commit，末筆是本節所在的收輪 commit），外加帳號層 `~/.claude` 的 `bd2ac34`。
兩邊都沒 push。

**做了什麼**（細節在 commit 訊息與 `../decisions.md`〈plugin 化（P5）〉，不在這裡重述）
- 輪 1：plugin 目錄結構、七類 skill 契約測試、六類文件閘、九份骨架樣板、本機實裝，
  帳號層 `commands/cc-*` 清空、`settings.json` 的 hook 移除。
- 輪 2：`cc-harness.md` 改讀 `templates/`（4,782 → 3,535 字元）、修好 `$ARGUMENTS`
  與死法兩個缺口、加 `check-plugin-loads.sh`、在 `gh-monthly-report` 跑 doctor 驗收。

**教訓升格：A 1／B 2／C 1**

- **A｜閘寫完要餵一份確定該紅的輸入；綠燈本身不是證據。**
  本輪三次踩到同一件事：①`check_docs` 的 BACKLOG 判定 regex 只認 `- x`，
  對表格式 BACKLOG 完全失效，一直報綠卻沒驗；②`check-plugin-loads.sh` 第一版用
  `^  . name@` 比對，`❯` 是多位元組，grep 靜默比不中然後印「沒裝」；
  ③`claude plugin validate --strict` 全綠但 plugin 其實 `failed to load`。
  落點：本條進 `../decisions.md` 已有記錄，規則本文落在 `README.md` 規矩 4 的延伸。
- **B（能機器化）｜plugin 載入狀態要由閘讀，不能靠 validate。**
  已做：`tools/check-plugin-loads.sh` 讀 `claude plugin list` 的 Status，進 `run-all.sh`。
  死法寫在該檔檔頭。
- **B（能機器化）｜skill 契約七類已機器化**，`test/test_skills.py`，死法在檔頭。
- **C（一次性）｜輪 1 對「plugin 快取以 version 為 key」下了沒驗過的結論**，
  輪 2 實測推翻。只看到「快取沒變」就推論「快取是載入來源」——中間少一步。
  這不是規則，是本輪的具體錯誤，記在這裡不升格。

**沒做的**
- `plugin.json` 不吃 `env`，計畫的 subagent 上限做不到 → BACKLOG 6。
- `~/claude-harness/` 孤兒目錄沒刪（repo 外、不可逆）→ BACKLOG 5。
- P3 A/B 的三支 skill 一個字都沒動，2026-09-10 判定。

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
