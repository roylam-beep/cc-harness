#!/bin/sh
# gate-pr.sh「試合併跑閘」九個 Scenario，各至少一項。
# 不連網、不用真的 gh：PATH 最前面放假 gh，origin 是本機 bare repo。
# cp -c 的退路：假 cp 拒掉 -cR，再確認腳本改走 cp -R（Linux 上真的 cp 也會走這條）。
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
PASS=0
BASE_NAME=integration/line
ORIG_PATH=$PATH
GLOBAL_SIGN=$(git config --global --get commit.gpgsign || true)
ok() { PASS=$((PASS + 1)); echo "  ✔ $1"; }
bad() { FAIL=1; echo "  ✘ $1"; }

sh -n "$ROOT/tools/gate-pr.sh"

make_repo() {
  dir=$1
  mkdir -p "$dir"
  git init --bare "$dir/origin.git" >/dev/null 2>&1
  git init "$dir/repo" >/dev/null 2>&1
  git -C "$dir/repo" symbolic-ref HEAD "refs/heads/$BASE_NAME"
  git -C "$dir/repo" config user.email test@local
  git -C "$dir/repo" config user.name test
  git -C "$dir/repo" config commit.gpgsign false
  printf 'init\n' > "$dir/repo/README"
  git -C "$dir/repo" add README
  git -C "$dir/repo" commit -m init >/dev/null
  git -C "$dir/repo" remote add origin "$dir/origin.git"
  git -C "$dir/repo" push -u origin "$BASE_NAME" >/dev/null 2>&1
  mkdir -p "$dir/repo/docs/changes/demo"
}

# 分支已存在就切過去；沒有就從目前 HEAD 開。呼叫順序決定分叉點。
commit_on() {
  repo=$1
  branch=$2
  file=$3
  content=$4
  msg=$5
  if git -C "$repo" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$repo" checkout "$branch" >/dev/null 2>&1
  else
    git -C "$repo" checkout -b "$branch" >/dev/null 2>&1
  fi
  mkdir -p "$(dirname "$repo/$file")"
  printf '%s\n' "$content" > "$repo/$file"
  git -C "$repo" add "$file"
  git -C "$repo" commit -m "$msg" >/dev/null
  git -C "$repo" push -u origin "$branch" >/dev/null 2>&1
}

install_gh() {
  bin=$1
  mkdir -p "$bin"
  cat > "$bin/gh" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "${FAKE_GH_LOG:?}"
[ "$1" = "pr" ] && [ "$2" = "view" ] && [ "$4" = "--json" ] || {
  echo "unexpected gh: $*" >&2
  exit 1
}
case "$5" in
  *baseRefName*headRefName*files*) ;;
  *) echo "bad json fields: $5" >&2; exit 1 ;;
esac
python3 - "$3" <<'PY'
import json, os, sys
files = [p for p in os.environ.get("FAKE_GH_FILES", "").split() if p]
json.dump({
    "baseRefName": os.environ.get("FAKE_GH_BASE", ""),
    "headRefName": os.environ.get("FAKE_GH_HEAD", ""),
    "files": [{"path": p, "additions": 1, "deletions": 0} for p in files],
}, sys.stdout)
PY
EOF
  chmod +x "$bin/gh"
}

install_cp() {
  bin=$1
  log=$2
  real=$(command -v cp)
  cat > "$bin/cp" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$log"
for arg in "\$@"; do
  case "\$arg" in
    -cR|-c) exit 1 ;;
  esac
done
exec $real "\$@"
EOF
  chmod +x "$bin/cp"
}

run_gate() {
  change=$1
  arg=$2
  set +e
  OUT=$(cd /tmp && TMPDIR="$TMP" /bin/sh "$ROOT/tools/gate-pr.sh" "$change" "$arg" 2>&1)
  RC=$?
  set -e
}

snap() {
  repo=$1
  SNAP_POR=$(git -C "$repo" status --porcelain)
  SNAP_HEAD=$(git -C "$repo" rev-parse HEAD)
  SNAP_BR=$(git -C "$repo" rev-parse --abbrev-ref HEAD)
  SNAP_WT=$(git -C "$repo" worktree list)
}

