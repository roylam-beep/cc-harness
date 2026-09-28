---
description: 掃當前 repo 的技術棧、驗收指令與憑證 key 名，產出雲端開發環境的 kickoff prompt——Cursor（`.cursor/environment.json`）、Claude（SessionStart hook＋setup script）或兩個都要。只產 prompt，不寫環境檔；Cursor 那份交 /cc-cursor 派
argument-hint: "[cursor|claude|both]"
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion
disallowed-tools: Write, Edit, NotebookEdit
---

產雲端開發環境的 kickoff prompt。$ARGUMENTS

**分工**：本機只做「查事實＋填 prompt」。環境設定由雲端那個 agent 在它自己的機器裡寫並驗，
因為雲端映像的版本、權限，本機測不到；本機代寫＝沒驗過的設定。

## 步驟

1. **選平台。** `$ARGUMENTS` 第一個 token 是 `cursor`／`claude`／`both` 就用它。沒給就問一次，
   選項三個：兩個都要（預設）／只要 Cursor／只要 Claude。**不從 repo 自動猜**——有 `.claude/` 不代表會用 Claude 雲端。
2. **掃描**（唯讀，只讀當前 repo）。逐項查，查不到就寫「未偵測」，**不要猜**：

   | 查什麼 | 看哪裡 |
   |---|---|
   | 語言／版本 | `.python-version`、`.nvmrc`、`.tool-versions`、`pyproject.toml`、`package.json` engines、`go.mod`、`Cargo.toml`；再跑本機 `python3 --version`／`node -v` 標「本機實測」 |
   | 依賴安裝 | lockfile 決定指令：`pnpm-lock.yaml`→`pnpm install`、`package-lock.json`→`npm ci`、`uv.lock`→`uv sync`、`requirements*.txt`→`pip install -r`；都沒有＝無依賴 |
   | 驗收指令 | 依序：`AGENTS.md`／`CLAUDE.md` → README 測試節 → `Makefile` → `package.json` scripts → CI yml。**本機實跑一次**，記下實際通過數 |
   | 常駐服務 | dev server／DB／docker 需求 → Cursor 決定要不要 `start`／`terminals`，Claude 交給 SessionStart hook 每次啟動；CLI 或排程類＝不要 |
   | 憑證 | `.env.example`／`.env.template` **只取 key 名**，絕不讀 `.env` 的值 |
   | 危險旗標 | `AGENTS.md` 紅線＋ grep `--live`／`--create`／`--prod`／`deploy` 類旗標 |
   | harness | `scripts/hooks/*` 存在 → install 要複製進 `.git/hooks/` |
   | Claude 預裝（只 claude／both） | 對照官方 cloud-environments 頁的預裝清單：Python 3.x（pip／uv／poetry）、Node 20／21／22（npm／pnpm／yarn）、Ruby 3.1–3.3、PHP 8.3、Java 21、Go、Rust、C/C++、Docker、PostgreSQL 16、Redis 7.0。bun 過 proxy 有已知問題。不在清單的工具鏈才需要 setup script |
   | 已有設定 | `.cursor/environment.json`、`.cursor/hooks.json`、`Dockerfile`、`.claude/settings.json` 的 `hooks.SessionStart` 已存在 → prompt 改成「修正／補齊」而不是新建 |

3. **產 prompt。** 照選定平台的骨架填，每條事實來自第 2 步，骨架外不加段落。`both` 就兩份都產，共用同一組事實。
4. **交付。**
   - 把 prompt 貼進回覆，附一句「掃到什麼／哪幾項未偵測」。
   - Cursor 那份：使用者說派出去 → 交給 `/cc-cursor`（本 skill 不碰任何 `cursor_*` 工具）。
   - Claude 那份：使用者在本機跑 `claude --cloud "<prompt>"`，或貼進 claude.ai/code 開新 session。
     雲端 clone 的是 remote 上的分支，本機沒 push 的 commit 它看不到。本 skill 不替使用者開 session（花額度）。
   - PR 回來後，檢查 `## 驗` 的通過數與本機實測一致；不一致就追問，不直接合併。
     Claude 那份的 PR body 有 `## setup script` 節時，提醒使用者手動貼進環境設定——**這是人工閘**，repo 裡沒有地方放它。

## 骨架 A：Cursor

````text
任務：替本 repo（<owner/repo>）建立 Cursor Cloud Agent 開發環境，讓之後每個 cloud agent 開機就能跑完整驗收。只交一個 PR。

開工前必讀：<AGENTS.md／README 測試節／其他規則檔>

