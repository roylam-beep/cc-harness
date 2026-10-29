# rr-dispatcher decisions — 派工與合併

從 cc-harness 的 `docs/decisions.md` 原樣搬來（2026-10-29），之後派工相關的拍板記在這裡。
寫法同 cc-harness：只記「現在是什麼」與「什麼情況會翻案」。

- **2026-10-16**｜**pstack（poteto）Pt.1＋2 對照後只收一件：UI repo 把現成的 e2e／smoke 接成 `gate.env` 的 `GATE_n`**，不自建驗證工具。
  證據：`ads-cr-system` 已有 `npm run gate:smoke`，但它的 UI 工單 `google-login` 的 `gate.env` 只跑 `npm run verify`。
  不收（`/cc-audit` 判定、使用者定案）：自建 `verify.mjs` CLI 和它的產生器指令（閘只看退出碼，驗收員不開瀏覽器，沒有呼叫者）、
  features 地圖（程式的第二份抄本，沒有保養機制）、doctor 加「缺驗證工具」檢查（`[驗法弱]` 已經在報）、`/cc-dispatch` 擂台模式、
  `/cc-root` 加介面草圖第六行和「同一種繞路／`any`」兩個訊號（前者用不到，後者跟第 2 步重複或只限 TS）。
  `/cc-root` 紅隊**維持 Claude 家族**，不換 codex。
  **翻案條件**：某個 UI repo 連兩張工單標 `[驗法弱]`，而且沒有現成的 e2e 可接 → 重議 CLI；紅隊漏抓一個換家族才抓得到的問題 → 重議 codex。

- **2026-10-16**｜**`/cc-dispatch` 同時上限固定 8**（Cursor 與 Claude 執行者同一個），不再讀 `docs/changes/README.md` 的 `MAX_CONCURRENT*`。
  使用者定案「併行太少」→「上限是 8，不是下限」。原因：老 repo 的範本複本寫死 `MAX_CONCURRENT=3`
  （`6.website/GH`、`jev-ads`、`ads-cr-system`、`gsc-gmc-hero-mcp`），Claude 執行者預設也是 3；固定在 skill 端，不必去改別的 repo 的複本。
  同日先做成下限 max(n, 8)（37b5e6a），使用者更正。2026-10-03 那條「sub-agent 並行撞速率限制」的翻案條件照舊：撞到 429 就回來重議。
  工單 `docs/archive/changes/2026-10-16-dispatch-concurrency-cap`。
- **2026-09-25**｜dispatch-v0「不做自動合併」放寬為「只准合進整合分支，`main` 由 LLM 合、合之前問使用者當輪確認」（`commands/cc-dispatch.md:87`）。
  理由：SetupHK system-completion 21 個 PR 的實績，與後期發包者自己動手修、跳過驗收的失敗。
  **翻案條件**：合進整合分支後出現未被閘擋下的紅燈。
- **2026-09-27**｜review-loop 只收**驗收規則**（閘＋1 位對抗型驗收員＋退回同一個 agent＋發包者不修），不收簿記機器。
  教訓：第 1 波首輪 0/5 過、15 條 BLOCKER 零推翻；mutation 抓出 3 處假綠；第 2 輪以後產出低，3 輪不過就停。
  整合分支 `claude/review-loop-v04`（+2,534 行，含 `dispatch_state.py` 1,027 行）不合併、留 remote 存檔：它擋下的多是自己造成的
  （同一個判定寫兩份就會走針），plugin 0.4.0 才 2,867 行。**翻案條件**：手寫 `runs.md` 連續出錯到誤派或誤合。
  **死法**：連續 3 個歸檔的 change 沒有 `reviews/` → 刪 `tools/gate.sh`、`test/gate.test.sh` 與 cc-dispatch 驗收節。
  連帶：`/cc-cursor` 旗標只認開頭，0.4.0 寫在 prompt 後面的旗標會變成內容。
  **2026-10-04 補**：remote 分支 `claude/review-loop-v04` 與本機 tag 已依使用者指示刪除，tip `66181c1` 不再有任何 ref 指著（救不回）。
- **2026-09-28**｜**快閘的保證點從 `.git/hooks` 搬到 CI＋ruleset**（`/cc-root` 兩次獨立跑都收斂到這個 L2，紀錄見
  `docs/reviews/2026-09-28-cc-root-first-run.md`）。`.git/hooks` 不隨 clone 走，cloud／Cursor／`gh pr merge` 都繞得過；
  本機 pre-commit 留著只當提早回饋。連帶：`/cc-dispatch` 寫進 BASE 一律走 PR。ruleset 的 API 形狀與
  「required check 會擋直推」**只讀官方文件、未實測**，第一次在 brag 建完就是實測。
  **翻案條件**：實測直推沒被擋、或 fork 的 Actions 不觸發 → 先修 W4.5 再推到別的 repo。
  否決「在 `guard-bash.mjs` 攔 `git commit` 跑快閘」：PreToolUse 在整串指令執行**前**判，`git add -f X && git commit`
  會拿加入前的狀態判紅；它也管不到 Cursor 的 commit 與 `gh pr merge`。PreToolUse 只適合擋指令本身，不適合當狀態閘。