same_snap() {
  repo=$1
  label=$2
  por=$(git -C "$repo" status --porcelain)
  head=$(git -C "$repo" rev-parse HEAD)
  br=$(git -C "$repo" rev-parse --abbrev-ref HEAD)
  wt=$(git -C "$repo" worktree list)
  if [ "$por" = "$SNAP_POR" ] && [ "$head" = "$SNAP_HEAD" ] \
      && [ "$br" = "$SNAP_BR" ] && [ "$wt" = "$SNAP_WT" ]; then
    return 0
  fi
  echo "  變了 $label"
  echo "  por before=[$SNAP_POR] after=[$por]"
  echo "  head $SNAP_HEAD -> $head  br $SNAP_BR -> $br"
  echo "  wt before=[$SNAP_WT]"
  echo "  wt after=[$wt]"
  return 1
}

drop_keep() {
  repo=$1
  wt=$(printf '%s\n' "$OUT" | sed -n 's/^KEEP_WT //p')
  if [ -n "$wt" ]; then
    git -C "$repo" worktree remove --force "$wt" >/dev/null 2>&1 || true
    git -C "$repo" worktree prune >/dev/null 2>&1 || true
  fi
  unset KEEP_WT
}

install_gh "$TMP/bin"
PATH="$TMP/bin:$ORIG_PATH"

# ── 1. 全綠 ──
d1=$TMP/s1
make_repo "$d1"
commit_on "$d1/repo" cursor/pr from-pr pr-side pr
commit_on "$d1/repo" "$BASE_NAME" from-base base-side base
# 簽章故意壞掉：試合併必須用 -c commit.gpgsign=false，不能改這份設定。
git -C "$d1/repo" config commit.gpgsign true
git -C "$d1/repo" config gpg.format ssh
git -C "$d1/repo" config gpg.ssh.program /nonexistent/sign-binary
for hook in post-checkout post-merge; do
  cat > "$d1/repo/.git/hooks/$hook" <<EOF
#!/bin/sh
echo ran >> "$d1/hook-ran"
EOF
  chmod +x "$d1/repo/.git/hooks/$hook"
done
cat > "$d1/repo/docs/changes/demo/gate.env" <<EOF
# 註解應可被 source
BASE=$BASE_NAME
GATE_1='git log -1 --format=%ae | grep -qx gate@local && git log -1 --format=%an | grep -qx gate && test -f from-pr && test -f from-base'
GATE_2='true'
EOF
FAKE_GH_LOG=$d1/gh.log
FAKE_GH_BASE=$BASE_NAME
FAKE_GH_HEAD=cursor/pr
FAKE_GH_FILES=from-pr
export FAKE_GH_LOG FAKE_GH_BASE FAKE_GH_HEAD FAKE_GH_FILES
snap "$d1/repo"
mkdir -p "$d1/home"
saved_home=$HOME
HOME=$d1/home
GIT_CONFIG_GLOBAL=$d1/home/.gitconfig
GIT_CONFIG_SYSTEM=/dev/null
export HOME GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM
run_gate "$d1/repo/docs/changes/demo" 12
HOME=$saved_home
export HOME
unset GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM
logdir=$(printf '%s\n' "$OUT" | sed -n 's/^LOG //p')
last=$(printf '%s\n' "$OUT" | tail -n 1)
if [ "$RC" -eq 0 ] \
    && [ "$last" = "GATE GREEN" ] \
    && echo "$OUT" | grep -q 'GATE_1 exit=0 ' \
    && echo "$OUT" | grep -q 'GATE_2 exit=0 true' \
    && [ -f "$logdir/GATE_1.log" ] \
    && [ ! -f "$d1/hook-ran" ] \
    && [ ! -f "$d1/home/.gitconfig" ] \
    && [ "$(git -C "$d1/repo" config --local --get commit.gpgsign)" = "true" ] \
    && grep -q 'pr view 12 --json baseRefName,headRefName,files' "$d1/gh.log" \
    && grep -q 'user.email=gate@local' "$ROOT/tools/gate-pr.sh" \
    && grep -q 'user.name=gate' "$ROOT/tools/gate-pr.sh" \
    && ! grep -q 'git config' "$ROOT/tools/gate-pr.sh" \
    && same_snap "$d1/repo" "全綠"; then
  ok "全綠：試合併、作者 gate@local、沒跑 hook、沒寫 git 設定"
else
  bad "全綠 rc=$RC last=$last / $OUT"
fi