已知事實（不用再查）：
- 技術棧：<語言＋版本；本機實測值；未驗證的版本明說未驗證>
- 依賴：<安裝指令，或「無依賴」>
- <其他會踩的事實，例如 CI 已停用、驗收以 box 為準>

要交付：
1. `.cursor/environment.json`：照 Cursor 官方目前 schema（https://cursor.com/docs/cloud-agent/setup）。不確定的欄位不放。
   - install（必須冪等）：<依賴安裝＋版本檢查＋git hook 複製>
   - start／terminals：<需要的服務，或「不需要，本 repo 沒有常駐服務」>
2. 預設映像缺 <版本需求> 才加 Dockerfile（不 COPY 專案），並在 PR 說明原因。
3. <repo 地圖檔> 補一行 `.cursor/` 說明。其他檔案一律不動。

安全紅線：
- 不在 Cursor Secrets 或任何檔案設定 <憑證 key 名清單>；不建立 `.env`。<若驗收確實需要 secret，改列「只准設定 X，且僅限 Y 用途」>
- install／start／terminals 禁止出現 <危險旗標>，不打任何 live API。

驗收（在 box 裡實跑，全綠）：
```
<逐條指令>
```
預期：<本機實跑的通過數與 OK 字樣；會因雲端缺帳號檔而跳過的檢查要先講明屬正常>

PR 規格：
- 標題：`env: cursor cloud environment`；commit 照 repo 慣例。
- PR body 必有 `## 驗`：貼每條驗收指令的實際輸出。
- 範圍外發現只記 <BACKLOG 檔> 一行，不順手修。
````

## 骨架 B：Claude

````text
任務：替本 repo（<owner/repo>）建立 Claude Code 雲端 session 開發環境，讓之後每個 cloud session 開機就能跑完整驗收。只交一個 PR。

開工前必讀：<AGENTS.md／README 測試節／其他規則檔>

已知事實（不用再查）：
- 技術棧：<語言＋版本；本機實測值>；雲端預裝：<涵蓋／缺哪些，缺的列出來>
- 依賴：<安裝指令，或「無依賴」>
- 本 session 的 `CLAUDE_CODE_REMOTE` 是 `true`；repo `.claude/settings.json` 的 hooks 會載入，`enabledPlugins` 列的 plugin 不會安裝。
- <其他會踩的事實>

要交付：
1. `.claude/settings.json` 加 `hooks.SessionStart`：`matcher` 為 `startup|resume`，指令 `bash "$CLAUDE_PROJECT_DIR"/<腳本路徑>`。檔案已存在就合併，不動其他鍵。
2. `<腳本路徑>`：開頭 `[ "$CLAUDE_CODE_REMOTE" != "true" ] && exit 0`（本機不跑），之後 <依賴安裝＋git hook 複製>。
   必須冪等（依賴已在就跳過，每次啟動都會跑），結尾 `exit 0`。
3. 預裝缺 <工具鏈> 才需要 setup script：**不寫進 repo**（它存在 claude.ai/code 的環境設定），全文貼在 PR body 的 `## setup script` 節。
   要求：root 跑、約 5 分鐘內跑完（超過不快取）、非關鍵指令加 `|| true`。不需要就寫「不需要」。
4. <repo 地圖檔> 補一行說明。其他檔案一律不動。

安全紅線：
- 不把 <憑證 key 名清單> 寫進任何檔案；不建立 `.env`。驗收確實需要的，只在 PR body 列 key 名，由使用者設在環境設定的環境變數欄。
- hook 與腳本禁止出現 <危險旗標>，不打任何 live API。

驗收（在本 session 的 VM 裡實跑，全綠）：
```
<逐條指令>
CLAUDE_CODE_REMOTE= bash <腳本路徑> && echo LOCAL-SKIP-OK
```
預期：<本機實跑的通過數與 OK 字樣>；最後一行證明本機不會跑安裝。

PR 規格：
- 標題：`env: claude cloud environment`；commit 照 repo 慣例。
- PR body 必有 `## 驗`：貼每條驗收指令的實際輸出。
- 範圍外發現只記 <BACKLOG 檔> 一行，不順手修。
````

## 不做

- 不在本機寫 `.cursor/environment.json`、`.claude/settings.json` 或安裝腳本，不 commit、不 push。
- 不讀、不轉述任何憑證值；不替使用者決定要不要開 Secrets 或環境變數。

## 防什麼

雲端 agent 開機缺依賴、版本不對、每次重猜驗收指令；本機代寫沒在雲端驗過的環境設定；憑證被寫進 repo。
Claude 的 setup script 只能存在環境設定裡，不走人工閘就會以為 repo 已經設好了。
