#!/bin/sh
# check_docs.py 第 7 類（常駐載入預算）的測試。四項：
#   1. 未超標 → 綠，OK 行帶 N/上限
#   2. 超標 → 紅（exit 1），訊息帶三個組成部分
#   3. 帳號 CLAUDE.md 不存在 → 整類跳過，不當紅
#   4. 與 hooks/session-start.sh 印的 N 完全相同（兩邊是同一份公式，分岔就白量了）
#
# 手法：把 HOME 指到臨時目錄。check_docs.py 用 os.path.expanduser("~")、
# session-start.sh 用 $HOME，兩邊都吃這個覆寫，不必為了測試在正式碼開後門。
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()   { echo "  ✔ $1"; }
bad()  { echo "  ✘ $1"; FAIL=1; }

# 用中文字：字元數與位元組數差三倍，能順帶證明兩邊算的都是字元。
rep() { python3 -c "import sys; sys.stdout.write('規則'*int(sys.argv[1]))" "$1"; }

REPO="$TMP/repo"; mkdir -p "$REPO"
SLUG="$(printf '%s' "$REPO" | sed 's/[^A-Za-z0-9]/-/g')"
mkdir -p "$TMP/home/.claude" "$TMP/home/.claude/projects/$SLUG/memory"

# ── 1. 未超標 ──
rep 500 > "$TMP/home/.claude/CLAUDE.md"          # 1,000 字
rep 100 > "$REPO/AGENTS.md"                      #   200 字
rep 50  > "$TMP/home/.claude/projects/$SLUG/memory/MEMORY.md"  # 100 字 → 合計 1,300
OUT="$(HOME="$TMP/home" python3 "$ROOT/tools/check_docs.py" "$REPO")" \
  && echo "$OUT" | grep -q "常駐載入 1,300/4,879" \
  && ok "未超標：綠，且印出 1,300/4,879" || bad "未超標：$OUT"

# ── 2. 超標（負向測試）──
rep 3000 > "$REPO/AGENTS.md"                     # 6,000 字 → 合計 7,100
set +e
OUT="$(HOME="$TMP/home" python3 "$ROOT/tools/check_docs.py" "$REPO" 2>&1)"; RC=$?
set -e
if [ "$RC" -eq 1 ] \
   && echo "$OUT" | grep -q "常駐載入 7,100 字 > 4,879" \
   && echo "$OUT" | grep -q "帳號 CLAUDE.md 1,000" \
   && echo "$OUT" | grep -q "repo AGENTS.md 6,000" \
   && echo "$OUT" | grep -q "MEMORY.md 100"; then
  ok "超標：紅（exit 1），訊息帶三個組成部分"
else
  bad "超標應該紅：rc=$RC / $OUT"
fi
rep 100 > "$REPO/AGENTS.md"

# ── 3. 帳號 CLAUDE.md 不存在 → 跳過 ──
mv "$TMP/home/.claude/CLAUDE.md" "$TMP/CLAUDE.md.bak"
OUT="$(HOME="$TMP/home" python3 "$ROOT/tools/check_docs.py" "$REPO")" \
  && echo "$OUT" | grep -q "常駐載入未檢查" \
  && echo "$OUT" | grep -q "常駐載入 跳過" \
  && ok "帳號 CLAUDE.md 不在：跳過，不當紅" || bad "缺帳號檔應該跳過：$OUT"
mv "$TMP/CLAUDE.md.bak" "$TMP/home/.claude/CLAUDE.md"

# ── 4. 與 session-start.sh 同一份公式 ──
rep 777 > "$REPO/AGENTS.md"
A="$(HOME="$TMP/home" CLAUDE_PROJECT_DIR="$REPO" CLAUDE_PLUGIN_ROOT="$ROOT" \
     sh "$ROOT/hooks/session-start.sh" | sed -n 's/.*＝ \([0-9]*\) 字元/\1/p')"
B="$(HOME="$TMP/home" python3 "$ROOT/tools/check_docs.py" "$REPO" \
     | sed -n 's/.*常駐載入 \([0-9,]*\)\/.*/\1/p' | tr -d ',')"
[ -n "$A" ] && [ "$A" = "$B" ] \
  && ok "與 session-start.sh 同值（$A）" \
  || bad "兩邊分岔：session-start=$A check_docs=$B"

[ "$FAIL" -eq 0 ] && echo "CHECK_DOCS_RESIDENT OK（4 項全過）" && exit 0
echo "CHECK_DOCS_RESIDENT FAIL"; exit 1