# ── 2. 有紅也跑完 ──
d2=$TMP/s2
make_repo "$d2"
commit_on "$d2/repo" cursor/pr added-by-pr yes pr
cat > "$d2/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_1='echo out1; echo err1 >&2; exit 3'
GATE_2='echo out2'
GATE_3='echo out3; exit 4'
EOF
FAKE_GH_LOG=$d2/gh.log
FAKE_GH_BASE=$BASE_NAME
FAKE_GH_HEAD=cursor/pr
FAKE_GH_FILES=added-by-pr
export FAKE_GH_LOG FAKE_GH_BASE FAKE_GH_HEAD FAKE_GH_FILES
snap "$d2/repo"
run_gate "$d2/repo/docs/changes/demo" 7
logdir=$(printf '%s\n' "$OUT" | sed -n 's/^LOG //p')
last=$(printf '%s\n' "$OUT" | tail -n 1)
if [ "$RC" -eq 1 ] \
    && [ "$last" = "GATE RED 1,3" ] \
    && echo "$OUT" | grep -q 'GATE_1 exit=3 ' \
    && echo "$OUT" | grep -q 'GATE_2 exit=0 echo out2' \
    && echo "$OUT" | grep -q 'GATE_3 exit=4 ' \
    && grep -q out1 "$logdir/GATE_1.log" \
    && grep -q err1 "$logdir/GATE_1.log" \
    && grep -q out2 "$logdir/GATE_2.log" \
    && same_snap "$d2/repo" "有紅"; then
  ok "有紅也跑完：GATE RED 1,3，log 留完整輸出"
else
  bad "有紅也跑完 rc=$RC last=$last / $OUT"
fi

# ── 3. 衝突 ──
d3=$TMP/s3
make_repo "$d3"
commit_on "$d3/repo" conflict-pr README pr-side prside
commit_on "$d3/repo" "$BASE_NAME" README base-side baseside
cat > "$d3/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_1='echo ran > $d3/ran'
EOF
FAKE_GH_LOG=$d3/gh.log
FAKE_GH_BASE=$BASE_NAME
FAKE_GH_HEAD=conflict-pr
FAKE_GH_FILES=README
export FAKE_GH_LOG FAKE_GH_BASE FAKE_GH_HEAD FAKE_GH_FILES
snap "$d3/repo"
run_gate "$d3/repo/docs/changes/demo" 7
if [ "$RC" -eq 3 ] \
    && echo "$OUT" | grep -q '^GATE CONFLICT$' \
    && echo "$OUT" | grep -qx 'README' \
    && ! echo "$OUT" | grep -q '^GATE_1 ' \
    && [ ! -f "$d3/ran" ] \
    && same_snap "$d3/repo" "衝突"; then
  ok "衝突：GATE CONFLICT、不跑閘、退出碼 3"
else
  bad "衝突 rc=$RC / $OUT"
fi

# ── 4. base 不符 ──
d4=$TMP/s4
make_repo "$d4"
cat > "$d4/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_1='echo ran > $d4/ran'
EOF
wt_before=$(git -C "$d4/repo" worktree list)
FAKE_GH_LOG=$d4/gh.log
FAKE_GH_BASE=main
FAKE_GH_HEAD=cursor/pr
FAKE_GH_FILES=
export FAKE_GH_LOG FAKE_GH_BASE FAKE_GH_HEAD FAKE_GH_FILES
# 假 git 把參數記下來再 exec 真的 git。事後對 worktree list 看不出「曾經 add」。
mkdir -p "$d4/bin"
real_git=$(command -v git)
cat > "$d4/bin/git" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$d4/git.log"
exec $real_git "\$@"
EOF
chmod +x "$d4/bin/git"
: > "$d4/git.log"
saved_path=$PATH
PATH="$d4/bin:$PATH"
if [ "$(command -v git)" != "$d4/bin/git" ]; then
  bad "base 不符：PATH 沒有用到假 git"
fi
run_gate "$d4/repo/docs/changes/demo" 7
PATH=$saved_path
wt_after=$(git -C "$d4/repo" worktree list)
if [ "$RC" -eq 4 ] \
    && echo "$OUT" | grep -q 'base 不符' \
    && echo "$OUT" | grep -q 'main' \
    && echo "$OUT" | grep -q "$BASE_NAME" \
    && [ "$wt_before" = "$wt_after" ] \
    && [ ! -f "$d4/ran" ] \
    && ! echo "$OUT" | grep -q '^LOG ' \
    && ! grep -F -q 'worktree add' "$d4/git.log"; then
  ok "base 不符：退出碼 4、不建 worktree"
