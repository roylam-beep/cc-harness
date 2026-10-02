## Purpose
兩次實跑（`docs/reviews/2026-10-01-dispatch-sim.md`）顯示：Requirement 寫了行為、Scenario 只驗骨架、同波 task 互相依賴、
測試用 skip 遮住缺資料時，全閘綠但產品沒做完；驗收員門檻不一、會卡死；學到的約定沉進 PR body。本變更把這些補成規則。

## 不做
- 不改 `tools/gate.sh`、`tools/spec_merge.py`，不新增工具或 hook。
- 不替各 repo 寫瀏覽器冒煙測試本身，只要求 `gate.env` 有、沒有就照實寫。
- 不改停點設計（使用者下指令即同意、只在合進 `main` 前問）。

## MODIFIED Requirements

### Requirement: cc-dispatch 讀工單派工
`/cc-dispatch <slug>` SHALL 讀 `docs/changes/<slug>/tasks.md`，只對「目前波次」未勾的 task 各呼叫一次 `/cc-cursor`，
並把每次派工記進 `docs/changes/<slug>/runs.md`；使用者的派工指令就是同意、不再問，波次自動推進，只在合進 `main` 前問。

#### Scenario: 算目前波次
- **WHEN** `tasks.md` 有多組 `## N.`
- **THEN** 目前波次＝第一組含未勾 task 的那組；若更前面的組別仍有未勾，停下並回報「先 sync」

#### Scenario: 契約 prompt
- **WHEN** 為一條 task 拼 prompt
- **THEN** 內容含：必讀 `SPEC.md`、`docs/changes/README.md`、該 change 的 `spec.md` 與 `tasks.md`；只做這一條原文；
  PR 標題逐字 `<slug> N.M: <一句>`；不改 `tasks.md`；spec 錯就同 PR 改；PR body 要有 `## 驗` 貼指令輸出

#### Scenario: 下指令就是同意
- **WHEN** 使用者打 `/cc-dispatch <slug>` 或用文字叫你派工，工單共 k 條未勾 task
- **THEN** 不問，直接逐條呼叫 `/cc-cursor`，同時最多 `MAX_CONCURRENT` 個，其餘記 `queued`；回報一行列出全部波次、repo、BASE

#### Scenario: 同時上限取自規則檔
- **WHEN** `docs/changes/README.md` 的「派工」節寫了 `MAX_CONCURRENT=<n>`
- **THEN** 同時跑的 agent 上限是 n；找不到這個值就用 3

#### Scenario: sync 打勾
- **WHEN** 使用者呼叫 `/cc-dispatch <slug> sync`
- **THEN** 用 `gh pr list --state merged --search "<slug> "` 找標題符合 `<slug> N.M:` 的 PR，把 `tasks.md` 對應行 `- [ ] N.M` 改 `- [x] N.M`；
  已關閉未合併的在 `runs.md` 記 `closed`

#### Scenario: sync 抓事後 revert
- **WHEN** 某條 N.M 已合併，之後出現標題符合 `Revert "<slug> N.M:` 的已合併 PR 或 main 上的 commit，且時間晚於該次合併
- **THEN** `tasks.md` 該行改回 `- [ ] N.M`，`runs.md` 該列記 `reverted`；revert 之後又有新的 N.M PR 合併就照常打勾

#### Scenario: 預設整合分支
- **WHEN** 開工時 `gate.env` 沒有 `BASE=`
- **THEN** 開 `claude/<slug>`（從 `origin/main`），`gate.env` 寫 `BASE=claude/<slug>` 後直推；寫明 `BASE=main` 的工單照舊每次合併都問

#### Scenario: 自動推進下一波
- **WHEN** 目前波次的 task 全部 `merged`，且沒有停止條件成立
- **THEN** 替這波打勾、記帳寫進 BASE，接著派下一波，不問使用者

#### Scenario: 停止條件
- **WHEN** 某 PR 第 3 輪驗收仍 `fix-needed`、agent `failed`、驗收員卡住兩次、`gate.sh` 退出碼 2、有人回報要追加 task／改所有權／動 `## 不做`，或下一波有「驗：[需確認]」
- **THEN** 停下回報，不派新 agent

#### Scenario: 合進 main 前問一次
- **WHEN** 全部 task 勾完且 BASE 是整合分支
- **THEN** 開 BASE → `main` 的 PR，checks 綠後問使用者一次（PR 網址、波數、合併數、退回數），同意才合併；不代跑 `spec_merge.py`

#### Scenario: 契約禁止 skip 遮依賴
- **WHEN** 為一條 task 拼契約 prompt
- **THEN** 內容含「不准用 skip 表達依賴還沒到」與「自己決定的介面約定寫進 spec.md」兩句

