VERDICT: merge

PR #7（review-loop 1.5：AGENTS 樣板發包規則），第 1 輪，視角 A（契約）。head `cursor/review-loop-1-5-agents-4502`（`2fa360b`），base `claude/review-loop-v04`。

## BLOCKERS

（無）

## FOLLOWUPS

1. 樣板的發包規則除了 `grep '整合分支'` 以外沒有任何閘守著。mutation M2～M5（刪掉 `force-push`、加 `/Users/…` 路徑、把字數灌到 2,705、多開第八節）BASE-GATE 全都照樣綠。建議之後在 `test/` 補一支樣板測試，斷言：關鍵句都在、`## ` 標題剛好 7 個、字元數 ≤ 2,000、沒有 `/Users/`。[需確認] 值不值得為一份樣板多一支測試。
2. `docs/changes/review-loop/tasks.md` 1.5 寫的「目前 1,333 字元」其實是 UTF-8 位元組數；字元數是 661（加完 982，位元組 1,904）。用字元或位元組算都 ≤ 2,000，這次不影響，但工單的單位要改正，免得下一個人照位元組算預算。
3. 已經裝好的 repo 的 `AGENTS.md` 拿不到這段（`/cc-harness` 不覆寫既有檔，見 PR body `## 交接`）。要補進舊 repo 得另開 task。
4. `docs/decisions.md` 新條目直接寫了「SetupHK」。這是工單指定的字句，`docs/plans/` 也早就有這個名字，但 README 規矩 1 說「不放客戶名」。[需確認] SetupHK 算不算客戶名。
5. PR body 說在 cloud container 裡 `test/test_skills.py` 紅 5 項，原因是缺 `~/.claude`、`~/.codex`，而且沒設 `CLAUDE_CODE_REMOTE`，所以沒跳過 home 路徑檢查。本機實跑是綠的，跟本 PR 無關。可以另開 task，讓 Cursor cloud 也跳過這項檢查。

## 逐條 Scenario

- ✅ Scenario「合併與推送權限」。證據在 `templates/AGENTS.md:12`，四個要點都寫到了：
  - 「整合分支（例如 `claude/*`，不是 `main`）可直接 push」
  - 「被派的 cloud agent 可直接 push 自己的 `cursor/*` 並開 PR 到整合分支」
  - 「PR 目標是整合分支時，發包者跑完獨立驗收……後直接合併」
  - 「合進 `main`、force-push、刪 `main` 以外別人的分支仍要使用者當輪確認」

  沒有測試斷言這四點，驗法是逐句讀本文。mutation M2（刪掉 force-push）閘沒變紅，見 FOLLOWUP 1。
- ✅ Scenario「發包者寫入邊界」。證據在 `templates/AGENTS.md:12`：「發包者只寫 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`，產品程式碼一行也走追問或 micro-task」。驗法是逐句讀本文。
- 其他契約要點：
  - 位置：放在既有的 `## 硬性規則` 底下，開頭標明「用 `/cc-dispatch` 派工的 repo 才適用」。
  - 節數：`grep -c '^## '` 得 7，開頭寫的「七節」仍成立。
  - 字數：字元 982（`LC_ALL=en_US.UTF-8 wc -m` 與 Python `len` 一致），位元組 1,904，兩種算法都 ≤ 2,000。
  - 內容：沒有 repo 名、客戶名、`/Users` 路徑、日期。
- ✅ `docs/decisions.md` 新條目：
  - 新開 `## 派工與合併` 放在最上面。既有各節沒有跟派工相關的，新開一節合理。
  - 日期寫 `**2026-09-25**｜`，格式與既有條目一致。
  - 內容寫明 dispatch-v0「不做自動合併」放寬為「只准合進整合分支，`main` 由使用者」。
  - 理由是 21 個 PR 的實績，以及後期發包者自己修、跳過驗收的失敗。
  - `**翻案條件**` 寫法與第 142、245 行一致。

## 實跑

| 指令 | 退出碼 |
|---|---|
| `git fetch`、`worktree add --detach`、`merge --no-ff origin/cursor/review-loop-1-5-agents-4502` | 0 |
| `git diff --name-only base...head` 得 `docs/decisions.md`、`templates/AGENTS.md`，等於所有權 | — |
| `git diff --check base...head` | 0 |
| `grep -n '整合分支' templates/AGENTS.md`（task 的「驗：」） | 0 |
| `python3 tools/check_docs.py .` 得 CHECK_DOCS OK（常駐 3,945/6,500） | 0 |
| `python3 tools/spec_merge.py check .` 得 OK | 0 |
| `python3 test/spec_merge.test.py` 得 25 項 OK | 0 |
| `python3 test/test_skills.py` 得 10 支 OK | 0 |
| `node test/guard-bash.test.mjs` | 0 |
| mutation M1 刪掉整段 | grep=1（紅），其他閘綠 |
| mutation M2 刪掉 `force-push、` | 全綠（沒閘擋） |
| mutation M3 加 `/Users/roy-mac/x` | 全綠（沒閘擋） |
| mutation M4 灌到 2,705 字 | 全綠（沒閘擋） |
| mutation M5 多開 `## 第八節` | 全綠（沒閘擋） |

所有 mutation 都已用 `git checkout` 還原，`cmp` 與原檔一致。

共同約束：本 PR 沒改 `commands/`、沒改腳本，所以 sh -n、sed -i 等可攜性檢查不適用。diff 裡沒有 `/Users/<帳號>`。
