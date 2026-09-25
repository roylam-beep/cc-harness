#!/bin/sh
# gate-pr — 在臨時 worktree 把 PR 試合併到整合分支最新版，再依序跑閘。
#
# 用法：
#   gate-pr.sh <change-dir> <PR#>
#   gate-pr.sh <change-dir> --head
#
# <change-dir>/gate.env 用 `.` 載入，至少要有 BASE= 與 GATE_1=。
# GATE_2、GATE_3… 從 1 連號，遇到第一個沒定義的就停。
# 選填：GATE_TIMEOUT=（秒，沒設是 900）、SHARE_DIRS=（空白分隔）、SCHEMA_GLOB=。
#
# 退出碼：
#   0  全綠（最後一行 GATE GREEN）
#   1  有閘紅（GATE RED，其餘照跑完）或試合併失敗但不是衝突
#   2  設定缺漏或用法錯（印出缺了什麼）
#   3  衝突（GATE CONFLICT，不跑閘）
#   4  PR 的 baseRefName 不等於 BASE（不建 worktree）
#
# 防什麼：在主工作目錄或舊的 BASE 上跑閘，綠了卻合不進整合分支，或合進去才爆。
#
# 主 repo 是 <change-dir> 往上三層。worktree 在 ${TMPDIR:-/tmp}，結束一定清掉
# （KEEP_WT=1 時保留並印 KEEP_WT <路徑>）。試合併的身分寫死，不改使用者的 git 設定。

set -e
export GIT_TERMINAL_PROMPT=0

WT=
ROOT=
HOOKS=

cleanup() {
  status=$?
  if [ "${KEEP_WT:-}" != 1 ] && [ -n "${WT:-}" ]; then
    if [ -n "${ROOT:-}" ] && [ -e "$ROOT/.git" ]; then
      git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null || true
      git -C "$ROOT" worktree prune || true
    fi
    rm -rf "$WT" 2>/dev/null || true
  fi
  if [ -n "${HOOKS:-}" ]; then
    rm -rf "$HOOKS" 2>/dev/null || true
  fi
  exit "$status"
}
trap cleanup EXIT

usage() {
  echo "用法：gate-pr.sh <change-dir> <PR#>｜gate-pr.sh <change-dir> --head"
  exit 2
}

env_has() {
  python3 -c 'import os, sys; sys.exit(0 if sys.argv[1] in os.environ else 1)' "$1"
}

env_get() {
  python3 -c 'import os, sys; sys.stdout.write(os.environ.get(sys.argv[1], ""))' "$1"
}

note_keep() {
  if [ "${KEEP_WT:-}" = 1 ] && [ -n "${WT:-}" ]; then
    printf 'KEEP_WT %s\n' "$WT"
  fi
}

# SHARE_DIRS 的 <dir>/node_modules 若指回 <dir>（計畫裡的 node_modules/node_modules），
# 先刪再 symlink 或複製，避免把這個環帶進 worktree。
is_self_link() {
  python3 - "$1" "$2" <<'PY'
import os, sys
link, directory = sys.argv[1], sys.argv[2]
if not os.path.islink(link):
    raise SystemExit(1)
target = os.readlink(link)
if not os.path.isabs(target):
    target = os.path.join(os.path.dirname(link), target)
raise SystemExit(0 if os.path.normpath(target) == os.path.normpath(directory) else 1)
PY
}

copy_tree() {
  src=$1
  dest=$2
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  # macOS 的 cp -c 是 clonefile；Linux 的 cp 沒有 -c，退回一般複製。
  if cp -cR "$src" "$dest" 2>/dev/null; then
    return 0
  fi
  rm -rf "$dest"
  cp -R "$src" "$dest"
}

link_tree() {
  src=$1
  dest=$2
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  ln -s "$src" "$dest"
}

if [ "$#" -ne 2 ] || [ -z "$1" ] || [ -z "$2" ]; then
  usage
fi

case "$2" in
  --head) mode=head; pr= ;;
  *) mode=pr; pr=$2 ;;
