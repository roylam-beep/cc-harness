#!/bin/sh
# check_docs.py 的英文別名與可設定清單（第 1、3、5 類）。沒設環境變數＝原行為，這裡逐項證明。
#   1. BACKLOG 檔頭 `Max N items` 跟「上限 N 條」一樣生效；項目行裡的 `limit 5 items` 不算檔頭
#   2. CHECK_DOCS_SRC_GLOBS 把 lib/** 也算進「動原始碼就載入」那一桶
#   3. CHECK_DOCS_HOOK_DIRS 改找別處的 git hook 真身
set -e
unset CLAUDE_CONFIG_DIR CHECK_DOCS_SRC_GLOBS CHECK_DOCS_HOOK_DIRS
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✔ $1"; }
bad() { echo "  ✘ $1"; FAIL=1; }
run() { HOME="$TMP/home" python3 "$ROOT/tools/check_docs.py" "$TMP/r" 2>&1; }
mkdir -p "$TMP/r" "$TMP/home"

# ── 1. BACKLOG 英文檔頭 ──
printf '# BACKLOG\n\nMax 2 items.\n\n- a\n- b\n- c\n' > "$TMP/r/BACKLOG.md"
run | grep -q "3 條 > 2（檔頭宣告" && ok "Max 2 items → 上限 2" || bad "英文檔頭沒生效：$(run)"
printf '# BACKLOG\n\n上限 2 條。\n\n- a\n- b\n- c\n' > "$TMP/r/BACKLOG.md"
run | grep -q "3 條 > 2（檔頭宣告" && ok "上限 2 條 → 上限 2（原行為）" || bad "中文檔頭壞了：$(run)"
printf '# BACKLOG\n\n- show limit 1 items per page\n- b\n' > "$TMP/r/BACKLOG.md"
run | grep -q "CHECK_DOCS OK" && ok "項目行裡的 limit N items 不當檔頭" || bad "項目行被當成檔頭：$(run)"
rm "$TMP/r/BACKLOG.md"

# ── 2. src 桶可設定 ──
mkdir -p "$TMP/r/.claude/rules"
{ printf -- '---\npaths: ["lib/**"]\n---\n'; python3 -c "print('x'*6100)"; } > "$TMP/r/.claude/rules/lib.md"
run | grep -q "CHECK_DOCS OK" && ok "沒設：lib/** 不進 src 桶（原行為）" || bad "預設行為變了：$(run)"
CHECK_DOCS_SRC_GLOBS="src/**,lib/**" run | grep -q "scoped 合計 6,1" && ok "CHECK_DOCS_SRC_GLOBS 含 lib/** → 計入並超標" || bad "SRC_GLOBS 沒生效：$(CHECK_DOCS_SRC_GLOBS="src/**,lib/**" run)"
rm -rf "$TMP/r/.claude"

# ── 3. hook 目錄可設定 ──
git -C "$TMP/r" init -q
mkdir -p "$TMP/r/ops/hooks"; printf '#!/bin/sh\necho a\n' > "$TMP/r/ops/hooks/pre-commit"
run | grep -q "git hook 0 支" && ok "沒設：不看 ops/hooks（原行為）" || bad "預設行為變了：$(run)"
CHECK_DOCS_HOOK_DIRS="ops/hooks" run | grep -q "git hook pre-commit 未安裝" && ok "CHECK_DOCS_HOOK_DIRS=ops/hooks → 找到真身" || bad "HOOK_DIRS 沒生效：$(CHECK_DOCS_HOOK_DIRS=ops/hooks run)"

[ "$FAIL" -eq 0 ] && echo "CHECK_DOCS_CONFIG OK（7 項全過）" || { echo "CHECK_DOCS_CONFIG FAIL"; exit 1; }
