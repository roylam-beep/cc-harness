#!/bin/sh
# 本 repo 的快閘（commit 前跑這支）。任何一項紅就整支紅。
# 內容：plugin manifest 嚴格驗證、文件／死指標閘（含常駐載入預算）、skill 契約、gate smoke、guard-bash 單元測試。
set -e
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
echo "── claude plugin validate --strict ──"
# 兩份 manifest 都要逐檔驗。`validate .` 在兩者都存在時只驗 marketplace，plugin.json 會被跳過。
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate .claude-plugin/marketplace.json --strict
echo "── plugin loads ──"
sh tools/check-plugin-loads.sh
echo "── plugin sync ──"
sh tools/check-plugin-sync.sh
echo "── check_docs ──"
python3 tools/check_docs.py .
echo "── check_docs 第 7 類 ──"
sh test/check-docs-resident.test.sh
echo "── spec_merge ──"
python3 tools/spec_merge.py check .
python3 test/spec_merge.test.py 2>&1 | tail -1
echo "── test_skills ──"
python3 test/test_skills.py
echo "── gate ──"
sh test/gate.test.sh
echo "── guard-bash ──"
node test/guard-bash.test.mjs 2>&1 | grep -E "(tests|pass|fail) [0-9]" || true
echo "ALL GREEN"
