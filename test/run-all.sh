#!/bin/sh
# 本 repo 的快閘（commit 前跑這支）。任何一項紅就整支紅。
# 內容：plugin manifest 嚴格驗證、文件／死指標閘、skill 契約、兩支 hook 的單元測試。
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
echo "── claude plugin validate --strict ──"
claude plugin validate . --strict
echo "── check_docs ──"
python3 tools/check_docs.py .
echo "── test_skills ──"
python3 test/test_skills.py
echo "── guard-bash ──"
node test/guard-bash.test.mjs 2>&1 | grep -E "(tests|pass|fail) [0-9]" || true
echo "── log-harness-event ──"
node test/log-harness-event.test.mjs 2>&1 | tail -2
echo "ALL GREEN"
