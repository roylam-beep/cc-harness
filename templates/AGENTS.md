# AGENTS.md — 本 repo 的代理契約（唯一程序權威）

七節。**每節要嘛自己寫本文，要嘛給一條指到本文的路標**——缺的是「找不到」，
不是「沒寫在本檔裡」。

## 使命

<一句話：這個 repo 在解什麼問題、交付給誰。填完刪掉本行。>

## 硬性規則

用 `/cc-dispatch:cc-dispatch`（cc-dispatch plugin）派工的 repo 才適用：整合分支（`/cc-dispatch` 預設 `claude/<slug>`，前綴見 `docs/changes/README.md` 的 `INTEGRATION_PREFIX`；不是 `main`）可直接 push，讓 cloud agent 從那裡開分支；被派的 agent 可 push 自己的分支並開 PR 到整合分支。發包者的閘＋獨立驗收通過才合併，沒過退回同一個 agent；合進 `main`、force-push、刪 `main` 以外別人的分支仍要使用者當輪確認。發包者只寫 `docs/changes/<slug>/**`、`handovers/**`、`BACKLOG.md`，產品程式碼一行也走追問——because 發包者自己修等於跳過驗收。

<不可違反的幾條，帶 because。想不出 because 的規則不要寫。>

## 回覆與範圍

<回覆語言（團隊要統一才寫）、回覆形狀、範圍外發現往哪去。預設：範圍外發現寫 BACKLOG.md 一行。>

## 收輪三步

程序本文以 `/cc-close` 為準，本節不另寫程序。

動 `src/**` 的輪次要有 `docs/changes/<slug>/`（格式與 PR 切法見 `docs/changes/README.md`）；活規格在 `SPEC.md`。

## BACKLOG queue 規則

<自己寫，或指向 `BACKLOG.md` 檔頭。>

## hook 清單

<本 repo 掛了哪些 hook、各自做什麼。或指向 `docs/hooks.md`。>

## 定案決策

<指向 `docs/decisions.md`。決策本文不寫在本檔——本檔是常駐載入的，會吃預算。>
