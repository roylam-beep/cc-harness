# review-loop followups（不擋合併的待修；收尾波次從這裡取）

| 來源 | 一行 |
|---|---|
| PR #3 r1 | `commands/cc-gate.md:18` 說 diff 只能碰 `docs/plans/**`，`:48` 又要寫進 `docs/changes/<slug>/tasks.md`，兩句矛盾（既有，非 1.3 造成） |
| PR #3 r1 | `tools/spec_merge.py` 讀到非 UTF-8 的 `tasks.md` 丟 traceback（rc=1），應退出碼 2 並印一行（既有） |
| PR #3 r1 | `docs/changes/README.md` 的 gate.env 節沒提 `--head` 模式、`KEEP_WT=1`、PR 模式缺 `gh` 退出碼 2（屬 gate-pr.sh 行為，1.2 合併後補） |
| PR #4 r1b | `commands/cc-cursor.md:26` MCP schema 規定 `agentId` 符合 `^bc-[0-9a-f-]{36}$`，只接受小寫。macOS `uuidgen` 產生的是大寫，大寫會卡在 schema 驗證，回的錯誤不是 404／409，不會進冪等流程。建議寫明「小寫 uuid，不符合就在確認前停下來回報」，並在交接提醒 2.2 產生時轉小寫。 |
| PR #4 r1b | `commands/cc-cursor.md:40-43` 帶了 `agentId`、卻遇到 404／409／逾時以外的錯誤（400、401、5xx），或 `cursor_get_agent` 本身逾時，都沒有規則。建議補一句「其他錯誤一律原樣回報，停，不重送」。 |
| PR #4 r1b | `commands/cc-cursor.md:43` 沒帶 `agentId` 時遇到 404，會「原樣回報，停」。但實測 404 時 agent 常常已經建立，這樣會留下一個沒人監看的 agent，使用者重試又多開一個。建議沒帶就由 cc-cursor 自己產生一個小寫 `bc-<uuid>`，每次都走冪等。[需確認] spec 沒要求。 |
| PR #4 r1b | `commands/cc-cursor.md:46,61` 遇到 `agent_busy` 時，第 6 步回報的 run id 是上一輪的；被叫醒時也先回報上一輪那一行，再送排隊的追問。`/cc-review` 可能把上一輪結束誤當成 fix 輪結束，拿舊的 head 跑閘；`/cc-dispatch` 也可能把舊 runId 記進 runs.md。建議兩處回報都標明「上一輪（busy 等待），追問尚未送出」。[需確認] 要等 2.3 寫好才看得出實際影響。 |
| PR #4 r1b | `commands/cc-cursor.md:57`「exit 1 而且 run 還在跑就重新監看」沒有次數上限。看守一直 exit 1 時會無限重接。建議加上限，例如 3 次，超過就照 exit 2 處理。 |
| PR #4 r1b | `commands/cc-cursor.md:33` 寫的是 `cc-review`，沒有斜線，spec 是 `/cc-review`。等 2.3 合併後改回來（PR 已在交接點名）。 |
| PR #4 r1b | `--name` 值的引號只提到半形引號；遇到全形「」、或值裡本身有引號時怎麼辦沒寫。可以跟 BLOCKER 1 一起寫清楚。 |
| PR #4 r1b | tasks.md 1.4 的「驗：」只用 `grep -c` 數字串，沒有驗到任何 Scenario 的行為（這條驗收指令是工單本身的設計，不是這個 PR 造成的）。 |
| PR #4 r1a | 自動測試沒有斷言這 8 條 Scenario 的 THEN。`test/test_skills.py` 只查通用項目（frontmatter、日期、`## 防什麼`、`$ARGUMENTS`）；`grep -c` 只要本文任何地方有這三個字串就綠。mutation 實測：把 `argument-hint` 的三個新參數刪掉，或把 `cursor_get_agent` 從 `allowed-tools` 拿掉，test_skills 仍 exit 0，grep 仍印 7。建議之後加一個輕量的文字契約測試：argument-hint 要含 `--base`／`--name`／`--agent-id`；本文用到的 `cursor_*` 都要列在 allowed-tools；確認行要含「起點分支」。這不擋合併，因為 tasks.md 1.4 指定的「驗：」本來就只有這幾項。 |
| PR #4 r1a | 追問遇到 409 `agent_busy` 時，第 6 步回報的 run id 是上一輪的 `latestRunId`，新追問其實還沒送出。第 6 步沒有規定要註明「追問排隊中」。之後 `/cc-review`（2.3）若拿這個 run id 去記 k+1，簿記可能會錯。建議第 6 步在這種情況多印一行「追問已排隊，未送出」。[需確認] 要看 2.3 怎麼接。 |
| PR #4 r1a | 第 3 步寫「實測：建立常回 404 `Background composer not found`」。MCP 工具 schema 可以佐證 409 `agent_id_conflict` 和 `latestRunId`，但 404 那句本輪無法重現（不可連線花額度）。README 規矩 3 要求欄位語意要實測，請發包者確認有實測紀錄。[需確認] |
| PR #4 r1a | tasks.md 1.4 寫「不要把 MCP 工具名寫進規則句以外的地方」。新文字在步驟裡多處直接寫 `cursor_get_agent`。舊版本文本來就大量使用工具名，spec Scenario 也點名 `cursor_get_agent`，所以不算違規。R3 移植到 `tools/cursor.mjs` 時要一併替換。[需確認] 這句的原意範圍。 |
| PR #4 r1a | 第 3 步只在有 `latestRunId` 時才判定「已建立」；spec 寫的是「存在就當作已建立」。如果 agent 存在但還沒有 `latestRunId`，流程會重送同一個 id，拿到 409 後再查一次，查不到就停。這樣不會多開一個 agent，只是比較保守。可以考慮補一句說明這種情況。 |
| PR #4 r2b | `commands/cc-cursor.md:24` 旗標的值剛好是另一個已知旗標時，照字面會把它收成值，解析就跑偏。重現：呼叫方的 name 變數展開成空字串，送出 `--name  --agent-id bc-<uuid> 你在 owner/repo …`。參考解析器的結果是 name=`--agent-id`，內容第一個 token 變成 `bc-<uuid>`，於是誤判成**追問模式**。在發包流程裡不會問使用者，直接對一個還沒建立的 agent 呼叫 `cursor_create_run`，第 4 步也沒寫這種錯誤要怎麼處理。建議改成：值是六個已知旗標之一就當缺值，停下回報「旗標缺值：<名稱>」。 |
| PR #4 r2b | `commands/cc-cursor.md:36` 追問模式開頭如果帶了 `--base`、`--no-pr`、`--model`、`--repo`，現在都靜默丟掉（重現：`--base claude/x --no-pr bc-<uuid> 追問` → 追問模式，兩個旗標都沒作用，也沒回報）。本文只寫了 `--base`「不帶 startingRef」，其他三個沒寫。建議二選一寫死：只建立時才有效的旗標出現在追問模式就停下回報，或是在確認行標明「已忽略」。 |
| PR #4 r2b | `commands/cc-cursor.md:3` 的 `argument-hint` 追問形式寫的是 `<bc-agentId> <追問>`，但本文第 36 行允許開頭先帶 `--name`（當 label）和 `--agent-id`。建議改成 `[--name <文字>] <bc-agentId> <追問>`，讓 hint 和本文一致。 |
| PR #4 r2b | 內容是空的時候沒有規則。`--agent-id bc-<uuid>` 後面什麼都沒有，會走建立、prompt 是空的；只有 `bc-<uuid>` 時，會送一個空的追問。建議內容空白就停下回報，不建立、不追問。 |
| PR #4 r2b | `commands/cc-cursor.md:38-42` 跳過確認的第 3 個條件是「同一個 session 看得到使用者對那一波的同意回覆」。`/cc-review` 的 fix 迴圈如果在另一個 session 跑，或 context 壓縮後看不到原文，每次追問都會問使用者。這個方向是安全的，但和 spec「一波只問一次」那條的「之後的追問（/cc-review 的 fix 迴圈）不再問」有落差。[需確認] 等 2.3 定案後再決定：`/cc-review` 是要自己取得使用者同意，還是由 spec 放寬。 |
| PR #4 r2b | `commands/cc-cursor.md:69` 追問在 `agent_busy` 時會排隊，被叫醒後才把它送出。本文沒寫這時要不要再問一次。第 2 步寫的是「追問同樣要問」，照字面執行的 agent 可能會重問。建議明寫：排隊的追問在第 2 步已經問過，送出時不再問。 |
| PR #4 r2b | 全形引號不會當成引號處理：`--name 「review-loop 2.2」 你在 repo` 的結果是 name=`「review-loop`，prompt 從 `2.2」` 開始，而且沒有回報。本文只寫了半形引號，所以不算違規；但使用者直接打的時候很容易發生。建議遇到全形引號開頭的值就停下提示。（第 1 輪已提過，這輪仍未處理。） |
| PR #4 r2b | `--` 後面的內容開頭如果是 `bc-`，仍然會變成追問模式（`-- bc-<uuid> 本意是 prompt` → 追問）。本文照字面讀是一致的，但 `--` 沒辦法強制走建立。影響很小，要不要寫一句說明可以之後再定。 |
| PR #4 r2b | 第 1 輪還沒處理的 FOLLOWUP 仍然有效：大寫 uuid 會過不了 schema；被叫醒時 exit 1 又重新看守沒有次數上限；第 6 步在 busy 時回報的是上一輪的 run id；自動化測試沒有斷言任何一條 Scenario 的 THEN。 |
| PR #4 r2a | [需確認] `commands/cc-cursor.md:41` 要求「同一個 session 看得到使用者同意」。如果 `/cc-review` 的 fix 迴圈在另一個 session 跑（例如交接之後），每次追問都會被問，和 spec「一波只問一次」裡「之後的追問（/cc-review 的 fix 迴圈）不再問」有落差。這是第 1 輪刻意選的保守做法，要嘛在 2.3 或 spec 寫明「跨 session 會再問一次」，要嘛定一個能驗證的同意紀錄（例如 runs.md 的欄位）。 |
| PR #4 r2a | MCP `cursor_create_agent` 的 `agentId` pattern 是 `^bc-[0-9a-f-]{36}$`（只收小寫）。`cc-cursor.md:32` 只寫「`bc-` 接 uuid」；macOS `uuidgen` 產出的是大寫，2.2 產生 id 時要轉小寫。建議在 32 行補「小寫」。 |
| PR #4 r2a | 追問模式遇到 `--base`／`--repo`／`--model`／`--no-pr` 時，是忽略還是停下沒寫（36 行只寫了不帶 `startingRef`）；35 行「repo 不在 list 就停」在追問模式要不要做也沒寫。 |
| PR #4 r2a | 「引號沒成對也停下回報」放在吃值旗標那一條底下，語意應該只查旗標值；建議明寫「內容裡的引號不檢查」，免得 prompt 有 `don't` 這種單引號被誤擋。 |
| PR #4 r2a | 測試缺口（既有，非本 PR 造成）：`test/test_skills.py` 與 `tools/check_docs.py` 都不擋 `/Users/<帳號>` 路徑（mutation 塞進去兩者都綠）；本 PR 的 8 個 Scenario 都是本文規則，沒有可執行測試能斷言（task 的「驗：」本來就只要求 test_skills＋grep）。 |
| PR #3 r2b | 測試缺口：「空值時只看**更深一層**子項」沒有會紅的案例。把 `tools/spec_merge.py` 的 `nested_has_backtick_path` 裡 `if ind <= parent_indent: break` 改成永不 break，27 項照樣全綠。建議在 `test/spec_merge.test.py` 的 test_27 `bad` 補一條：`  - 所有權：` 後面接同層的 `  - \`src/x.py\``，斷言這條 task 缺所有權。實作本身是對的，對抗案例實跑是紅。 |
| PR #3 r2b | 測試缺口：「更深一層子項要是 `- ` 開頭」沒有會紅的案例。把 `re.match(r"^-\s+", content) and` 拿掉，27 項照樣全綠。建議補：`  - 所有權：` 後面接 `    \`src/x.py\``（段落，不是 `- `），斷言紅。實作實跑是紅。 |
| PR #3 r2b | 測試註解跟 fixture 對不上：test_26 註解寫「未縮排的『所有權：』…不算」，但 fixture L4 是 `所有權：\`src/c.py\``，沒有 `- `，本來就不符合 OWN_SUB，驗不到縮排要求。把 `if not line[:1].isspace(): continue` 改成 `if False:`，27 項照樣全綠。建議改成 col 0 的 `- 所有權：\`src/c.py\``，才驗得到「子行要縮排」。 |
| PR #3 r2b | [需確認] 1.1（PR #5）與 1.3 在文字層已經對齊：第 1 輪 B 的 followup 已處理。tasks.md 1.1 現在寫「task 行上的 `｜所有權：`」「任何 `#` 開頭的標題」，README 也從 `##` 改成「標題」。但**實作層**還有 6 處邊界不一致，實跑對照見下方「實跑」第 6 項。兩邊都不會靜默出錯：不是 check 紅，就是 `WAIT 缺所有權`，但會兩邊打架。建議在 PR #5 修，或抽成共用函式： |
| PR #3 r2b | (a) PR #5 遇到 col 0 的非空行就結束區塊，1.3 不會。spec 寫的是「到下一條 task 或任何 `#` 開頭的標題為止」，比較接近 1.3 的做法。 |
| PR #3 r2b | (b) PR #5 的 `is_heading` 是 `lstrip().startswith("#")`，所以 `#tag` 和縮排的 `  # 註解` 都會切斷區塊；1.3 只認 col 0 的 `#{1,6}\s`。 |
| PR #3 r2b | (c) tab 寬度：PR #5 算 1、1.3 算 4。`\t- 所有權：` 後面接兩個空白的 `  - \`a\``，1.3 判紅、PR #5 認得 `a`。 |
| PR #3 r2b | (d) PR #5 只取**第一個**所有權子行，後面的就不看了。`- 所有權：無` 後面再一行 `- 所有權：\`a\``，1.3 判綠、PR #5 判缺。 |
| PR #3 r2b | (e) task 行上有 `｜所有權：\`a\``，底下又有 `- 所有權：無`：1.3 判綠，PR #5 判缺。 |
| PR #3 r2b | (f) task 行上 `｜所有權：` 留空，底下子行是 `- 依賴：\`1.2\``：1.3 當成所有權判綠，PR #5 排除依賴行後判缺。 |
| PR #3 r2b | [需確認] task 行上 `｜所有權：` 留空時，1.3 會把區塊裡**任何** `- ` 子項的反引號都當所有權。例如 `  - PR 標題：\`y\`` 就算數，判綠。這合 spec 字面（「看它更深一層 `- ` 子項」），但語意上太寬。建議 spec 明訂：留空的巢狀寫法只給 `- 所有權：` 子行用，task 行上的 `｜所有權：` 不能留空。 |
| PR #3 r2b | code fence 沒有特別處理。兩種情況： |
| PR #3 r2b | col 0 的 fence 裡有 `# 註解`，會被當成標題切斷區塊，後面的 `- 所有權：` 就不算。這是假紅。 |
| PR #3 r2b | 縮排 fence 裡的 `- 所有權：\`a\`` 會算數。這是假綠。 README 只警告 fence 裡不要放 `- [`。建議 README 補一句「task 區塊內不要放 code fence」，或讓 check 跳過 fence 內容。 |
| PR #3 r2b | 看到 BOM（`﻿`）開頭時，check 仍判綠，這條不影響。只是記錄：`read()` 沒去掉 BOM。如果第一行就是 task，TASK_OK 會對不上（原本就有，不是這個 PR 引入的）。 |
| PR #3 r2a | `test/spec_merge.test.py` test_27 的 `bad` fixture 缺一個案例：`  - 所有權：` 空值，後面接同層的兄弟子行，而且兄弟子行帶反引號路徑（例如 `  - 契約：\`src/a.py\``），這種要紅。實測把 `nested_has_backtick_path` 的 `if ind <= parent_indent: break` 拿掉（M8），27 項仍全綠，所以 spec 裡「更深一層」這個限制目前沒有測試守著。現在的實作行為正確（探測結果是紅），只是缺案例。 |
| PR #3 r2a | `test/spec_merge.test.py` test_26 `1.9 標記沒縮排` 的 fixture 是 `所有權：\`src/c.py\``，前面沒有 `- `。`OWN_SUB` 本來就不會匹配它，所以這個案例沒有驗到 `ownership_found` 裡 `if not line[:1].isspace(): continue` 那道縮排檢查。拿掉那道檢查（M9），27 項仍綠。建議改成 `- 所有權：\`src/c.py\``（沒縮排、有 dash），才真的測得到。1.1 只收縮排行，這道檢查拿掉，兩邊就會走針。 |
| PR #3 r2a | [需確認] task 行上的 `｜所有權：` 如果是空值（`｜所有權： ｜驗：…`），底下任何一個帶反引號的 `- ` 子行都會被當成所有權，例如 `  - 契約：\`a.py\`` 就算。照 spec 字面這樣是對的，1.1 的契約也一樣收，但語意很怪：dispatch_state 會把契約裡提到的檔當成所有權。建議行內空值只認 `- \`路徑\`` 這種純路徑子項，或在 README 註明行內不要留空值。 |
| PR #3 r2a | 延續第 1 輪 B 視角第 4 條：code fence 裡頂格的 `# comment` 還是會被當成標題，把區塊切斷，後面的所有權就不算（探測結果：誤紅）。README 只提醒 fence 裡不要放 `- [`，沒提 `#`。可以補一句「fence 內不要有頂格 `#` 行」，或讓解析跳過 fence。 |
| PR #3 r2a | [需確認] `commands/cc-gate.md`：缺陷如果不落在單一檔（例如流程或跨檔的問題），格式沒說 `所有權：` 要填什麼。填不出來，寫回的 commit 就會被 pre-commit 擋下。建議寫一句退路，例如填最相關的檔或 `docs/changes/<slug>/tasks.md`。 |
| PR #3 r2a | 既有問題，不是本 PR 造成的：`commands/cc-gate.md:18` 寫「diff 只能碰 `docs/plans/**`」，跟寫回 `docs/changes/<slug>/tasks.md` 矛盾（第 1 輪 A 的 FOLLOWUP 2）。 |
| PR #5 r1b | [需確認] `load_runs` 會收進檔案裡所有 `／` 開頭的行，而且不認表頭；`render_runs` 則整檔重寫。實測：runs.md 前面有 `# runs` 和說明文字、後面有另一張表時，upsert 之後標題與說明整段消失，另一張表的 `／ 項 ／ 值 ／`、`／ foo ／ bar ／` 被補成 6 欄的假列。表頭欄位順序不同（例：`／ task ／ 狀態 ／ PR ／ agentId ／ runId ／ 備註 ／`）時，照位置對欄，`running` 被當成 agentId，`next` 對真的在跑的 1.1 印 `READY`。現有檔（本 repo、SetupHK）都是純表格、表頭跟 cc-dispatch.md 一樣，所以目前不會觸發。建議只解析第一張「表頭剛好是這 6 欄」的表：欄位順序不同就照欄名對應，不然退出碼 2；表格以外的行 byte 不動。 |
| PR #5 r1b | runs.md 裡同一個 task 有兩列時：`upsert-run` 改的是第一列（`find_row`），`next` 讀的是最後一列（dict 後寫的蓋前面）。實測 upsert 成 `finished #9` 後，`next` 仍印 `SKIP 1.1 running`。建議遇到重複列就退出碼 2，或規定只認同一列。 |
| PR #5 r1b | 儲存格裡手寫的 `\／` 會被拆成兩格，超過 6 欄的部分被丟掉（實測 `a \／ b` 變成 `a \`）。工具自己寫入時會把 `／` 換成 `／`，所以只有手改過的檔會中。 |
| PR #5 r1b | CRLF 的 tasks.md 跑完 sync 會整檔變成 LF：實測 321 行 CRLF 全部轉掉，不只改目標行。`apply_marks` 裡處理 `\r\n` 的那段其實跑不到，因為 `read_text` 用了預設的換行轉換。`open(..., newline="")` 讀寫就能保住。沒有結尾換行的檔跑完仍然沒有，正常。 |
| PR #5 r1b | [需確認] 所有權重疊有兩個盲點，SetupHK 的真實資料都有用到： |
| PR #5 r1b | 結尾是 `/` 的目錄寫法（SetupHK 1.13 的 `src/components/shared/`）跟它底下的檔案不算重疊。 |
| PR #5 r1b | 大括號 glob（SetupHK 6.2–6.4 的 `src/components/{companies,contacts,shared}/**`）不會展開，跟 `src/components/companies/X.jsx` 不算重疊。 |
| PR #5 r1b | 另外兩邊都是 glob 時（`a/b/**` vs `a/*/c`）也判不出重疊。 |
| PR #5 r1b | tasks.md 的規則只寫了 `**` 和 fnmatch，實作沒有違反規則，但下游的真實寫法會被漏判。建議把 `a/` 當成 `a/**`、先展開 `{}`，並在 spec／tasks 註明。 |
| PR #5 r1b | `依賴：` 的值認不得時，一律當成「無」：空值和 `依賴：待定` 實測都印 `READY`。建議值不是 `無`、也抓不到任何 N.M 時，改成 `WAIT N.M 依賴格式不明`。 |
| PR #5 r1b | task 行上的 `｜所有權：` 如果空白，會把整個區塊所有子項的反引號都收進所有權，連 `PR 標題：`d 1.4: x``、`契約：`spec.md`` 也算。1.3 的 `spec_merge check` 合併後，要確認兩邊對這種寫法的判定一致。 |
| PR #5 r1b | `fetch_base` 失敗時沒有任何提示：origin URL 壞掉時，`stale` 照樣用舊的 `origin/<BASE>` 印 `STALE 無`，sync 也可能漏掉剛推上去的 revert commit。建議至少印一行警告。 |
| PR #5 r1b | [需確認] `merge_pr.sh` 的合併 subject 是 `Merge PR #n: <標題>`。直接 `git revert -m1 <merge>` 產生的 subject 會是 `Revert "Merge PR #7: review-loop 1.2: …"`，不符合 `^Revert "<slug> N.M:`，所以認不到。目前只有用 GitHub「Revert」按鈕開出來的 PR 標題抓得到。要不要一起認，要在 spec 決定。 |
| PR #5 r1b | 寫檔失敗時（例：目錄唯讀）印出 Python traceback、退出碼 1，跟 `sync --check` 的「有待改」同一個碼。建議抓 `OSError`，印一行後退出碼 2。另外 `mkstemp` 建的檔權限是 0600，runs.md 被 upsert 後會從 0644 變成 0600（git 不追蹤這個權限位元，影響小）。 |
| PR #5 r1b | `gh pr list --limit 200`：BASE 上已合併的 PR 超過 200 個時，舊的會被截掉。`mergedAt` 解析不了的已合併 PR 也會直接被略過，不會有任何提示。 |
| PR #5 r1b | [需確認] schema 序列化只把 `running` 算成在飛。已經 `finished`、PR 還沒合併的 migration，擋不住另一條 schema task 變成 READY；`queued` 也不佔所有權。是否符合「同一時間最多一條」的原意，要確認。 |
| PR #5 r1a | `upsert-run`／`sync` 寫 runs.md 時整份重畫（`render_runs`），表格外的標題、說明、尾註會被默默刪掉（實測 `# runs`／說明段落／尾註都消失）。目前兩份實際的 runs.md 都只有表格，所以不擋；建議保留表格前後的原文，或在 README 寫明 runs.md 只能有表格。 |
| PR #5 r1a | 空的 `- 依賴：`（冒號後什麼都沒寫）被當成 `依賴：無`（`parse_dep_value` 回空清單），會跳過波次規則直接 `READY`；`依賴：見 1.1` 也會被當成依賴 1.1。建議空值當成沒寫（走波次），不是 `N.M`／`無` 的值就印 `WAIT N.M 依賴格式錯`。 |
| PR #5 r1a | `merge_pr.sh` 固定用 `--subject "Merge PR #<n>: <PR 標題>"`。用 `git revert -m1 <merge>` 反轉那個 merge commit，subject 會變成 `Revert "Merge PR #7: review-loop 1.2: …"`，對不上 `Revert "<slug> N.M:`。spec 只要求後者，所以不擋；要不要一起認 [需確認]。 |
| PR #5 r1a | 錯誤訊息（`用法錯：…`、`狀態非法：…`）印在 stdout，行首不是約定的六個字。2.x 如果逐行解析 stdout，可能被干擾。建議錯誤改印 stderr，「無法對帳」照 spec 留在 stdout。 |
| PR #5 r1a | `gh pr list --limit 200`：一個 change 的 merged 或 closed PR 超過 200 條會少算。目前規模碰不到。 |
| PR #5 r1a | `is_heading` 把縮排的 `#` 開頭行也當標題（PR #3 只認第 0 欄的 `#{1,6}\s`），例如子項裡的 `  #註` 會切斷區塊。建議跟 BLOCKER 1 一起對齊。 |
| PR #5 r1a | `next --base` 有收這個參數但沒用到，可以拿掉，或在檔頭註明只是為了介面一致。 |