esac

CHANGE=$(CDPATH= cd -- "$1" && pwd) || {
  echo "缺 change-dir：$1"
  exit 2
}
ROOT=$(CDPATH= cd -- "$CHANGE/../../.." && pwd) || {
  echo "無法定位主 repo：$CHANGE"
  exit 2
}
if [ ! -e "$ROOT/.git" ]; then
  echo "主 repo 不是 git 目錄：$ROOT"
  exit 2
fi

# 清掉呼叫端殘留的 GATE_*，只認這份 gate.env。
n=1
while [ "$n" -le 100 ]; do
  unset "GATE_$n" || true
  n=$((n + 1))
done
unset BASE GATE_TIMEOUT SHARE_DIRS SCHEMA_GLOB || true

ENVFILE=$CHANGE/gate.env
if [ ! -f "$ENVFILE" ]; then
  echo "缺 gate.env：$ENVFILE"
  exit 2
fi
set -a
. "$ENVFILE"
set +a

miss=0
if ! env_has BASE || [ -z "$(env_get BASE)" ]; then
  echo "缺 BASE"
  miss=1
fi
if ! env_has GATE_1 || [ -z "$(env_get GATE_1)" ]; then
  echo "缺 GATE_1"
  miss=1
fi
if [ "$mode" = pr ] && ! command -v gh >/dev/null 2>&1; then
  echo "缺 gh"
  miss=1
fi
if [ "$miss" -ne 0 ]; then
  exit 2
fi

BASE=$(env_get BASE)
# 沒設 GATE_TIMEOUT 時是 900 秒。
if env_has GATE_TIMEOUT && [ -n "$(env_get GATE_TIMEOUT)" ]; then
  timeout=$(env_get GATE_TIMEOUT)
else
  timeout=900
fi
case "$timeout" in
  *[!0-9]*|0)
    echo "GATE_TIMEOUT 不是正整數：$timeout"
    exit 2
    ;;
esac
share_dirs=
if env_has SHARE_DIRS; then
  share_dirs=$(env_get SHARE_DIRS)
fi
schema=
if env_has SCHEMA_GLOB; then
  schema=$(env_get SCHEMA_GLOB)
fi

base_ref=
head_ref=
pr_files=
if [ "$mode" = pr ]; then
  json=$(gh pr view "$pr" --json baseRefName,headRefName,files) || {
    echo "無法讀 PR #$pr"
    exit 1
  }
  parsed=$(printf '%s\n' "$json" | python3 -c '
import json, sys
d = json.load(sys.stdin)
base = d.get("baseRefName") or ""
head = d.get("headRefName") or ""
files = d.get("files") or []
paths = []
for item in files:
    if isinstance(item, dict):
        paths.append(item.get("path") or "")
    elif isinstance(item, str):
        paths.append(item)
sys.stdout.write(base + "\n" + head + "\n" + "\n".join(paths))
') || {
    echo "無法解析 PR #$pr"
    exit 1
  }
  base_ref=$(printf '%s\n' "$parsed" | sed -n '1p')
  head_ref=$(printf '%s\n' "$parsed" | sed -n '2p')
  pr_files=$(printf '%s\n' "$parsed" | sed -n '3,$p')
  if [ "$base_ref" != "$BASE" ]; then
    printf 'base 不符：PR #%s 的 baseRefName 是 %s，BASE 是 %s\n' "$pr" "$base_ref" "$BASE"
    exit 4
  fi
  if [ -z "$head_ref" ]; then
    echo "無法讀 PR #$pr 的 headRefName"
    exit 1
  fi
fi

LOGDIR=$(mktemp -d "${TMPDIR:-/tmp}/gate-pr-log.XXXXXX")
HOOKS=$(mktemp -d "${TMPDIR:-/tmp}/gate-pr-hooks.XXXXXX")

if ! git -C "$ROOT" fetch origin "$BASE" >"$LOGDIR/fetch-base.log" 2>&1; then
  echo "無法取得 origin/$BASE"
  cat "$LOGDIR/fetch-base.log"
  exit 1
