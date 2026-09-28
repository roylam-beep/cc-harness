# /cc-root 首跑驗收——brag 兩個缺口

對象：brag 裝 cc-harness 時暴露的兩個缺口（cloud 上 pre-commit 沒跑、`.gitignore` 排除 `.claude/`）。
跑法：headless `claude -p --plugin-dir .` 確認 command 載入（0.4.4），但 CLI OAuth 過期沒跑到模型；
改在互動 session 照 `commands/cc-root.md` 手動跑：3 個 `Plan` 提案 agent 平行＋1 個 `Plan` 紅隊。

## 1. 不變量

(a) 任何進 main 的 commit 都通過該 repo 當下這版的快閘；(b) harness 標準件一定在版控裡。

## 2. 根因

harness 把「強制」放在 clone-local、安裝時一次性的位置（`.git/hooks/`、複製進 repo 的副本、agent 的行為規則），
而不是一個每個 commit 都一定會經過的點。

- cloud commit 沒跑快閘 ← 快閘唯一掛點是 `.git/hooks/pre-commit`（`tools/install-hooks.sh:2` 自註不進版控）
- ← `.git/hooks` 不隨 clone 走，cloud 每次重新 clone
- ← 設計決定：「一律複製成 repo 自有檔」（`commands/cc-harness.md:29`、`:44`）
- `.claude/` 被 ignore ← 進不進版控只靠 agent 行為規則，沒有機器檢查

同根症狀：舊 repo 的 `scripts/check_docs.py` 副本不更新；BACKLOG #13（舊 hook 不自報過期）；BACKLOG #17（project-scope 舊版蓋過 user 版）。

## 3. 候選

- **L2 K1**（3 個鏡頭收斂）：templates 加 `.github/workflows/harness-gate.yml` 跑 repo 自帶快閘＋`git ls-files --error-unmatch` 驗 (b)，
  main 設 ruleset 把它設成 required check。改動：3 檔。紅隊：**活，附條件**——`/cc-dispatch` 會直推 main
  （`commands/cc-dispatch.md:62-64`、`:82-83`），不設 bypass 就卡死派工，得先改成走 PR 或整合分支。
  brag 是 public fork，Free 方案可用 ruleset；乾淨環境跑 `check_docs.py` 與 `spec_merge.py` 皆 exit 0。
- **L1 K2**：SessionStart 補裝 pre-commit＋`check_docs.py` 加「被 ignore 且未進版控＝紅」。紅隊：**死**——循環依賴：
  `.claude/` 被 ignore 時 cloud clone 沒有 `settings.json` → 不裝 plugin → SessionStart 不跑 → 檢查永遠不執行。
- **L0 K3**（原修法）：補裝＋`cc-harness.md` 寫 `git add -f` 規則。紅隊：**死**——之後新增的 `.claude/rules/*.md` 照樣被靜默 ignore。
- **L3**：三個鏡頭與主 agent 都沒產出。理由：不變量 (a)(b) 本身沒有鬆動空間，拿掉快閘或標準件都等於放棄目標。

## 4. 推薦

**K1（L2）**。前一個 session 的 `/cc-grill` 退回的正是 K2，這次被紅隊用循環依賴殺掉。

## 5. 動手前先驗

```bash
grep -n "git push" commands/cc-dispatch.md
```

逐條確認哪幾步直推 BASE；改成走 PR 之前不設 required check。

## 對 skill 本身的發現

- 三個鏡頭收斂到同一解：B（拿掉）沒有拿掉任何東西，其實是換層。已在 B 鏡頭加「必須以『拿掉 X』開頭」，並規定收斂要標出來。
- 推薦 ≠ 使用者手上原修法 → 退役訊號沒有觸發。
- 未驗：slash command 內開 Agent（headless 那次沒跑到模型）。