- **2026-10-18**｜**`/cc-cloud-env` 刪除**，使用者定案；plugin 內不再有產雲端環境 prompt 的 skill。
  它 2026-09-28 從帳號層 `cursor-cloud-env` 搬進來，兩份骨架（Cursor／Claude）從沒真派過。本文在刪除 commit 的上一版。
  **翻案條件**：又需要替 repo 產 Cursor／Claude 雲端環境 prompt，且同一件事手寫超過兩次 → 從 git 歷史撈回再改。

- **2026-10-01**｜`/cc-dispatch`、`/cc-cursor` **使用者下指令就是同意，不再問**（含 Cursor 花費）；派工指令涵蓋全部波次；新工單預設整合分支 `claude/<slug>`，波內合併不問、
  一波全合就自動派下一波；只在停止條件成立或整合分支合進 `main` 前停下問。拿掉「一波一個 session」。
  理由：模擬（`docs/reviews/2026-10-01-dispatch-sim.md` F2）4 條 task 照舊規則要停 7 次，停點數隨 task 數線性長，長任務放不了手。
  安全面不變：`main` 仍經 PR＋當輪確認，驗收規則、3 輪上限、發包者不修都沒動。
  **翻案條件**：自動推進後出現誤派（派了不該派的波）或整合分支累積出閘沒擋下的紅燈。

- **2026-10-02**｜**同一波不准有讀寫依賴**；Requirement 本文每個子句都要對到 Scenario；測試不准用 skip 遮依賴。
  理由：`docs/reviews/2026-10-01-dispatch-sim.md` F1（全閘綠但香港沒進頁面）。BLOCKER 判準見下面 2026-10-16 有界那條。

- **2026-10-03**｜**派工執行者可換成 Claude**：經原語 `/cc-claude`（背景 sub-agent）；`EXECUTOR_MODEL` 帶給任一原語，Claude 沒寫用 Sonnet。
  驗收員一律 Opus（寫 Sonnet、驗 Opus，補回同家模型的對抗性）。
  Claude 執行者沒有冪等鍵：先寫 `runs.md` 再開，接手時查 PR／`exec/<slug>-N.M` 分支，有就續、都沒有才重派。`gh` 不能用（雲端 token 無效）整條改走 GitHub MCP。
  實測（雲端 container）：推到 session 指定以外的新分支**成功**；`git push --delete` 被遠端中斷、**刪不掉**，MCP 也沒有刪分支工具——雲端路徑不依賴刪分支。
  `Agent` 的 `model` 別名對應版本**只讀工具說明、未實測**。工單 `docs/archive/changes/2026-10-03-dispatch-claude-executor/`。
  **翻案條件**：Claude 執行者首輪 fix-needed 比例明顯高於 Cursor（模擬時 2/4 對 0/4）、sub-agent 並行撞速率限制（429）。
- **2026-10-04**｜**`/cc-claude` 拿掉 session 模式，只留背景 sub-agent**；`EXECUTOR` 改成 `cursor`／`claude` 二選一（取代上一條的 `agent`／`session`）。
  理由：`/cc-audit` 判 yagni——session 模式零次真派、本機沒有 `mcp__claude-code-remote__*`，卻讓 `/cc-dispatch` 多出接回輪詢等分支。
  同輪：`sync` 有 PR 號的 task 改用 `gh pr view` 判合併（search 索引延遲，見 PR #12），沒列的 task 與撤回照舊用 search。
  **翻案條件**：雲端主力真的需要另開 Claude Code session 當執行者（sub-agent 吃派工 session 額度撐不住）→ 從 git 歷史撈回 session 段。
- **2026-10-16**｜**驗收改成有界**（取代 2026-10-02 那條的「四種」與 0.4.10「介面約定寫進 spec.md」）：執行者只准修正 spec 既有條文，
  不准新增 Requirement／Scenario／MUST，介面決定寫程式註解或 PR body `## 介面決定`；BLOCKER 剩三種，(a) 只看 task「規格：」所指條文、
  反例要本 repo 工具會產生或外部呼叫者觸發得了；拿掉 `## 驗` 數字比對（閘綠即證據）；mutation 只對本 PR 負向 Scenario、已紅且沒改的不重跑；
  追問只修列出的 BLOCKER；同類 BLOCKER 連兩輪先 `/cc-root`。工單 `docs/archive/changes/2026-10-16-dispatch-bounded-review/`。
  理由：2026-10-02 那條的翻案條件成立——一個 Google Ads 移植專案的寫入閘 PR 退件 5 輪，spec 被執行者從 34 條長到 43 條，
  驗收員被要求找清單外的路，每輪修好的程式就是下一輪的 BLOCKER 面。該專案先以專案層 `docs/changes/README.md` 覆寫，本條搬回源頭。
  **翻案條件**：有界版合併後出現該擋卻判非阻擋、事後在整合分支或 `main` 爆出來的缺陷 → 把那類缺陷寫成具名 Scenario，不放寬 (a) 的範圍。