else
  bad "base 不符 rc=$RC / $OUT"
fi

# ── 5. 設定缺漏 ──
d5=$TMP/s5
make_repo "$d5"
run_gate "$d5/repo/docs/changes/demo" 7
if [ "$RC" -eq 2 ] && echo "$OUT" | grep -q '缺 gate.env'; then
  ok "缺 gate.env：退出碼 2"
else
  bad "缺 gate.env rc=$RC / $OUT"
fi

printf '%s\n' '# 只有註解' 'SHARE_DIRS=node_modules' > "$d5/repo/docs/changes/demo/gate.env"
run_gate "$d5/repo/docs/changes/demo" 7
if [ "$RC" -eq 2 ] \
    && echo "$OUT" | grep -qx '缺 BASE' \
    && echo "$OUT" | grep -qx '缺 GATE_1'; then
  ok "缺 BASE 與 GATE_1：退出碼 2"
else
  bad "缺 BASE/GATE_1 rc=$RC / $OUT"
fi

cat > "$d5/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_1='true'
EOF
saved_path=$PATH
mkdir -p "$TMP/nogh"
ln -s "$(command -v python3)" "$TMP/nogh/python3"
ln -s /bin/sh "$TMP/nogh/sh"
PATH=$TMP/nogh
run_gate "$d5/repo/docs/changes/demo" 7
PATH=$saved_path
if [ "$RC" -eq 2 ] && echo "$OUT" | grep -qx '缺 gh' \
    && ! echo "$OUT" | grep -q '缺 BASE'; then
  ok "PR 模式沒有 gh：退出碼 2"
else
  bad "缺 gh rc=$RC / $OUT"
fi

cat > "$d5/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
EOF
PATH=/usr/bin:/bin
run_gate "$d5/repo/docs/changes/demo" --head
PATH=$saved_path
if [ "$RC" -eq 2 ] && echo "$OUT" | grep -qx '缺 GATE_1' \
    && ! echo "$OUT" | grep -q '缺 gh'; then
  ok "--head 缺 GATE_1 時不要求 gh"
else
  bad "--head 缺設定 rc=$RC / $OUT"
fi

# ── 6. 單條逾時 ──
d6=$TMP/s6
make_repo "$d6"
cat > "$d6/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_TIMEOUT=1
GATE_1='exec perl -e "sleep 15"'
GATE_2='echo second > $d6/second'
EOF
start=$(date +%s)
snap "$d6/repo"
run_gate "$d6/repo/docs/changes/demo" --head
end=$(date +%s)
elapsed=$((end - start))
last=$(printf '%s\n' "$OUT" | tail -n 1)
if [ "$RC" -eq 1 ] \
    && [ "$last" = "GATE RED 1" ] \
    && echo "$OUT" | grep -q 'GATE_2 exit=0 ' \
    && [ -f "$d6/second" ] \
    && [ "$elapsed" -lt 8 ] \
    && same_snap "$d6/repo" "逾時"; then
  ok "單條逾時：該條記紅，其餘照跑（${elapsed}s）"
else
  bad "逾時 rc=$RC elapsed=$elapsed / $OUT"
fi
# 假 perl 把參數記下來再 exec 真的 perl，對 alarm 的秒數，不 grep 原始碼。
d6b=$TMP/s6b
make_repo "$d6b"
mkdir -p "$d6b/bin"
real_perl=$(command -v perl)
cat > "$d6b/bin/perl" <<EOF
#!/bin/sh
{
  echo ---
  printf '%s\n' "\$@"
} >> "$d6b/perl.log"
exec $real_perl "\$@"
EOF
chmod +x "$d6b/bin/perl"
alarm_secs() {
  awk 'f { print; f = 0 } $0 == "alarm shift; exec @ARGV" { f = 1 }' "$1"
}
cat > "$d6b/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_1='true'
EOF
: > "$d6b/perl.log"
saved_path=$PATH
PATH="$d6b/bin:$PATH"
run_gate "$d6b/repo/docs/changes/demo" --head
PATH=$saved_path
secs=$(alarm_secs "$d6b/perl.log")
if [ "$RC" -eq 0 ] && [ "$secs" = 900 ]; then
  ok "沒設 GATE_TIMEOUT 時 alarm 是 900"
