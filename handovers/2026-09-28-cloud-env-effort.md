基準：362dccc @ 2026-09-28T15:13:09Z
狀態：open（2026-09-28 建立）

## 狀態

本輪交了兩件支線：`/cc-cloud-env`（0.4.2）與 `/cc-cursor --effort`（0.4.3），都已 push。兩件都**沒有真派過**：
cc-cloud-env 的 Claude 骨架只讀文件未實測（翻案條件見 `docs/decisions.md` 2026-09-28），`--effort` 沒真開 agent。
R9 的主線（真跑輕量驗收迴圈＋拍板 BACKLOG #15）本輪沒動，kickoff 原樣轉到下面。
新開兩條範圍外發現：BACKLOG #17（本 repo 的 project-scope 安裝 0.3.4 蓋過 user，hook 跑舊版、sync 檢查假綠）、#18（guard-bash 列檔也擋）。

## 工作區

分支 `main`，歷史單線。本交接單、`rounds.md` R10、BACKLOG／ICEBERG 對帳、R9 交接單改 superseded
由**下一個 commit**（收輪 commit）提交，開場 HEAD 會比基準多一個——預期中。push 與否查：

```bash
git status --short && git log --oneline origin/main..HEAD
```

user scope 已 `claude plugin update` 到 0.4.3，但本 repo 另有 project-scope 0.3.4（BACKLOG #17）。
查法：`python3 -c "import json,os;[print(x['scope'],x['version'],x.get('projectPath')) for x in json.load(open(os.path.expanduser('~/.claude/plugins/installed_plugins.json')))['plugins']['cc-harness@cc-harness']]"`

## 下一輪 kickoff

```
【開工：用輕量版驗收迴圈真跑一條 task，然後拍板 BACKLOG #15】
一句話背景：cc-harness 是 Claude Code 治理 plugin；0.4.1 把 review-loop 收成 tools/gate.sh＋cc-dispatch「被叫醒時：驗收」，只跑過 smoke test；0.4.2／0.4.3 加了 /cc-cloud-env 與 /cc-cursor --effort，都未真派。
開場先跑：git rev-parse --short HEAD / git log --oneline origin/main -1 / git status --short
  本 kickoff 產生於 362dccc 之後；與實際不符以實際為準，並在回報點名差異。
先確認本 repo 實際跑的 hook 版本（BACKLOG #17：project-scope 0.3.4 會蓋過 user 0.4.3）；要換版本請使用者在終端機處理並重開 session。
必讀：handovers/2026-09-28-cloud-env-effort.md、commands/cc-dispatch.md、tools/gate.sh
只做：挑一條小 task（可用 BACKLOG #16）開 docs/changes/<slug>/（含 gate.env），經 /cc-dispatch 派 1 個 agent，
  照驗收節跑到 merge 或 3 輪停；記下哪一步卡住。之後把 BACKLOG #15 剩的兩項交給使用者拍板。
完成定義：該 change 的 tasks.md 全勾、reviews/ 至少一份、runs.md 有 agentId＋runId＋merged；#15 有使用者決定（做／砍）
不做：dispatch_state.py、merge_pr.sh、/cc-review、spec_merge 所有權檢查、SHARE_DIRS／SCHEMA_GLOB、followups.md、guard-write hook、effort 自動挑選規則
約束：範圍外發現→BACKLOG.md 一行並當輪 commit；新增行數先訂上限（README 規矩 4）；派 agent、push、合進 main 照規矩當輪問
```
