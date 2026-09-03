#!/bin/sh
# SessionStart hook（harness P1）：開場印兩行感測數字，不印別的。
#
# 為什麼只有兩行：SessionStart 的 stdout 會被注入 session context，每個 session 都付這個
# 成本。這支刻意不做 git 對帳（那是 repo 自己的 session-start，兩支可並存、內容不重疊）。
#
# 印什麼：
#   1. 近 30 天 skill 使用量（唯一資料源 tools/skill-usage.py）。
#   2. 本 session 常駐載入的字元數：帳號 CLAUDE.md ＋ repo AGENTS.md／CLAUDE.md ＋ MEMORY.md。
#      這個 N 是 P6 訂上限用的分子。
#
# 同兩行 append 到 ~/.claude/projects/<dir>/harness.log（gitignored 位置，不進任何 repo）。
#
# **恆 exit 0**：SessionStart 炸掉會弄壞每個 session 的開場，比印不出東西糟得多。
# python3 不在、skill-usage.py 不在、不在 git repo，都只是少印一行。
#
# 死法（P1 明列）：harness.log 連續 30 天沒被任何決策引用（收輪回報、退役理由）
# → 拆掉 append，只留印。

HERE="${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PROJ_DIR="$HOME/.claude/projects/$(printf '%s' "$ROOT" | sed 's/[^A-Za-z0-9]/-/g')"
LOG="$PROJ_DIR/harness.log"

emit() {
  echo "$1"
  mkdir -p "$PROJ_DIR" 2>/dev/null && printf '%s\t%s\t%s\t%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "-" "session-start" "$1" >> "$LOG" 2>/dev/null
}

# ── 第 1 行：skill 使用量 ──
USAGE=""
if [ -f "$HERE/tools/skill-usage.py" ]; then
  USAGE="$(python3 "$HERE/tools/skill-usage.py" --oneline --days 30 2>/dev/null)"
fi
emit "${USAGE:-skill 使用（近 30 天）：讀不到（tools/skill-usage.py 或 python3 不在）}"

# ── 第 2 行：常駐載入字元數 ──
# wc -m 算字元不是位元組——規則本文是中文，位元組會虛報三倍。
chars() { [ -f "$1" ] && LC_ALL=en_US.UTF-8 wc -m < "$1" | tr -d ' ' || echo 0; }

A="$(chars "$HOME/.claude/CLAUDE.md")"
if [ -f "$ROOT/AGENTS.md" ]; then B_NAME="AGENTS.md"; else B_NAME="CLAUDE.md"; fi
B="$(chars "$ROOT/$B_NAME")"
C="$(chars "$PROJ_DIR/memory/MEMORY.md")"
emit "本 session 常駐載入：帳號 CLAUDE.md ${A} ＋ repo ${B_NAME} ${B} ＋ MEMORY.md ${C} ＝ $((A + B + C)) 字元"

exit 0