else
  bad "預設逾時 rc=$RC secs=[$secs] / $OUT"
fi
cat > "$d6b/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_TIMEOUT=7
GATE_1='true'
EOF
: > "$d6b/perl.log"
PATH="$d6b/bin:$PATH"
run_gate "$d6b/repo/docs/changes/demo" --head
PATH=$saved_path
secs=$(alarm_secs "$d6b/perl.log")
if [ "$RC" -eq 0 ] && [ "$secs" = 7 ]; then
  ok "GATE_TIMEOUT=7 時 alarm 是 7"
else
  bad "GATE_TIMEOUT=7 rc=$RC secs=[$secs] / $OUT"
fi

# ── 7. 共用依賴目錄 ──
ignore_nm() {
  repo=$1
  if [ ! -f "$repo/.gitignore" ]; then
    printf 'node_modules\n' > "$repo/.gitignore"
    git -C "$repo" add .gitignore
    git -C "$repo" commit -m ignore >/dev/null
    git -C "$repo" push origin "$BASE_NAME" >/dev/null 2>&1
  fi
}

d7=$TMP/s7
make_repo "$d7"
ignore_nm "$d7/repo"
mkdir -p "$d7/repo/node_modules/pkg" "$d7/repo/api/node_modules/pkg"
printf 'shared\n' > "$d7/repo/node_modules/pkg/marker"
printf 'api\n' > "$d7/repo/api/node_modules/pkg/marker"
# 指回自己的巢狀 link 要刪；指向上一層的不該動。
ln -s . "$d7/repo/node_modules/node_modules"
ln -s . "$d7/repo/api/node_modules/node_modules"
ln -s .. "$d7/repo/node_modules/up"
commit_on "$d7/repo" cursor/pr from-pr yes pr
cat > "$d7/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
SHARE_DIRS='node_modules api/node_modules'
SCHEMA_GLOB='db/*.prisma'
GATE_1='test -L node_modules && test -L api/node_modules && test ! -L node_modules/node_modules && test -L node_modules/up && grep -q shared node_modules/pkg/marker'
EOF
FAKE_GH_LOG=$d7/gh.log
FAKE_GH_BASE=$BASE_NAME
FAKE_GH_HEAD=cursor/pr
FAKE_GH_FILES=from-pr
export FAKE_GH_LOG FAKE_GH_BASE FAKE_GH_HEAD FAKE_GH_FILES
KEEP_WT=1
export KEEP_WT
snap "$d7/repo"
run_gate "$d7/repo/docs/changes/demo" 7
wt=$(printf '%s\n' "$OUT" | sed -n 's/^KEEP_WT //p')
if [ "$RC" -eq 0 ] \
    && echo "$OUT" | grep -qx 'SHARE 移除自指 symlink：node_modules/node_modules' \
    && echo "$OUT" | grep -qx 'SHARE 移除自指 symlink：api/node_modules/node_modules' \
    && [ ! -L "$d7/repo/node_modules/node_modules" ] \
    && [ ! -e "$d7/repo/node_modules/node_modules" ] \
    && [ -L "$d7/repo/node_modules/up" ] \
    && [ -n "$wt" ] \
    && [ "$(CDPATH= cd -- "$(readlink "$wt/node_modules")" && pwd)" = "$(CDPATH= cd -- "$d7/repo/node_modules" && pwd)" ] \
    && [ "$(CDPATH= cd -- "$(readlink "$wt/api/node_modules")" && pwd)" = "$(CDPATH= cd -- "$d7/repo/api/node_modules" && pwd)" ]; then
  ok "SHARE_DIRS 以 symlink 指回主 repo，自指 link 先刪"
else
  bad "symlink 共用 rc=$RC / $OUT"
fi
drop_keep "$d7/repo"

