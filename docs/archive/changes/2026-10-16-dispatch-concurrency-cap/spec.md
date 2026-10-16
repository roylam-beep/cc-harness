## Purpose
上一版把 8 做成下限（max(n, 8)），規則檔可以調得更高。使用者要的是上限：同時最多 8 個，固定值。

## 不做
- 不改波次設計、不改其他 repo 的 `docs/changes/README.md`。

## MODIFIED Requirements

### Requirement: cc-dispatch 讀工單派工
`/cc-dispatch <slug>` SHALL 讀 `docs/changes/<slug>/tasks.md`，只對「目前波次」未勾的 task 各呼叫一次執行者原語
（`gate.env` 的 `EXECUTOR` 沒寫或是 `cursor` 走 `/cc-cursor`，`claude` 走 `/cc-claude`），
並把每次派工記進 `docs/changes/<slug>/runs.md`；使用者的派工指令就是同意、不再問，波次自動推進，只在合進 `main` 前問。

#### Scenario: 算目前波次
- **WHEN** `tasks.md` 有多組 `## N.`
- **THEN** 目前波次＝第一組含未勾 task 的那組；若更前面的組別仍有未勾，停下並回報「先 sync」

#### Scenario: 契約 prompt
- **WHEN** 為一條 task 拼 prompt
- **THEN** 內容含：必讀 `SPEC.md`、`docs/changes/README.md`、該 change 的 `spec.md` 與 `tasks.md`；只做這一條原文；
  PR 標題逐字 `<slug> N.M: <一句>`；不改 `tasks.md`；spec 既有條文錯就同 PR 修正；PR body 要有 `## 驗` 貼指令輸出

#### Scenario: 下指令就是同意
- **WHEN** 使用者打 `/cc-dispatch <slug>` 或用文字叫你派工，工單共 k 條未勾 task
- **THEN** 不問，直接逐條呼叫執行者原語，同時最多為該執行者的上限，其餘記 `queued`；回報一行列出全部波次、repo、BASE、執行者

#### Scenario: 同時上限固定 8
- **WHEN** 派工時未完成的執行者已有 8 個，不論 `docs/changes/README.md` 寫了什麼 `MAX_CONCURRENT*`
- **THEN** 新的 task 記 `queued`，不開新執行者；Cursor 與 Claude 執行者同一個上限

#### Scenario: sync 打勾
- **WHEN** 使用者呼叫 `/cc-dispatch <slug> sync`
- **THEN** `runs.md` 有 PR 號的 task 用 `gh pr view` 判是否合併（不靠搜尋）；沒有列的 task 才用 `gh pr list --state merged --search "<slug> "` 找標題符合 `<slug> N.M:` 的 PR，把 `tasks.md` 對應行 `- [ ] N.M` 改 `- [x] N.M`；
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
- **WHEN** 某 PR 第 3 輪驗收仍 `fix-needed`、執行者 `failed` 或 `stalled`、驗收員卡住兩次、`gate.sh` 退出碼 2、有人回報要追加 task／改所有權／動 `## 不做`，或下一波有「驗：[需確認]」
- **THEN** 停下回報，不派新執行者

#### Scenario: 合進 main 前問一次
- **WHEN** 全部 task 勾完且 BASE 是整合分支
- **THEN** 開 BASE → `main` 的 PR，checks 綠後問使用者一次（PR 網址、波數、合併數、退回數），同意才合併；不代跑 `spec_merge.py`

#### Scenario: 契約禁止 skip 遮依賴、執行者不寫考題
- **WHEN** 為一條 task 拼契約 prompt
- **THEN** 內容含「不准用 skip 表達依賴還沒到」與「不准新增 Requirement／Scenario／MUST」兩句；介面決定寫在程式註解或 PR body 的 `## 介面決定`

