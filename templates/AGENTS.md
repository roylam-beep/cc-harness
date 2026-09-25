# AGENTS.md — 本 repo 的代理契約（唯一程序權威）

七節。**每節要嘛自己寫本文，要嘛給一條指到本文的路標**——缺的是「找不到」，
不是「沒寫在本檔裡」。

## 使命

<一句話：這個 repo 在解什麼問題、交付給誰。填完刪掉本行。>

## 硬性規則

用 `/cc-dispatch` 派工的 repo 才適用。整合分支（例如 `claude/*`，不是 `main`）可直接 push，讓 cloud agent 從那裡開分支；被派的 cloud agent 可直接 push 自己的 `cursor/*` 並開 PR 到整合分支。PR 目標是整合分支時，發包者跑完獨立驗收（讀 diff、本機跑測試與 build）後直接合併。合進 `main`、force-push、刪 `main` 以外別人的分支仍要使用者當輪確認。發包者只寫 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`，產品程式碼一行也走追問或 micro-task。

<不可違反的幾條，帶 because。想不出 because 的規則不要寫。>

## 回覆與範圍

**回覆語言：台灣繁體中文，無例外。** 禁中國簡體字與中國用語，禁香港、馬來西亞、
新加坡華語詞彙。檔案路徑、指令、函式名、設定值、原始錯誤訊息原樣輸出，不翻譯。
這行是硬性的，鋪 harness 時不要刪。

<回覆形狀、範圍外發現往哪去。預設：範圍外發現寫 BACKLOG.md 一行。>

## 收輪三步

<自己寫，或指向 `docs/round.md`。程序本文的權威是 `/cc-close`。>

動 `src/**` 的輪次要有 `docs/changes/<slug>/`（格式與 PR 切法見 `docs/changes/README.md`）；活規格在 `SPEC.md`。

## BACKLOG queue 規則

<自己寫，或指向 `BACKLOG.md` 檔頭。>

## hook 清單

<本 repo 掛了哪些 hook、各自做什麼。或指向 `docs/hooks.md`。>

## 定案決策

<指向 `docs/decisions.md`。決策本文不寫在本檔——本檔是常駐載入的，會吃預算。>