# schema 命中改複製，而且自指 link 要在複製前刪掉，複本才不會帶著它。
d7b=$TMP/s7b
make_repo "$d7b"
ignore_nm "$d7b/repo"
mkdir -p "$d7b/repo/node_modules/pkg"
printf 'shared\n' > "$d7b/repo/node_modules/pkg/marker"
ln -s "$d7b/repo/node_modules" "$d7b/repo/node_modules/node_modules"
commit_on "$d7b/repo" cursor/pr db/schema.prisma 'model X {}' schema
cat > "$d7b/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
SHARE_DIRS='node_modules'
SCHEMA_GLOB='db/*.prisma'
GATE_1='test ! -L node_modules && test ! -e node_modules/node_modules && test -f node_modules/pkg/marker && echo dirty >> node_modules/pkg/marker && test -f db/schema.prisma'
EOF
FAKE_GH_LOG=$d7b/gh.log
FAKE_GH_BASE=$BASE_NAME
FAKE_GH_HEAD=cursor/pr
FAKE_GH_FILES='db/schema.prisma'
export FAKE_GH_LOG FAKE_GH_BASE FAKE_GH_HEAD FAKE_GH_FILES
snap "$d7b/repo"
run_gate "$d7b/repo/docs/changes/demo" 7
marker=$(cat "$d7b/repo/node_modules/pkg/marker")
if [ "$RC" -eq 0 ] \
    && [ "$marker" = "shared" ] \
    && [ ! -L "$d7b/repo/node_modules/node_modules" ] \
    && echo "$OUT" | grep -qx 'SHARE 移除自指 symlink：node_modules/node_modules' \
    && same_snap "$d7b/repo" "複製"; then
  ok "SCHEMA_GLOB 命中改複製，且先刪自指 link"
else
  bad "複製共用 rc=$RC marker=[$marker] / $OUT"
fi

# 假 cp 拒 -cR，逼出 cp -R 退路（macOS 上真的 cp -c 會成功，所以要這條）。
d7c=$TMP/s7c
make_repo "$d7c"
ignore_nm "$d7c/repo"
mkdir -p "$d7c/repo/node_modules"
printf 'shared\n' > "$d7c/repo/node_modules/marker"
commit_on "$d7c/repo" cursor/pr db/schema.prisma 'model Y {}' schema
cat > "$d7c/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
SHARE_DIRS='node_modules'
SCHEMA_GLOB='db/*.prisma'
GATE_1='test ! -L node_modules && grep -q shared node_modules/marker'
EOF
install_cp "$TMP/bin" "$d7c/cp.log"
FAKE_GH_LOG=$d7c/gh.log
FAKE_GH_BASE=$BASE_NAME
FAKE_GH_HEAD=cursor/pr
FAKE_GH_FILES='db/schema.prisma'
export FAKE_GH_LOG FAKE_GH_BASE FAKE_GH_HEAD FAKE_GH_FILES
snap "$d7c/repo"
run_gate "$d7c/repo/docs/changes/demo" 7
rm -f "$TMP/bin/cp"
if [ "$RC" -eq 0 ] \
    && grep -F -q -- '-cR' "$d7c/cp.log" \
    && grep -E -q '^-R ' "$d7c/cp.log" \
    && same_snap "$d7c/repo" "cp 退路"; then
  ok "cp -cR 不支援時退回 cp -R"
else
  bad "cp 退路 rc=$RC log=$(cat "$d7c/cp.log" 2>/dev/null) / $OUT"
fi

# ── 8. 只驗 HEAD ──
d8=$TMP/s8
make_repo "$d8"
printf 'local-only\n' > "$d8/repo/local-only"
git -C "$d8/repo" add local-only
git -C "$d8/repo" commit -m local-only >/dev/null
git clone --quiet --branch "$BASE_NAME" "$d8/origin.git" "$d8/other"
git -C "$d8/other" config user.email test@local
git -C "$d8/other" config user.name test
git -C "$d8/other" config commit.gpgsign false
printf 'fresh\n' > "$d8/other/fresh-marker"
git -C "$d8/other" add fresh-marker
git -C "$d8/other" commit -m fresh >/dev/null
git -C "$d8/other" push origin "$BASE_NAME" >/dev/null 2>&1
cat > "$d8/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_1='test -f fresh-marker && test ! -f local-only'
EOF
mkdir -p "$d8/bomb"
cat > "$d8/bomb/gh" <<'EOF'
#!/bin/sh
echo called >> "${FAKE_GH_LOG:?}"
exit 9
EOF
chmod +x "$d8/bomb/gh"
FAKE_GH_LOG=$d8/gh.log
export FAKE_GH_LOG
saved_path=$PATH
PATH="$d8/bomb:$ORIG_PATH"
snap "$d8/repo"
run_gate "$d8/repo/docs/changes/demo" --head
PATH=$saved_path
if [ "$RC" -eq 0 ] \
    && echo "$OUT" | grep -q 'GATE GREEN' \
    && [ ! -f "$d8/gh.log" ] \
    && [ ! -f "$d8/repo/fresh-marker" ] \
    && [ -f "$d8/repo/local-only" ] \
    && same_snap "$d8/repo" "--head"; then
  ok "只驗 HEAD：origin/BASE 最新版，不叫 gh"
