#!/bin/sh
# 裝著的 plugin 是不是本 repo 的當前內容？
#
# 為什麼需要這支：`claude plugin install` 把整個 repo **複製**到
# ~/.claude/plugins/cache/<mp>/<plugin>/<version>/，而那份快取**以 version 為 key**。
# 實測（2026-09-04）：改了檔案後跑 `claude plugin marketplace update` 與
# `claude plugin update` 都回「already at the latest version」，快取一個字都沒變；
# 把 plugin.json 的 version bump 之後再 `claude plugin update` 才會重新複製。
# 所以「改完忘記 bump」＝你在用舊版，而且沒有任何錯誤訊息。
#
# 沒安裝就靜靜跳過（CI 與新 clone 本來就沒裝），退 0。
# 有安裝但內容不符＝退 1，訊息告訴你要 bump 哪個檔。
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
NAME="$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/.claude-plugin/plugin.json" | head -1)"
VER="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/.claude-plugin/plugin.json" | head -1)"
CACHE="$HOME/.claude/plugins/cache/$NAME/$NAME/$VER"

[ -d "$CACHE" ] || { echo "PLUGIN_SYNC 跳過（$NAME@$VER 沒裝在本機）"; exit 0; }

# 排除的都是 .gitignore 裡那幾樣＋.git 本身；其餘一律比，包含未追蹤檔案——
# 工作區有它、快取沒有，就是「快取落後於工作區」，該紅。
DIFF="$(diff -rq --exclude=.git --exclude=.DS_Store --exclude=scratch --exclude='*.log' \
        "$ROOT" "$CACHE" 2>&1 || true)"
if [ -n "$DIFF" ]; then
  echo "PLUGIN_SYNC FAIL：裝著的 $NAME@$VER 與本 repo 不一致——你在用舊版"
  echo "$DIFF" | head -20
  echo "→ 把 .claude-plugin/plugin.json 的 version bump 一版，再跑 claude plugin update $NAME"
  exit 1
fi
echo "PLUGIN_SYNC OK（$NAME@$VER 與本 repo 一致）"