fi
if [ "$mode" = pr ]; then
  if ! git -C "$ROOT" fetch origin "$head_ref" >"$LOGDIR/fetch-head.log" 2>&1; then
    echo "無法取得 origin/$head_ref"
    cat "$LOGDIR/fetch-head.log"
    exit 1
  fi
fi

WT=$(mktemp -d "${TMPDIR:-/tmp}/gate-pr.XXXXXX")
rmdir "$WT"
# 空的 hooks 目錄：試合併與 worktree 不跑使用者的 hook，避免動到主工作目錄。
if ! git -C "$ROOT" -c core.hooksPath="$HOOKS" worktree add --detach "$WT" "origin/$BASE" \
    >"$LOGDIR/worktree.log" 2>&1; then
  echo "無法建立 worktree"
  cat "$LOGDIR/worktree.log"
  exit 1
fi

if [ "$mode" = pr ]; then
  if ! git -C "$WT" \
      -c user.email=gate@local \
      -c user.name=gate \
      -c commit.gpgsign=false \
      -c core.hooksPath="$HOOKS" \
      merge --no-edit "origin/$head_ref" >"$LOGDIR/merge.log" 2>&1; then
    conflicts=$(git -C "$WT" diff --name-only --diff-filter=U || true)
    if [ -n "$conflicts" ]; then
      note_keep
      echo "GATE CONFLICT"
      printf '%s\n' "$conflicts"
      exit 3
    fi
    note_keep
    echo "試合併失敗"
    cat "$LOGDIR/merge.log"
    exit 1
  fi
fi

copy_mode=0
if [ "$mode" = pr ] && [ -n "$schema" ] && [ -n "$pr_files" ]; then
  if printf '%s\n' "$pr_files" | python3 -c '
import fnmatch, sys
pattern = sys.argv[1]
paths = [ln for ln in sys.stdin.read().splitlines() if ln]
for path in paths:
    if fnmatch.fnmatchcase(path, pattern):
        raise SystemExit(0)
raise SystemExit(1)
' "$schema"; then
    copy_mode=1
  fi
fi

set -f
for rel in $share_dirs; do
  [ -n "$rel" ] || continue
  src=$ROOT/$rel
  dest=$WT/$rel
  if [ -d "$src" ] || [ -L "$src" ]; then
    link=$src/node_modules
    if [ -L "$link" ] && is_self_link "$link" "$src"; then
      rm "$link"
      printf 'SHARE 移除自指 symlink：%s/node_modules\n' "$rel"
    fi
  fi
  if [ ! -e "$src" ] && [ ! -L "$src" ]; then
    continue
  fi
  if [ "$copy_mode" -eq 1 ]; then
    copy_tree "$src" "$dest"
  else
    link_tree "$src" "$dest"
  fi
done
set +f

n=1
reds=
while env_has "GATE_$n"; do
  cmd=$(env_get "GATE_$n")
  log=$LOGDIR/GATE_$n.log
  # 逾時一律 perl alarm。後面的 rc= 讓 dash 不要 exec 掉這層 sh，
  # 「Alarm clock」才會留在 log，不會冒到摘要。
  set +e
  sh -c 'cd "$1" || exit 1
perl -e "alarm shift; exec @ARGV" "$2" sh -c "$3"
rc=$?
exit $rc' _ "$WT" "$timeout" "$cmd" >"$log" 2>&1
  rc=$?
  set -e
  printf 'GATE_%s exit=%s %s\n' "$n" "$rc" "$cmd"
  if [ "$rc" -ne 0 ]; then
    if [ -n "$reds" ]; then
      reds=$reds,$n
    else
      reds=$n
    fi
  fi
  n=$((n + 1))
done

printf 'LOG %s\n' "$LOGDIR"
note_keep
if [ -n "$reds" ]; then
  printf 'GATE RED %s\n' "$reds"
  exit 1
fi
echo "GATE GREEN"
exit 0