#### Scenario: 驗收在合進 BASE 後的狀態核對
- **WHEN** 閘綠後派驗收員
- **THEN** 驗收員自己 clone、`gh pr checkout` 後再 merge `origin/<BASE>`，逐條核對 Requirement 本文每個子句與每條 Scenario

#### Scenario: BLOCKER 只有四種
- **WHEN** 驗收員發現問題
- **THEN** 只有「子句或 Scenario 不成立／改了所有權外的檔（本 change 的 `spec.md` 不算）／`## 驗` 不實／skip>0 或反例測不到」能判 `fix-needed`，其餘寫進 `## 非阻擋`

#### Scenario: 驗收員不會卡死
- **WHEN** 驗收員開工
- **THEN** 第一步先寫出檔頭 `VERDICT: pending`、邊查邊追加，且不開互動式瀏覽器

### Requirement: cc-dispatch 從計畫檔起草工單
`/cc-dispatch <slug> from-plan <計畫檔路徑>` SHALL 讀該計畫檔，寫出 `docs/changes/<slug>/spec.md` 與 `tasks.md`，
通過格式檢查並推上整合分支 `claude/<slug>` 後，接著照一般派工流程派目前波次。

#### Scenario: 不覆寫既有工單
- **WHEN** `docs/changes/<slug>/` 已存在
- **THEN** 停下並回報「工單已存在，直接 `/cc-dispatch <slug>`」，不寫任何檔

#### Scenario: 起草格式可被檢查
- **WHEN** 起草完 `spec.md` 與 `tasks.md`
- **THEN** repo 有 `scripts/spec_merge.py` 就跑 `python3 scripts/spec_merge.py check .`，紅就修到綠才往下；沒有就回報「未驗格式」

#### Scenario: 疑似已完成的項目
- **WHEN** 計畫裡某項在 `git log` 找得到對應 commit
- **THEN** 該 task 寫成 `- [x]`，並在確認清單點名該 commit hash

#### Scenario: 起草完直接推送
- **WHEN** 工單起草完成
- **THEN** 不問：開整合分支、commit＋push 工單檔與 `gate.env`、派工；回報列出工單路徑、各波 task、整合分支名

#### Scenario: 每個子句都有驗收
- **WHEN** 起草 `spec.md`
- **THEN** 每條 Requirement 本文的每個可觀察子句都對到至少一條 Scenario 的 THEN

#### Scenario: 同波沒有讀寫依賴
- **WHEN** 某 task 要讀另一條 task 會產生的檔
- **THEN** 它被放到那條 task 之後的波次；同一波各 task 的所有權不交集

#### Scenario: 驗法弱要點名
- **WHEN** 某條 task 的「驗：」讓不出反例變紅（只驗格式、UI 不開瀏覽器）
- **THEN** 回報裡標 `[驗法弱]`，不停下

#### Scenario: gate.env 帶格式檢查
- **WHEN** repo 有 `scripts/spec_merge.py`
- **THEN** 起草的 `gate.env` 含 `GATE_2="python3 scripts/spec_merge.py check ."`

### Requirement: cc-close 記迴路量測
`/cc-close` 第①步歸檔每個 change 時 SHALL 在 `rounds.md` 記一行 `changes 歸檔 N｜PR 合併 a／退回 b｜gate 缺陷 c`，
並把 merged PR body 的 `## 學到的` 與 `reviews/*.md` 的 `## 非阻擋` 逐條走 A／B／C 判定。

#### Scenario: 有帳本時算數字
- **WHEN** 歸檔的 change 有 `runs.md`
- **THEN** a＝狀態 `merged` 的列數、b＝`closed` 加 `reverted` 的列數、c＝該 change 的 `tasks.md` 歷史裡新增過的 `- [ ] 0.` 行數

#### Scenario: 沒有帳本也沒有 gh
- **WHEN** change 沒有 `runs.md` 且 `gh` 不可用
- **THEN** a、b 寫「未算」，c 照算，不猜

#### Scenario: 撈學到的
- **WHEN** 該 change 有已合併 PR 的 body 含 `## 學到的`
- **THEN** 每一條都判 A／B／C 落檔，`rounds.md` 只留指標，不貼原文全段

#### Scenario: 撈驗收員的非阻擋建議
- **WHEN** 該 change 的 `reviews/*.md` 有 `## 非阻擋`
- **THEN** 每一條都判 A／B／C；屬介面約定而 `spec.md` 沒寫的，先補進 `spec.md` 再 `--apply`