else
  bad "--head rc=$RC / $OUT"
fi

# ── 9. 主工作目錄不變（不論退出碼）──
d9=$TMP/s9
make_repo "$d9"
commit_on "$d9/repo" conflict-pr README pr-side prside
commit_on "$d9/repo" "$BASE_NAME" README base-side baseside
printf 'dirty\n' >> "$d9/repo/README"
printf 'junk\n' > "$d9/repo/junk.txt"
cat > "$d9/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_1='true'
EOF
snap "$d9/repo"
kept=0
run_gate "$d9/repo/docs/changes/demo" --head
if [ "$RC" -eq 0 ] && same_snap "$d9/repo" "exit 0"; then
  kept=$((kept + 1))
else
  echo "  exit 0 rc=$RC / $OUT"
fi

cat > "$d9/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_1='exit 1'
GATE_2='true'
EOF
run_gate "$d9/repo/docs/changes/demo" --head
if [ "$RC" -eq 1 ] && same_snap "$d9/repo" "exit 1"; then
  kept=$((kept + 1))
else
  echo "  exit 1 rc=$RC / $OUT"
fi

cat > "$d9/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_1='echo should-not > $d9/nope'
EOF
FAKE_GH_LOG=$d9/gh.log
FAKE_GH_BASE=$BASE_NAME
FAKE_GH_HEAD=conflict-pr
FAKE_GH_FILES=README
export FAKE_GH_LOG FAKE_GH_BASE FAKE_GH_HEAD FAKE_GH_FILES
run_gate "$d9/repo/docs/changes/demo" 7
if [ "$RC" -eq 3 ] && [ ! -f "$d9/nope" ] && same_snap "$d9/repo" "exit 3"; then
  kept=$((kept + 1))
else
  echo "  exit 3 rc=$RC / $OUT"
fi

FAKE_GH_BASE=main
export FAKE_GH_BASE
run_gate "$d9/repo/docs/changes/demo" 7
if [ "$RC" -eq 4 ] && same_snap "$d9/repo" "exit 4"; then
  kept=$((kept + 1))
else
  echo "  exit 4 rc=$RC / $OUT"
fi

if [ "$kept" -eq 4 ]; then
  ok "主工作目錄不變（exit 0／1／3／4），不留 worktree"
else
  bad "主工作目錄變了 kept=$kept"
fi

# 連號：GATE_3 有定義但中間缺 GATE_2，就停。
d10=$TMP/s10
make_repo "$d10"
cat > "$d10/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_1='echo yes > $d10/g1'
GATE_3='echo no > $d10/g3'
EOF
run_gate "$d10/repo/docs/changes/demo" --head
if [ "$RC" -eq 0 ] && [ -f "$d10/g1" ] && [ ! -f "$d10/g3" ] \
    && echo "$OUT" | grep -q '^GATE_1 ' \
    && ! echo "$OUT" | grep -q '^GATE_3 '; then
  ok "GATE 從 1 連號，遇到沒定義的就停"
else
  bad "連號 rc=$RC / $OUT"
fi

# ── SHARE_DIRS 含 .. 或絕對路徑：退出碼 2，不刪 worktree 外面的檔 ──
dtrav=$TMP/trav
make_repo "$dtrav"
mkdir -p "$TMP/victim" "$dtrav/victim"
printf 'keep\n' > "$TMP/victim/keep.txt"
printf 'src\n' > "$dtrav/victim/marker"
cat > "$dtrav/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
SHARE_DIRS='../victim'
GATE_1='true'
EOF
wt_before=$(git -C "$dtrav/repo" worktree list)
run_gate "$dtrav/repo/docs/changes/demo" --head
wt_after=$(git -C "$dtrav/repo" worktree list)
if [ "$RC" -eq 2 ] \
    && echo "$OUT" | grep -F -q 'SHARE_DIRS 不能是絕對路徑或含 ..：../victim' \
    && [ -f "$TMP/victim/keep.txt" ] \
    && [ ! -L "$TMP/victim" ] \
    && [ "$wt_before" = "$wt_after" ]; then
  ok "SHARE_DIRS 含 ..：退出碼 2、keep.txt 還在、不建 worktree"