#### Scenario: 驗收在合進 BASE 後的狀態核對
- **WHEN** 閘綠後派驗收員
- **THEN** 驗收員自己 clone、`gh pr checkout` 後再 merge `origin/<BASE>`，逐條核對本 PR task「規格：」所指 Requirement 本文每個子句與其 Scenario，不找清單外的路

#### Scenario: BLOCKER 只有三種
- **WHEN** 驗收員發現問題
- **THEN** 只有「列出的子句或 Scenario 不成立且反例是本 repo 工具會產生或外部呼叫者觸發得了／改了所有權外的檔（本 change 的 `spec.md` 修正既有條文不算）／skip>0 或反例測不到」能判 `fix-needed`；全稱性質、`## 驗` 數字與重跑不符都寫進 `## 非阻擋`

#### Scenario: mutation 有界
- **WHEN** 驗收員做 mutation
- **THEN** 只對本 PR 的負向 Scenario 做；前幾輪已紅、該處程式沒改的不重跑

#### Scenario: 追問只修 BLOCKER
- **WHEN** 驗收判 `fix-needed`
- **THEN** 追問要執行者只修列出的 BLOCKER、不順手補同類洞；同一類 BLOCKER 連兩輪出現就先跑 `/cc-root`，不直接轉貼下一條

#### Scenario: 驗收員不會卡死
- **WHEN** 驗收員開工
- **THEN** 第一步先寫出檔頭 `VERDICT: pending`、邊查邊追加，且不開互動式瀏覽器

#### Scenario: 執行者與模型取自 gate.env
- **WHEN** `gate.env` 寫了 `EXECUTOR=<cursor|claude>` 或 `EXECUTOR_MODEL=<id>`
- **THEN** 依 `EXECUTOR` 選原語（沒寫＝`cursor`）；`EXECUTOR_MODEL` 有寫就以 `--model` 帶給該原語，沒寫就不帶（Cursor 用其預設、Claude 用 Sonnet）

#### Scenario: 驗收員固定 Opus
- **WHEN** 派驗收員
- **THEN** `Agent` 工具帶 `model: "opus"`，不論執行者是誰

#### Scenario: gh 不能用改走 GitHub MCP
- **WHEN** `gh auth status` 失敗
- **THEN** 開 PR、查 PR、看 checks、轉 ready、合併、sync 都改用 GitHub MCP 對應工具；`--delete-branch` 那步略過，分支留著；要等 checks 就排 `send_later` 再查，不在前景等

#### Scenario: Claude 執行者先記帳再開
- **WHEN** 派一條 `EXECUTOR` 是 `claude` 的 task
- **THEN** 先在 `runs.md` 寫一列狀態 `starting`、執行者欄空，`/cc-claude` 回報後回填它給的執行者 id（`agent:…`）與 `running`；`runId` 欄寫 `-`

#### Scenario: Claude 執行者中斷後接手
- **WHEN** 新 session 接手，`runs.md` 有 Claude 執行者的 `starting`／`running` 列
- **THEN** 以 head `exec/<slug>-N.M` 查 PR，查到就先過 PR 身分核對、過了才記進該列走驗收；沒 PR 但 task 分支在 remote → 開新 sub-agent 在該分支續做；都沒有才重派

#### Scenario: 追問時執行者已不在
- **WHEN** 追問 Claude 執行者，`/cc-claude` 回「執行者已不在」
- **THEN** 在同一個 task 分支開新執行者、prompt 附上這次追問，`runs.md` 該列換新 id，不另開 PR

#### Scenario: PR 身分核對
- **WHEN** 原語回報一個 PR 網址，或接手時查到一個 PR
- **THEN** 以當前 origin 的 owner／repo 查該 PR，標題符合 `<slug> N.M:`、base 等於 BASE 才驗收（head 由 `/cc-claude` 核對）；任一不符就記 `failed`、停下回報，不合併

#### Scenario: 合進 main 看實際 base
- **WHEN** 要合併一個 PR
- **THEN** 以 PR 的實際 base 判斷：是 `main` 就先問使用者，跟 BASE 不同就停
