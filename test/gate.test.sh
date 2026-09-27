#!/bin/sh
# tools/gate.sh 的 smoke test：綠、紅（紅了後面照跑）、衝突、hook 不誤判、逾時、缺 gate.env、worktree 有清掉。
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✔ $1"; else echo "  ✘ $1（要 $3，得 $2）"; FAIL=1; fi; }
g() { git -c user.name=t -c user.email=t@t "$@" >/dev/null 2>&1; }
git init -q --bare "$TMP/origin.git"; git clone -q "$TMP/origin.git" "$TMP/r" 2>/dev/null; cd "$TMP/r" || exit 1
echo a > f; mkdir -p c; g add f; g commit -m base; g push origin HEAD:main
g switch -c ok; echo b > g; g add g; g commit -m ok; g push origin HEAD:refs/pull/1/head
g switch main; g switch -c bad; echo x > f; g add f; g commit -m bad; g push origin HEAD:refs/pull/2/head
g switch main; echo y > f; g add f; g commit -m drift; g push origin HEAD:main
printf "GATE_1='test -f g'\n" > c/gate.env
sh "$ROOT/tools/gate.sh" c 1 >/dev/null 2>&1; check "綠 → 0" $? 0
printf "GATE_1='false'\nGATE_2='touch \"$TMP/ran2\"'\n" > c/gate.env
sh "$ROOT/tools/gate.sh" c 1 >/dev/null 2>&1; check "紅 → 1" $? 1
check "紅了後面照跑" "$(test -f "$TMP/ran2" && echo y)" y
sh "$ROOT/tools/gate.sh" c 2 >/dev/null 2>&1; check "衝突 → 3" $? 3
printf '#!/bin/sh\nexit 1\n' > .git/hooks/pre-merge-commit; chmod +x .git/hooks/pre-merge-commit
printf "GATE_1='true'\n" > c/gate.env
sh "$ROOT/tools/gate.sh" c 1 >/dev/null 2>&1; check "repo 的 git hook 不影響試合併 → 0" $? 0
printf "GATE_TIMEOUT=1\nGATE_1='(sleep 3; touch \"$TMP/orphan\") & wait'\n" > c/gate.env
sh "$ROOT/tools/gate.sh" c 1 >/dev/null 2>&1; check "逾時 → 1" $? 1
sleep 4; check "逾時整組殺、不留孤兒" "$(test -f "$TMP/orphan" && echo y)" ""
sh "$ROOT/tools/gate.sh" nope 1 >/dev/null 2>&1; check "缺 gate.env → 2" $? 2
check "worktree 已清" "$(git worktree list | wc -l | tr -d ' ')" 1
check "refs/gate 已清" "$(git for-each-ref refs/gate | wc -l | tr -d ' ')" 0
exit $FAIL
