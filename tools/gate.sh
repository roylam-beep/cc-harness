#!/bin/sh
# 驗收閘：把 PR 試合進 BASE，在臨時 worktree 裡跑 gate.env 的每條 GATE_n，只看退出碼。
# 用法：sh gate.sh <change-dir> <PR#>（在 repo 根執行）
# 退出碼：0 全綠／1 有紅／2 環境錯（缺 gate.env、fetch 失敗）／3 合併衝突
CHG="$1"; PR="$2"
[ -n "$PR" ] && [ -f "$CHG/gate.env" ] || { echo "gate: 用法 gate.sh <change-dir> <PR#>，且 <change-dir>/gate.env 要存在" >&2; exit 2; }
. "$(cd "$CHG" && pwd)/gate.env" || exit 2
BASE="${BASE:-main}"; T="${GATE_TIMEOUT:-600}"
[ -n "$GATE_1" ] || { echo "gate: gate.env 沒有 GATE_1" >&2; exit 2; }
ROOT="$(pwd)"; WT="$(mktemp -d)"; L="$(mktemp -d)"
cleanup() { cd "$ROOT"; git worktree remove --force "$WT" 2>/dev/null; rm -rf "$WT" "$L"; git update-ref -d refs/gate/base; git update-ref -d refs/gate/pr; }
trap cleanup EXIT
trap 'exit 2' INT TERM
git fetch -q origin "+refs/heads/$BASE:refs/gate/base" "+refs/pull/$PR/head:refs/gate/pr" || { echo "gate: fetch $BASE 或 PR #$PR 失敗" >&2; exit 2; }
git -c core.hooksPath=/dev/null worktree add -q --detach "$WT" refs/gate/base || exit 2
cd "$WT" || exit 2
if ! git -c core.hooksPath=/dev/null -c user.name=gate -c user.email=gate@local merge -q --no-verify --no-edit refs/gate/pr >"$L/merge" 2>&1; then
  [ -n "$(git ls-files -u)" ] && { echo "gate: PR #$PR 與 $BASE 衝突，先叫 agent merge origin/$BASE"; exit 3; }
  echo "gate: 試合併失敗（不是衝突）" >&2; cat "$L/merge" >&2; exit 2
fi
RC=0; i=1
while :; do
  eval "CMD=\${GATE_$i}"
  [ -n "$CMD" ] || break
  # perl 當 timeout 用（macOS 沒有 coreutils timeout）：開新 process group，逾時整組殺，不留孤兒
  if perl -e '$t=shift; $p=fork; if(!$p){setpgrp; exec @ARGV} $SIG{ALRM}=sub{kill "TERM",-$p; print "逾時 ${t}s\n"; exit 124};
    alarm $t; waitpid $p,0; exit($? ? 1 : 0)' "$T" sh -c "$CMD" >"$L/$i" 2>&1; then
    echo "綠 GATE_$i"
  else
    echo "紅 GATE_$i：$CMD"; tail -20 "$L/$i" | sed 's/^/    /'; RC=1
  fi
  i=$((i + 1))
done
exit $RC