else
  bad "SHARE_DIRS .. rc=$RC victim=$(ls -ld "$TMP/victim" 2>&1) / $OUT"
fi

# ── gate.env 語法錯（引號沒閉合）──
dsyn=$TMP/syn
make_repo "$dsyn"
cat > "$dsyn/repo/docs/changes/demo/gate.env" <<'EOF'
BASE=integration/line
GATE_1='false
EOF
run_gate "$dsyn/repo/docs/changes/demo" --head
if [ "$RC" -eq 2 ] \
    && echo "$OUT" | grep -F -q 'gate.env 語法錯' \
    && ! echo "$OUT" | grep -q '^GATE_1 ' \
    && ! echo "$OUT" | grep -q 'GATE GREEN'; then
  ok "gate.env 語法錯：退出碼 2、不跑閘"
else
  bad "語法錯 rc=$RC / $OUT"
fi

# ── 訊號：dash 不跑 EXIT，要靠 HUP／INT／TERM trap 先 exit ──
run_signal() {
  shell=$1
  tag=$2
  ds=$TMP/sig-$tag
  sigtmp=$ds/tmp
  make_repo "$ds"
  mkdir -p "$sigtmp"
  cat > "$ds/repo/docs/changes/demo/gate.env" <<EOF
BASE=$BASE_NAME
GATE_1='sleep 30'
EOF
  wt_before=$(git -C "$ds/repo" worktree list)
  TMPDIR="$sigtmp" perl -e '$SIG{INT}="DEFAULT"; setpgrp; exec @ARGV' \
    "$shell" "$ROOT/tools/gate-pr.sh" "$ds/repo/docs/changes/demo" --head \
    >"$ds/out" 2>&1 &
  pid=$!
  sleep 2
  ready=0
  n=0
  while [ "$n" -lt 8 ]; do
    for p in "$sigtmp"/gate-pr.*; do
      if [ -d "$p" ]; then
        ready=1
        break
      fi
    done
    [ "$ready" -eq 1 ] && break
    sleep 1
    n=$((n + 1))
  done
  # dash 的 kill 不接受 --，-$pid 才是行程群組。
  kill -TERM -"$pid" 2>/dev/null || true
  sleep 1
  kill -INT -"$pid" 2>/dev/null || true
  n=0
  while kill -0 "$pid" 2>/dev/null && [ "$n" -lt 5 ]; do
    sleep 1
    n=$((n + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL -"$pid" 2>/dev/null || true
    bad "訊號（$shell）：行程沒在訊號後結束"
    return
  fi
  wait "$pid" 2>/dev/null || true
  wt_after=$(git -C "$ds/repo" worktree list)
  left=
  for p in "$sigtmp"/gate-pr.* "$sigtmp"/gate-pr-hooks.*; do
    if [ -e "$p" ]; then
      left="${left} ${p##*/}"
    fi
  done
  if [ "$ready" -eq 1 ] && [ "$wt_before" = "$wt_after" ] && [ -z "$left" ]; then
    ok "訊號（$shell）：TERM／INT 後清掉 worktree 與暫存目錄"
  else
    bad "訊號（$shell）ready=$ready left=[$left] wt相同=$([ "$wt_before" = "$wt_after" ] && echo yes || echo no)"
    echo "  out=$(cat "$ds/out" 2>/dev/null)"
  fi
  kill -KILL -"$pid" 2>/dev/null || true
}

run_signal /bin/sh sh
if command -v dash >/dev/null 2>&1; then
  run_signal dash dash
else
  echo "  － 沒有 dash，跳過訊號測試的 dash 那次"
fi

now_sign=$(git config --global --get commit.gpgsign || true)
if [ "$now_sign" = "$GLOBAL_SIGN" ]; then
  ok "全程沒改全域 git 設定"
else
  bad "全域 commit.gpgsign 從 [$GLOBAL_SIGN] 變成 [$now_sign]"
fi

if [ "$FAIL" -eq 0 ]; then
  echo "GATE_PR OK（${PASS} 項全過）"
  exit 0
fi
echo "GATE_PR FAIL"
exit 1
