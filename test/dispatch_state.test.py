#!/usr/bin/env python3
"""tools/dispatch_state.py 的測試：子程序驗真實退出碼。負向案例必須真的紅。

對應 spec「dispatch_state 簿記」15 個 Scenario：
  test_01  upsert 建檔與只改指定欄
  test_02  upsert 擋非法狀態
  test_03  sync 依整合分支打勾（錯 base 不算）
  test_04  sync 抓事後 revert（PR，之後再合併會打勾）
  test_05  sync 抓事後 revert（origin/<BASE> 的 commit；沒推上去的不算）
  test_06  sync 記 closed（有已合併 PR 時不蓋掉；重派中的列不在這條）
  test_07  sync --check 只比對
  test_08  沒有 gh（不在 PATH、auth 失敗、pr list 失敗都不寫檔）
  test_09  stale 找落後的 PR／都不落後／head 只在 origin 另一條分支
  test_10  next 看依賴（含波次與「依賴：無」）
  test_11  next 擋所有權重疊（含 running／finished 佔用、fnmatch、巢狀所有權）
  test_12  next 冪等
  test_13  next 序列化 schema task
  test_14  next 套上限（--max、MAX_CONCURRENT、預設 3）
  test_15  next 缺所有權
  test_16  所有權寫法與 spec_merge 一致（D／G／H、task 行、全形冒號、# 標題切斷）
  test_17  finished 不佔上限
  test_18  sync 不蓋重派中的列（closed 與 revert；merged 仍可蓋）
  test_19  同一份 tasks.md，spec_merge check 與 next 對「有沒有所有權」一致
"""
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "..", "tools", "dispatch_state.py")
SPEC_MERGE = os.path.join(HERE, "..", "tools", "spec_merge.py")
HEADER = "| task | agentId | runId | 狀態 | PR | 備註 |"

GH_SCRIPT = r'''#!/usr/bin/env python3
import json, os, sys
argv = sys.argv[1:]
log = os.environ.get("GH_ARGV_LOG")
if log:
    with open(log, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(argv) + "\n")
if argv[:2] == ["auth", "status"]:
    sys.exit(0 if os.environ.get("GH_AUTH_OK", "1") == "1" else 1)
if len(argv) >= 2 and argv[0] == "pr" and argv[1] == "list":
    if os.environ.get("GH_LIST_FAIL") == "1":
        sys.stderr.write("list failed\n")
        sys.exit(1)
    state = "open"
    if "--state" in argv:
        state = argv[argv.index("--state") + 1]
    # 故意不依 --base 過濾，逼工具自己丟掉 base 不符的 PR。
    with open(os.environ["GH_PRS"], encoding="utf-8") as fh:
        prs = json.load(fh)
    out = []
    for pr in prs:
        st = pr.get("state", "open")
        if state == "merged" and st != "merged":
            continue
        if state == "open" and st != "open":
            continue
        if state == "closed" and st not in ("closed", "merged"):
            continue
        out.append(pr)
    json.dump(out, sys.stdout)
    sys.exit(0)
sys.stderr.write("fake gh: unknown %s\n" % " ".join(argv))
sys.exit(1)
'''

BAD_GH = """#!/usr/bin/env python3
import sys
sys.stderr.write("BOOM\\n")
sys.exit(1)
"""


def readb(path):
    with open(path, "rb") as fh:
        return fh.read()


def table_rows(text):
    rows = []
    for line in text.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not cells or cells[0] == "task" or set(cells[0]) <= set("-: "):
            continue
        rows.append(cells)
    return rows


def task_line(text, tid):
    prefix = f"{tid} "
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("- [") and f"] {prefix}" in stripped:
            # 1.2 不得吃到 1.20：編號後面必須是空白。
            mark = stripped.split("] ", 1)[1]
            if mark.startswith(prefix) or mark == tid:
                return line
    return None


class T(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = os.path.join(self.tmp.name, "repo")
        os.makedirs(self.root)
        self.change = "docs/changes/demo"
        self.change_abs = os.path.join(self.root, self.change)
        os.makedirs(self.change_abs)
        self.gh_log = os.path.join(self.tmp.name, "gh.log")
        self.prs_path = os.path.join(self.tmp.name, "prs.json")
        self.gh_path = os.path.join(self.tmp.name, "bin", "gh")

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, rel, text):
        path = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        return path

    def get(self, rel):
        with open(os.path.join(self.root, rel), encoding="utf-8") as fh:
            return fh.read()

    def write_exe(self, path, text):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)

    def install_gh(self, prs, auth=True):
        self.write_exe(self.gh_path, GH_SCRIPT)
        with open(self.prs_path, "w", encoding="utf-8") as fh:
            json.dump(prs, fh)
        return self.gh_path

    def run_tool(self, *args, prs=None, auth=True, extra_env=None, path_mode="inherit"):
        """path_mode：inherit＝沿用環境；fake＝PATH 最前面是假 gh；empty＝PATH 只有 git、沒有 gh。"""
        if os.path.exists(self.gh_log):
            os.remove(self.gh_log)
        env = os.environ.copy()
        env.pop("DISPATCH_STATE_GH", None)
        env["PYTHONIOENCODING"] = "utf-8"
        env["LC_ALL"] = "C.UTF-8"
        env["GIT_TERMINAL_PROMPT"] = "0"
        if prs is not None:
            self.install_gh(prs, auth)
            env["GH_PRS"] = self.prs_path
            env["GH_AUTH_OK"] = "1" if auth else "0"
            env["GH_ARGV_LOG"] = self.gh_log
        if path_mode == "fake":
            bindir = os.path.dirname(self.gh_path)
            if prs is None:
                self.install_gh([], auth)
                env["GH_PRS"] = self.prs_path
                env["GH_AUTH_OK"] = "1" if auth else "0"
                env["GH_ARGV_LOG"] = self.gh_log
            env["PATH"] = bindir + os.pathsep + env.get("PATH", "")
        elif path_mode == "empty":
            bindir = os.path.join(self.tmp.name, "git-only")
            os.makedirs(bindir, exist_ok=True)
            git = shutil.which("git")
            link = os.path.join(bindir, "git")
            if not os.path.lexists(link):
                os.symlink(git, link)
            env["PATH"] = bindir
        if extra_env:
            env.update(extra_env)
        proc = subprocess.run(
            [sys.executable, TOOL, *args],
            cwd=self.root, capture_output=True, text=True, encoding="utf-8", env=env,
        )
        return proc.returncode, proc.stdout, proc.stderr

    def gh_calls(self):
        if not os.path.isfile(self.gh_log):
            return []
        with open(self.gh_log, encoding="utf-8") as fh:
            return [json.loads(line) for line in fh if line.strip()]

    def assert_gh_has(self, *parts):
        calls = self.gh_calls()
        self.assertTrue(any(all(part in call for part in parts) for call in calls), calls)

    def assert_prefixes(self, out, words):
        lines = [line for line in out.splitlines() if line.strip()]
        self.assertTrue(lines, out)
        for line in lines:
            self.assertIn(line.split()[0], words, line)
        return lines

    def git(self, *args, date=None):
        env = os.environ.copy()
        env["GIT_AUTHOR_NAME"] = "t"
        env["GIT_AUTHOR_EMAIL"] = "t@local"
        env["GIT_COMMITTER_NAME"] = "t"
        env["GIT_COMMITTER_EMAIL"] = "t@local"
        env["GIT_TERMINAL_PROMPT"] = "0"
        if date:
            env["GIT_AUTHOR_DATE"] = date
            env["GIT_COMMITTER_DATE"] = date
        proc = subprocess.run(
            ["git", "-C", self.root, *args], capture_output=True, text=True, encoding="utf-8", env=env,
        )
        if proc.returncode != 0:
            raise AssertionError(f"git {args} → {proc.returncode}\n{proc.stdout}\n{proc.stderr}")
        return proc.stdout.strip()

    def init_origin(self, branch="claude/x"):
        subprocess.run(["git", "init", "-b", branch, self.root], check=True, capture_output=True)
        self.git("config", "user.email", "t@local")
        self.git("config", "user.name", "t")
        self.git("config", "commit.gpgsign", "false")
        self.put("README", "x\n")
        self.git("add", "README")
        self.git("commit", "-m", "init", date="2026-09-25T00:00:00Z")
        bare = os.path.join(self.tmp.name, "origin.git")
        subprocess.run(["git", "init", "--bare", "-b", branch, bare], check=True, capture_output=True)
        self.git("remote", "add", "origin", bare)
        self.git("push", "-u", "origin", "HEAD")
        return branch

    def rev(self, ref="HEAD"):
        return self.git("rev-parse", ref)

    def tasks(self, body):
        self.put(f"{self.change}/tasks.md", body if body.endswith("\n") else body + "\n")

    def gate(self, text):
        self.put(f"{self.change}/gate.env", text if text.endswith("\n") else text + "\n")

    def runs(self, rows):
        lines = [HEADER, "|---|---|---|---|---|---|"]
        for row in rows:
            lines.append("| " + " | ".join(row) + " |")
        self.put(f"{self.change}/runs.md", "\n".join(lines) + "\n")

    def block(self, tid, title, ownership="OMIT", deps="OMIT", checked=False, nested=False, bold=False):
        mark = "x" if checked else " "
        lines = [f"- [{mark}] {tid} {title} ｜驗：true"]
        if nested:
            lines.append("  - **所有權**：" if bold else "  - 所有權：")
            for path in ownership or []:
                lines.append(f"    - `{path}`")
        elif ownership != "OMIT":
            label = "**所有權**：" if bold else "所有權："
            if ownership:
                joined = "、".join(f"`{path}`" for path in ownership)
                lines.append(f"  - {label}{joined}")
            else:
                lines.append(f"  - {label}")
        if deps != "OMIT":
            if deps in ("無", []):
                lines.append("  - 依賴：無")
            elif isinstance(deps, str):
                lines.append(f"  - 依賴：{deps}")
            else:
                lines.append("  - 依賴：" + "、".join(deps))
        return "\n".join(lines)

    def doc(self, *sections):
        parts = []
        for heading, blocks in sections:
            parts.append(f"## {heading}")
            parts.extend(blocks)
        return "\n".join(parts) + "\n"

    # ── 1. upsert 建檔與只改指定欄 ──
    def test_01_upsert_creates_then_updates_one_row(self):
        rc, out, err = self.run_tool(
            "upsert-run", self.change, "1.2",
            "--agent", "bc-1", "--run", "run-1", "--status", "running", "--note", "原註",
        )
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "")
        self.assertEqual(err, "")
        text = self.get(f"{self.change}/runs.md")
        self.assertTrue(text.startswith(HEADER + "\n|---|---|---|---|---|---|\n"), text)
        self.assertEqual(table_rows(text), [["1.2", "bc-1", "run-1", "running", "", "原註"]])

        rc, out, err = self.run_tool(
            "upsert-run", self.change, "1.2", "--status", "finished", "--pr", "7",
        )
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "")
        rows = table_rows(self.get(f"{self.change}/runs.md"))
        self.assertEqual(rows, [["1.2", "bc-1", "run-1", "finished", "#7", "原註"]])

        rc, _, err = self.run_tool(
            "upsert-run", self.change, "1.2", "--pr", "#7",
        )
        self.assertEqual(rc, 0, err)
        self.assertEqual(table_rows(self.get(f"{self.change}/runs.md")), rows)

    # ── 2. upsert 擋非法狀態 ──
    def test_02_upsert_rejects_bad_status(self):
        raw = "不要動\n" + HEADER + "\n|---|---|---|---|---|---|\n| 1.2 | a | b | running |  | keep |\n"
        path = self.put(f"{self.change}/runs.md", raw)
        before = readb(path)
        rc, out, err = self.run_tool("upsert-run", self.change, "1.2", "--status", "done")
        self.assertEqual(rc, 2, out + err)
        self.assertIn("狀態非法", out)
        self.assertEqual(readb(path), before)
        self.assertIn("running", self.get(f"{self.change}/runs.md"))

        os.remove(path)
        rc, out, _ = self.run_tool("upsert-run", self.change, "1.2", "--status", "nope")
        self.assertEqual(rc, 2, out)
        self.assertFalse(os.path.exists(path))

    # ── 3. sync 依整合分支打勾 ──
    def test_03_sync_checks_only_integration_base(self):
        self.gate("BASE=claude/x")
        self.tasks(self.doc(("1. 波", [
            self.block("1.2", "要勾", ownership=["a.py"], deps="無"),
            self.block("1.3", "錯 base", ownership=["b.py"], deps="無"),
            self.block("1.20", "不被 1.2 誤傷", ownership=["c.py"], deps="無"),
        ])))
        prs = [
            {"number": 7, "title": "demo 1.2: 做好了", "state": "merged",
             "mergedAt": "2026-09-25T01:00:00Z", "baseRefName": "claude/x"},
            {"number": 8, "title": "demo 1.3: 不該算", "state": "merged",
             "mergedAt": "2026-09-25T02:00:00Z", "baseRefName": "main"},
            {"number": 9, "title": "demo 1.20: 別條", "state": "merged",
             "mergedAt": "2026-09-25T03:00:00Z", "baseRefName": "claude/x"},
        ]
        rc, out, err = self.run_tool("sync", self.change, prs=prs, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(err, "")
        self.assert_prefixes(out, {"SYNC"})
        self.assertEqual(out, "SYNC 1.2 merged #7\nSYNC 1.20 merged #9\n")
        self.assert_gh_has("pr", "list", "--state", "merged", "--base", "claude/x")
        text = self.get(f"{self.change}/tasks.md")
        self.assertIn("- [x] 1.2 要勾", text)
        self.assertIn("- [ ] 1.3 錯 base", text)
        self.assertIn("- [x] 1.20 不被 1.2 誤傷", text)
        self.assertNotIn("- [x] 1.3 ", text)
        rows = {row[0]: row for row in table_rows(self.get(f"{self.change}/runs.md"))}
        self.assertEqual(rows["1.2"][3:], ["merged", "#7", ""])
        self.assertNotIn("1.3", rows)

        # --base 蓋過 gate.env；沒寫 BASE 時預設 main。
        self.tasks(self.doc(("1. 波", [
            self.block("1.2", "改看 other", ownership=["a.py"], deps="無"),
        ])))
        os.remove(os.path.join(self.change_abs, "runs.md"))
        prs = [
            {"number": 4, "title": "demo 1.2: other", "state": "merged",
             "mergedAt": "2026-09-25T04:00:00Z", "baseRefName": "other"},
            {"number": 5, "title": "demo 1.2: gate", "state": "merged",
             "mergedAt": "2026-09-25T05:00:00Z", "baseRefName": "claude/x"},
        ]
        rc, out, err = self.run_tool(
            "sync", self.change, "--base", "other", prs=prs, path_mode="fake",
        )
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 1.2 merged #4\n")
        self.assert_gh_has("--base", "other")
        self.assertIn("- [x] 1.2 改看 other", self.get(f"{self.change}/tasks.md"))

        os.remove(os.path.join(self.change_abs, "gate.env"))
        self.tasks(self.doc(("1. 波", [self.block("1.2", "預設 main", ownership=["a.py"], deps="無")])))
        os.remove(os.path.join(self.change_abs, "runs.md"))
        prs = [{"number": 3, "title": "demo 1.2: main", "state": "merged",
                "mergedAt": "2026-09-25T01:00:00Z", "baseRefName": "main"}]
        rc, out, err = self.run_tool("sync", self.change, prs=prs, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 1.2 merged #3\n")
        self.assert_gh_has("--base", "main")

    # ── 4. sync revert PR，之後新的合併再打勾 ──
    def test_04_sync_revert_pr_then_new_merge(self):
        self.gate("BASE=claude/x")
        self.tasks(self.doc(("1. 波", [
            self.block("1.2", "工作", ownership=["a.py"], deps="無", checked=True),
        ])))
        self.runs([["1.2", "bc-1", "run-1", "merged", "#7", "原註"]])
        prs = [
            {"number": 7, "title": "demo 1.2: 工作", "state": "merged",
             "mergedAt": "2026-09-25T01:00:00Z", "baseRefName": "claude/x"},
            {"number": 8, "title": 'Revert "demo 1.2: 工作"', "state": "merged",
             "mergedAt": "2026-09-25T02:00:00Z", "baseRefName": "claude/x"},
        ]
        rc, out, err = self.run_tool("sync", self.change, prs=prs, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 1.2 reverted #7\n")
        text = self.get(f"{self.change}/tasks.md")
        self.assertEqual(task_line(text, "1.2"), "- [ ] 1.2 工作 ｜驗：true")
        self.assertEqual(
            table_rows(self.get(f"{self.change}/runs.md")),
            [["1.2", "bc-1", "run-1", "reverted", "#7", "原註"]],
        )

        prs.append({"number": 9, "title": "demo 1.2: 再來", "state": "merged",
                    "mergedAt": "2026-09-25T03:00:00Z", "baseRefName": "claude/x"})
        rc, out, err = self.run_tool("sync", self.change, prs=prs, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 1.2 merged #9\n")
        self.assertIn("- [x] 1.2 工作", self.get(f"{self.change}/tasks.md"))
        self.assertEqual(
            table_rows(self.get(f"{self.change}/runs.md")),
            [["1.2", "bc-1", "run-1", "merged", "#9", "原註"]],
        )

    # ── 5. origin/<BASE> 上較晚的 revert commit ──
    def test_05_sync_revert_commit_on_origin(self):
        self.init_origin("claude/x")
        self.gate("BASE=claude/x")
        self.tasks(self.doc(("1. 波", [
            self.block("1.2", "工作", ownership=["a.py"], deps="無"),
        ])))
        prs = [{"number": 7, "title": "demo 1.2: 工作", "state": "merged",
                "mergedAt": "2026-09-25T01:00:00Z", "baseRefName": "claude/x"}]
        rc, out, err = self.run_tool("sync", self.change, prs=prs, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 1.2 merged #7\n")
        self.assertIn("- [x] 1.2 工作", self.get(f"{self.change}/tasks.md"))
        tasks_bytes = readb(os.path.join(self.change_abs, "tasks.md"))
        runs_bytes = readb(os.path.join(self.change_abs, "runs.md"))

        self.put("note.txt", "local only\n")
        self.git("add", "note.txt")
        self.git("commit", "-m", 'Revert "demo 1.2: 工作"', date="2026-09-25T03:00:00Z")
        rc, out, err = self.run_tool("sync", self.change, prs=prs, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 一致\n")
        self.assertEqual(readb(os.path.join(self.change_abs, "tasks.md")), tasks_bytes)
        self.assertEqual(readb(os.path.join(self.change_abs, "runs.md")), runs_bytes)

        self.git("push", "origin", "HEAD")
        rc, out, err = self.run_tool("sync", self.change, prs=prs, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 1.2 reverted #7\n")
        self.assertEqual(task_line(self.get(f"{self.change}/tasks.md"), "1.2"), "- [ ] 1.2 工作 ｜驗：true")
        self.assertEqual(table_rows(self.get(f"{self.change}/runs.md"))[0][3:5], ["reverted", "#7"])

    # ── 6. sync 記 closed ──
    def test_06_sync_closed_without_merge(self):
        self.gate("BASE=claude/x")
        body = self.doc(("1. 波", [
            self.block("1.2", "關掉", ownership=["a.py"], deps="無"),
            self.block("1.3", "有合併", ownership=["b.py"], deps="無"),
        ]))
        self.tasks(body)
        # queued／running／finished 是重派中，sync 不蓋。failed 代表這一輪就是被關的 #8。
        self.runs([["1.2", "bc-2", "run-2", "failed", "", "留著"]])
        before_line = task_line(body, "1.2")
        prs = [
            {"number": 8, "title": "demo 1.2: 關掉", "state": "closed",
             "mergedAt": None, "closedAt": "2026-09-25T02:00:00Z", "baseRefName": "claude/x"},
            {"number": 7, "title": "demo 1.3: 有合併", "state": "merged",
             "mergedAt": "2026-09-25T01:00:00Z", "baseRefName": "claude/x"},
            {"number": 11, "title": "demo 1.3: 關了不算", "state": "closed",
             "mergedAt": None, "closedAt": "2026-09-25T04:00:00Z", "baseRefName": "claude/x"},
        ]
        rc, out, err = self.run_tool("sync", self.change, prs=prs, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 1.2 closed #8\nSYNC 1.3 merged #7\n")
        text = self.get(f"{self.change}/tasks.md")
        self.assertEqual(task_line(text, "1.2"), before_line)
        self.assertIn("- [x] 1.3 有合併", text)
        rows = {row[0]: row for row in table_rows(self.get(f"{self.change}/runs.md"))}
        self.assertEqual(rows["1.2"], ["1.2", "bc-2", "run-2", "closed", "#8", "留著"])
        self.assertEqual(rows["1.3"][3:5], ["merged", "#7"])

    # ── 7. sync --check 只比對 ──
    def test_07_sync_check_does_not_write(self):
        self.gate("BASE=claude/x")
        self.tasks(self.doc(("1. 波", [self.block("1.2", "要勾", ownership=["a.py"], deps="無")])))
        prs = [{"number": 7, "title": "demo 1.2: 要勾", "state": "merged",
                "mergedAt": "2026-09-25T01:00:00Z", "baseRefName": "claude/x"}]
        tasks_path = os.path.join(self.change_abs, "tasks.md")
        before = readb(tasks_path)
        rc, out, err = self.run_tool("sync", self.change, "--check", prs=prs, path_mode="fake")
        self.assertEqual(rc, 1, out + err)
        self.assertEqual(out, "SYNC 1.2 merged #7\n")
        self.assertEqual(readb(tasks_path), before)
        self.assertFalse(os.path.exists(os.path.join(self.change_abs, "runs.md")))

        rc, out, err = self.run_tool("sync", self.change, prs=prs, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertIn("- [x] 1.2 ", self.get(f"{self.change}/tasks.md"))
        after_tasks = readb(tasks_path)
        after_runs = readb(os.path.join(self.change_abs, "runs.md"))

        rc, out, err = self.run_tool("sync", self.change, "--check", prs=prs, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 一致\n")
        self.assertEqual(readb(tasks_path), after_tasks)
        self.assertEqual(readb(os.path.join(self.change_abs, "runs.md")), after_runs)

    # ── 8. 沒有 gh ──
    def test_08_no_gh_does_not_write(self):
        self.gate("BASE=claude/x")
        self.tasks(self.doc(("1. 波", [self.block("1.2", "不要改", ownership=["a.py"], deps="無")])))
        self.runs([["1.2", "bc", "run", "running", "", "留"]])
        tasks_path = os.path.join(self.change_abs, "tasks.md")
        runs_path = os.path.join(self.change_abs, "runs.md")
        before_t = readb(tasks_path)
        before_r = readb(runs_path)
        prs = [{"number": 7, "title": "demo 1.2: 不要改", "state": "merged",
                "mergedAt": "2026-09-25T01:00:00Z", "baseRefName": "claude/x"}]

        rc, out, err = self.run_tool("sync", self.change, prs=prs, path_mode="empty")
        self.assertEqual(rc, 2, out + err)
        self.assertEqual(out, "無法對帳\n")
        self.assertEqual(readb(tasks_path), before_t)
        self.assertEqual(readb(runs_path), before_r)

        rc, out, err = self.run_tool("stale", self.change, prs=prs, path_mode="empty")
        self.assertEqual(rc, 2, out + err)
        self.assertEqual(out, "無法對帳\n")
        self.assertEqual(readb(tasks_path), before_t)

        rc, out, err = self.run_tool("sync", self.change, prs=prs, auth=False, path_mode="fake")
        self.assertEqual(rc, 2, out + err)
        self.assertEqual(out, "無法對帳\n")
        self.assertEqual(readb(tasks_path), before_t)
        self.assertEqual(readb(runs_path), before_r)
        self.assertFalse(any(call[:2] == ["pr", "list"] for call in self.gh_calls()), self.gh_calls())

        rc, out, err = self.run_tool("stale", self.change, prs=prs, auth=False, path_mode="fake")
        self.assertEqual(rc, 2, out + err)
        self.assertEqual(out, "無法對帳\n")

        rc, out, err = self.run_tool(
            "sync", self.change, prs=prs, path_mode="fake", extra_env={"GH_LIST_FAIL": "1"},
        )
        self.assertEqual(rc, 2, out + err)
        self.assertEqual(out, "無法對帳\n")
        self.assertEqual(readb(tasks_path), before_t)
        self.assertEqual(readb(runs_path), before_r)

        # 環境變數覆寫：PATH 上的 gh 會失敗，DISPATCH_STATE_GH 指到假的才算數。
        bad_dir = os.path.join(self.tmp.name, "bad-bin")
        self.write_exe(os.path.join(bad_dir, "gh"), BAD_GH)
        self.install_gh(prs, auth=True)
        rc, out, err = self.run_tool(
            "sync", self.change, prs=prs, path_mode="fake",
            extra_env={"PATH": bad_dir + os.pathsep + os.environ.get("PATH", ""),
                       "DISPATCH_STATE_GH": self.gh_path},
        )
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 1.2 merged #7\n")
        self.assertNotIn("BOOM", err)

    # ── 9. stale ──
    def test_09_stale_behind_and_none(self):
        self.init_origin("claude/x")
        self.gate("BASE=claude/x")
        self.tasks(self.doc(("1. 波", [self.block("1.1", "占位", ownership=["a.py"], deps="無")])))
        old = self.rev("HEAD")
        self.put("ahead.txt", "ahead\n")
        self.git("add", "ahead.txt")
        self.git("commit", "-m", "ahead", date="2026-09-25T02:00:00Z")
        self.git("push", "origin", "HEAD")
        new = self.rev("HEAD")
        tasks_path = os.path.join(self.change_abs, "tasks.md")
        before = readb(tasks_path)
        prs = [
            {"number": 3, "title": "落後的閘", "state": "open", "baseRefName": "claude/x",
             "headRefOid": old, "mergedAt": None},
            {"number": 4, "title": "已經跟上", "state": "open", "baseRefName": "claude/x",
             "headRefOid": new, "mergedAt": None},
            {"number": 99, "title": "不該出現", "state": "open", "baseRefName": "main",
             "headRefOid": old, "mergedAt": None},
        ]
        rc, out, err = self.run_tool("stale", self.change, prs=prs, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(err, "")
        self.assertEqual(out, "STALE #3 落後的閘\n")
        self.assert_prefixes(out, {"STALE"})
        self.assert_gh_has("pr", "list", "--state", "open", "--base", "claude/x")
        self.assertNotIn("99", out)
        self.assertNotIn("不該出現", out)
        self.assertNotIn("已經跟上", out)
        self.assertEqual(readb(tasks_path), before)
        self.assertFalse(os.path.exists(os.path.join(self.change_abs, "runs.md")))

        rc, out, err = self.run_tool("stale", self.change, prs=[prs[1]], path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "STALE 無\n")

        rc, out, err = self.run_tool("stale", self.change, prs=[], path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "STALE 無\n")

        # head 只在 bare origin 的另一條分支，本機沒 fetch 過。跟上 BASE 就不是落後。
        other = os.path.join(self.tmp.name, "other")
        bare = os.path.join(self.tmp.name, "origin.git")
        subprocess.run(["git", "clone", bare, other], check=True, capture_output=True)
        self.git_at(other, "config", "user.email", "t@local")
        self.git_at(other, "config", "user.name", "t")
        self.git_at(other, "config", "commit.gpgsign", "false")
        self.git_at(other, "checkout", "-b", "cursor/f")
        with open(os.path.join(other, "pr-head.txt"), "w", encoding="utf-8") as fh:
            fh.write("pr\n")
        self.git_at(other, "add", "pr-head.txt")
        self.git_at(other, "commit", "-m", "pr head", date="2026-09-25T04:00:00Z")
        self.git_at(other, "push", "origin", "cursor/f")
        head = self.git_at(other, "rev-parse", "HEAD")
        probe = subprocess.run(
            ["git", "-C", self.root, "cat-file", "-e", f"{head}^{{commit}}"],
            capture_output=True,
        )
        self.assertNotEqual(probe.returncode, 0)
        fresh = [{
            "number": 5, "title": "跟上的閘", "state": "open", "baseRefName": "claude/x",
            "headRefOid": head, "headRefName": "cursor/f", "mergedAt": None,
        }]
        rc, out, err = self.run_tool("stale", self.change, prs=fresh, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "STALE 無\n")
        self.assertEqual(readb(tasks_path), before)

        missing = [{
            "number": 8, "title": "沒有這個 commit", "state": "open", "baseRefName": "claude/x",
            "headRefOid": "deadbeef" * 5, "headRefName": "cursor/missing", "mergedAt": None,
        }]
        rc, out, err = self.run_tool("stale", self.change, prs=missing, path_mode="fake")
        self.assertEqual(rc, 2, out + err)
        self.assertEqual(out, "無法對帳：取不到 PR #8 的 head\n")
        self.assertEqual(readb(tasks_path), before)

    def git_at(self, repo, *args, date=None):
        env = os.environ.copy()
        env["GIT_AUTHOR_NAME"] = "t"
        env["GIT_AUTHOR_EMAIL"] = "t@local"
        env["GIT_COMMITTER_NAME"] = "t"
        env["GIT_COMMITTER_EMAIL"] = "t@local"
        env["GIT_TERMINAL_PROMPT"] = "0"
        if date:
            env["GIT_AUTHOR_DATE"] = date
            env["GIT_COMMITTER_DATE"] = date
        proc = subprocess.run(
            ["git", "-C", repo, *args], capture_output=True, text=True, encoding="utf-8", env=env,
        )
        if proc.returncode != 0:
            raise AssertionError(f"git -C {repo} {args} → {proc.returncode}\n{proc.stdout}\n{proc.stderr}")
        return proc.stdout.strip()

    # ── 10. next 看依賴 ──
    def test_10_next_dependencies_and_waves(self):
        self.tasks(self.doc(
            ("1. 甲", [
                self.block("1.1", "甲", ownership=["a.py"], deps="無"),
                self.block("1.3", "丙", ownership=["c.py"], deps="1.1"),
            ]),
            ("2. 乙", [
                self.block("2.1", "不等", ownership=["d.py"], deps="無"),
                self.block("2.2", "等波次", ownership=["e.py"]),
                self.block("2.3", "多個", ownership=["f.py"], deps="1.1, 2.1"),
            ]),
        ))
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(err, "")
        self.assertEqual(out, "\n".join([
            "READY 1.1",
            "WAIT 1.3 依賴 1.1 未合併",
            "READY 2.1",
            "WAIT 2.2 前波未合併",
            "WAIT 2.3 依賴 1.1、2.1 未合併",
            "NEXT READY 2｜在飛 0｜上限 10",
        ]) + "\n")

        text = self.get(f"{self.change}/tasks.md").replace("- [ ] 1.1 ", "- [x] 1.1 ", 1)
        self.put(f"{self.change}/tasks.md", text)
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "\n".join([
            "READY 1.3",
            "READY 2.1",
            "WAIT 2.2 前波未合併",
            "WAIT 2.3 依賴 2.1 未合併",
            "NEXT READY 2｜在飛 0｜上限 10",
        ]) + "\n")

    # ── 11. next 擋所有權重疊 ──
    def test_11_next_ownership_overlap(self):
        def expect(body, runs_rows, stdout):
            self.tasks(body)
            runs_path = os.path.join(self.change_abs, "runs.md")
            if os.path.exists(runs_path):
                os.remove(runs_path)
            if runs_rows is not None:
                self.runs(runs_rows)
            rc, out, err = self.run_tool("next", self.change, "--max", "10")
            self.assertEqual(rc, 0, out + err)
            self.assertEqual(out, stdout)

        expect(self.doc(("1. 波", [
            self.block("1.1", "廣", ownership=["commands/**"], deps="無"),
            self.block("1.2", "窄", ownership=["commands/cc-review.md"], deps="無"),
        ])), None, "\n".join([
            "READY 1.1",
            "WAIT 1.2 所有權與 1.1 重疊：commands/cc-review.md",
            "NEXT READY 1｜在飛 0｜上限 10",
        ]) + "\n")

        expect(self.doc(("1. 波", [
            self.block("1.1", "廣", ownership=["commands/**"], deps="無"),
            self.block("1.2", "深", ownership=["commands/sub/dir/file.md"], deps="無"),
        ])), None, "\n".join([
            "READY 1.1",
            "WAIT 1.2 所有權與 1.1 重疊：commands/sub/dir/file.md",
            "NEXT READY 1｜在飛 0｜上限 10",
        ]) + "\n")

        expect(self.doc(("1. 波", [
            self.block("1.1", "具體", ownership=["commands/cc-review.md"], deps="無"),
            self.block("1.2", "glob", ownership=["*.md"], deps="無"),
        ])), None, "\n".join([
            "READY 1.1",
            "WAIT 1.2 所有權與 1.1 重疊：*.md",
            "NEXT READY 1｜在飛 0｜上限 10",
        ]) + "\n")

        expect(self.doc(("1. 波", [
            self.block("1.1", "甲", ownership=["docs/a.py"], deps="無"),
            self.block("1.2", "乙", ownership=["docs/b.py"], deps="無"),
        ])), None, "\n".join([
            "READY 1.1",
            "READY 1.2",
            "NEXT READY 2｜在飛 0｜上限 10",
        ]) + "\n")

        body = self.doc(("1. 波", [
            self.block("1.1", "飛", ownership=["commands/**"], deps="無"),
            self.block("1.2", "窄", ownership=["commands/cc-review.md"], deps="無"),
        ]))
        skip = "\n".join([
            "SKIP 1.1 {st}",
            "WAIT 1.2 所有權與 1.1 重疊：commands/cc-review.md",
            "NEXT READY 0｜在飛 {n}｜上限 10",
        ]) + "\n"
        expect(body, [["1.1", "bc", "run", "running", "", ""]], skip.format(st="running", n=1))
        expect(body, [["1.1", "bc", "run", "finished", "", ""]], skip.format(st="finished", n=0))

        expect(self.doc(("1. 波", [
            self.block("1.1", "被依賴擋住", ownership=["commands/**"], deps="9.9"),
            self.block("1.2", "可以派", ownership=["commands/cc-review.md"], deps="無"),
        ])), None, "\n".join([
            "WAIT 1.1 依賴 9.9 未合併",
            "READY 1.2",
            "NEXT READY 1｜在飛 0｜上限 10",
        ]) + "\n")

        expect(self.doc(("1. 波", [
            self.block("1.1", "巢狀", ownership=["commands/**", "docs/keep.md"], deps="無", nested=True),
            self.block("1.2", "粗體", ownership=["commands/cc-review.md"], deps="無", bold=True),
        ])), None, "\n".join([
            "READY 1.1",
            "WAIT 1.2 所有權與 1.1 重疊：commands/cc-review.md",
            "NEXT READY 1｜在飛 0｜上限 10",
        ]) + "\n")

    # ── 12. next 冪等 ──
    def test_12_next_idempotent_skip(self):
        self.tasks(self.doc(("1. 波", [
            self.block("1.1", "跑", ownership=["r.py"], deps="無"),
            self.block("1.2", "完", ownership=["f.py"], deps="無"),
            self.block("1.3", "合", ownership=["m.py"], deps="無"),
            self.block("1.4", "敗", ownership=["a.py"], deps="無"),
            self.block("1.5", "卡", ownership=["b.py"], deps="無"),
            self.block("1.6", "敗不佔", ownership=["a.py"], deps="無"),
            self.block("1.7", "合不佔", ownership=["m.py"], deps="無"),
        ])))
        self.runs([
            ["1.1", "bc", "r1", "running", "", ""],
            ["1.2", "bc", "r2", "finished", "", ""],
            ["1.3", "bc", "r3", "merged", "#3", ""],
            ["1.4", "bc", "r4", "failed", "", ""],
            ["1.5", "bc", "r5", "stalled", "", ""],
        ])
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "\n".join([
            "SKIP 1.1 running",
            "SKIP 1.2 finished",
            "SKIP 1.3 merged",
            "SKIP 1.4 failed 需人工",
            "SKIP 1.5 stalled 需人工",
            "READY 1.6",
            "READY 1.7",
            "NEXT READY 2｜在飛 1｜上限 10",
        ]) + "\n")
        self.assert_prefixes(out, {"READY", "WAIT", "SKIP", "NEXT"})

        self.tasks(self.doc(("1. 波", [self.block("1.1", "排隊", ownership=["a.py"], deps="無")])))
        self.runs([["1.1", "bc", "", "queued", "", ""]])
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "READY 1.1\nNEXT READY 1｜在飛 0｜上限 10\n")

    # ── 13. next 序列化 schema ──
    def test_13_next_schema_serial(self):
        self.gate("SCHEMA_GLOB=schema/**\nBASE=claude/x\n")
        body = self.doc(("1. 波", [
            self.block("1.1", "甲", ownership=["schema/a.sql"], deps="無"),
            self.block("1.2", "乙", ownership=["schema/b.sql"], deps="無"),
            self.block("1.3", "其他", ownership=["docs/readme.md"], deps="無"),
        ]))
        self.tasks(body)
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "\n".join([
            "READY 1.1",
            "WAIT 1.2 schema 序列化",
            "READY 1.3",
            "NEXT READY 2｜在飛 0｜上限 10",
        ]) + "\n")

        self.runs([["1.1", "bc", "run", "running", "", ""]])
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "\n".join([
            "SKIP 1.1 running",
            "WAIT 1.2 schema 序列化",
            "READY 1.3",
            "NEXT READY 1｜在飛 1｜上限 10",
        ]) + "\n")

    # ── 14. next 套上限 ──
    def test_14_next_max_and_summary(self):
        blocks = [
            self.block("1.1", "跑", ownership=["z.py"], deps="無"),
            self.block("1.2", "甲", ownership=["a.py"], deps="無"),
            self.block("1.3", "乙", ownership=["b.py"], deps="無"),
            self.block("1.4", "丙", ownership=["c.py"], deps="無"),
        ]
        self.tasks(self.doc(("1. 波", blocks)))
        self.runs([["1.1", "bc", "run", "running", "", ""]])
        rc, out, err = self.run_tool("next", self.change, "--max", "2")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "\n".join([
            "SKIP 1.1 running",
            "READY 1.2",
            "WAIT 1.3 超過上限",
            "WAIT 1.4 超過上限",
            "NEXT READY 1｜在飛 1｜上限 2",
        ]) + "\n")

        os.remove(os.path.join(self.change_abs, "runs.md"))
        self.tasks(self.doc(("1. 波", blocks[1:])))
        self.put("docs/changes/README.md", "MAX_CONCURRENT=2      同時跑的 cloud agent 上限\n")
        rc, out, err = self.run_tool("next", self.change)
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "\n".join([
            "READY 1.2",
            "READY 1.3",
            "WAIT 1.4 超過上限",
            "NEXT READY 2｜在飛 0｜上限 2",
        ]) + "\n")

        os.remove(os.path.join(self.root, "docs", "changes", "README.md"))
        four = [
            self.block("1.1", "甲", ownership=["a.py"], deps="無"),
            self.block("1.2", "乙", ownership=["b.py"], deps="無"),
            self.block("1.3", "丙", ownership=["c.py"], deps="無"),
            self.block("1.4", "丁", ownership=["d.py"], deps="無"),
        ]
        self.tasks(self.doc(("1. 波", four)))
        rc, out, err = self.run_tool("next", self.change)
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "\n".join([
            "READY 1.1",
            "READY 1.2",
            "READY 1.3",
            "WAIT 1.4 超過上限",
            "NEXT READY 3｜在飛 0｜上限 3",
        ]) + "\n")

    # ── 15. next 缺所有權 ──
    def test_15_next_missing_ownership(self):
        self.tasks(self.doc(("1. 波", [
            self.block("1.1", "缺", deps="無"),
            self.block("1.2", "有", ownership=["a.py"], deps="無"),
        ])))
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "\n".join([
            "WAIT 1.1 缺所有權",
            "READY 1.2",
            "NEXT READY 1｜在飛 0｜上限 10",
        ]) + "\n")
        self.assertNotIn("READY 1.1", out)

    # ── 與 spec_merge 同一套所有權寫法：task 行、全形冒號、# 標題切斷 ──
    def test_16_ownership_forms_match_check(self):
        self.tasks("\n".join([
            "- [ ] 1.1 行內 ｜驗：true ｜所有權：`a.py` ｜依賴：無",
            "- [ ] 1.2 等它 ｜驗：true ｜所有權：`b.py` ｜依賴：1.1",
        ]) + "\n")
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "\n".join([
            "READY 1.1",
            "WAIT 1.2 依賴 1.1 未合併",
            "NEXT READY 1｜在飛 0｜上限 10",
        ]) + "\n")

        self.tasks("\n".join([
            "- [ ] 1.1 半形 ｜驗：true",
            "  - 所有權: `a.py`",
            "  - 依賴: 無",
        ]) + "\n")
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "WAIT 1.1 缺所有權\nNEXT READY 0｜在飛 0｜上限 10\n")

        self.tasks("\n".join([
            "## 1. 波",
            "- [ ] 1.1 甲 ｜驗：true",
            "  - 所有權：`a.py`",
            "# 切斷",
            "  - 依賴：9.9",
        ]) + "\n")
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "READY 1.1\nNEXT READY 1｜在飛 0｜上限 10\n")

        # D：task 行和所有權子行之間夾一行沒縮排的文字，區塊不切斷。
        self.tasks("\n".join([
            "- [ ] 1.1 夾一行 ｜驗：true",
            "這行沒縮排",
            "  - 所有權：`a.py`",
            "  - 依賴：無",
        ]) + "\n")
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "READY 1.1\nNEXT READY 1｜在飛 0｜上限 10\n")

        # G：task 行有路徑，子行寫「同上」（沒有反引號）。兩處取聯集，有路徑就算有。
        self.tasks("\n".join([
            "- [ ] 1.1 行內為準 ｜所有權：`a.py` ｜驗：true ｜依賴：無",
            "  - 所有權：同上",
        ]) + "\n")
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "READY 1.1\nNEXT READY 1｜在飛 0｜上限 10\n")

        # H：兩條所有權子行，第一條空值、第二條有路徑。不因第一條空就停。
        self.tasks("\n".join([
            "- [ ] 1.1 兩條 ｜驗：true",
            "  - 所有權：",
            "  - 所有權：`a.py`",
            "  - 依賴：無",
        ]) + "\n")
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "READY 1.1\nNEXT READY 1｜在飛 0｜上限 10\n")

    def test_17_finished_does_not_consume_max(self):
        self.tasks(self.doc(("1. 波", [
            self.block("1.1", "完", ownership=["a.py"], deps="無"),
            self.block("1.2", "下一個", ownership=["b.py"], deps="無"),
        ])))
        self.runs([["1.1", "bc", "run", "finished", "", ""]])
        rc, out, err = self.run_tool("next", self.change, "--max", "1")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "\n".join([
            "SKIP 1.1 finished",
            "READY 1.2",
            "NEXT READY 1｜在飛 0｜上限 1",
        ]) + "\n")

    # ── 18. sync 不蓋重派中的列 ──
    def test_18_sync_does_not_clobber_redispatch(self):
        self.gate("BASE=claude/x")
        body = self.doc(("1. 波", [
            self.block("1.1", "甲", ownership=["a.py"], deps="無"),
        ]))
        self.tasks(body)
        self.runs([["1.1", "bc-new", "r-new", "running", "#5", "重派"]])
        tasks_path = os.path.join(self.change_abs, "tasks.md")
        runs_path = os.path.join(self.change_abs, "runs.md")
        closed = [
            {"number": 3, "title": "demo 1.1: 甲", "state": "closed",
             "mergedAt": None, "closedAt": "2026-09-25T02:00:00Z", "baseRefName": "claude/x"},
            {"number": 5, "title": "demo 1.1: 甲", "state": "open",
             "baseRefName": "claude/x", "headRefName": "cursor/x"},
        ]
        before_t = readb(tasks_path)
        before_r = readb(runs_path)
        rc, out, err = self.run_tool("sync", self.change, prs=closed, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 一致\n")
        self.assertEqual(readb(tasks_path), before_t)
        self.assertEqual(readb(runs_path), before_r)
        self.assertEqual(
            table_rows(self.get(f"{self.change}/runs.md")),
            [["1.1", "bc-new", "r-new", "running", "#5", "重派"]],
        )
        rc, out, err = self.run_tool("next", self.change, "--max", "3")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SKIP 1.1 running\nNEXT READY 0｜在飛 1｜上限 3\n")
        self.assertNotIn("READY 1.1", out)
        rc, out, err = self.run_tool("sync", self.change, "--check", prs=closed, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 一致\n")
        self.assertEqual(readb(tasks_path), before_t)
        self.assertEqual(readb(runs_path), before_r)

        # revert 之後重派：#5 仍 open，列停在 running #5。
        reverted = [
            {"number": 3, "title": "demo 1.1: 甲", "state": "merged",
             "mergedAt": "2026-09-25T01:00:00Z", "baseRefName": "claude/x"},
            {"number": 4, "title": 'Revert "demo 1.1: 甲"', "state": "merged",
             "mergedAt": "2026-09-25T02:00:00Z", "baseRefName": "claude/x"},
            {"number": 5, "title": "demo 1.1: 甲", "state": "open",
             "baseRefName": "claude/x", "headRefName": "cursor/x"},
        ]
        rc, out, err = self.run_tool("sync", self.change, prs=reverted, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 一致\n")
        self.assertEqual(readb(runs_path), before_r)
        self.assertEqual(task_line(self.get(f"{self.change}/tasks.md"), "1.1")[:6], "- [ ] ")
        rc, out, err = self.run_tool("next", self.change, "--max", "3")
        self.assertEqual(rc, 0, out + err)
        self.assertIn("SKIP 1.1 running", out)
        self.assertNotIn("READY 1.1", out)
        rc, out, err = self.run_tool("sync", self.change, "--check", prs=reverted, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 一致\n")

        # merged 照舊蓋過 running。
        merged = [{"number": 9, "title": "demo 1.1: 甲", "state": "merged",
                   "mergedAt": "2026-09-25T05:00:00Z", "baseRefName": "claude/x"}]
        rc, out, err = self.run_tool("sync", self.change, prs=merged, path_mode="fake")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(out, "SYNC 1.1 merged #9\n")
        self.assertEqual(
            table_rows(self.get(f"{self.change}/runs.md")),
            [["1.1", "bc-new", "r-new", "merged", "#9", "重派"]],
        )
        self.assertIn("- [x] 1.1 ", self.get(f"{self.change}/tasks.md"))

    # ── 19. 與 spec_merge check 對同一份 tasks.md 的所有權判定一致 ──
    def test_19_ownership_agrees_with_spec_merge(self):
        text = "\n".join([
            "## 1. 波",
            "- [ ] 1.1 夾一行 ｜驗：true",
            "這行沒縮排",
            "  - 所有權：`a.py`",
            "  - 依賴：無",
            "- [ ] 1.2 行內同上 ｜所有權：`b.py` ｜驗：true ｜依賴：無",
            "  - 所有權：同上",
            "- [ ] 1.3 兩條 ｜驗：true",
            "  - 所有權：",
            "  - 所有權：`c.py`",
            "  - 依賴：無",
            "- [ ] 1.4 沒寫 ｜驗：true",
            "  - 依賴：無",
            "- [ ] 1.5 半形 ｜驗：true",
            "  - 所有權: `d.py`",
            "  - 依賴：無",
            "- [x] 1.6 已勾不查 ｜驗：true",
            "- [ ] 1.7 標記沒縮排 ｜驗：true",
            "所有權：`e.py`",
            "  - 依賴：無",
        ]) + "\n"
        self.tasks(text)
        rc, out, err = self.run_tool("next", self.change, "--max", "10")
        self.assertEqual(rc, 0, out + err)
        missing_next = set()
        ready = set()
        for line in out.splitlines():
            hit = re.match(r"WAIT (\d+\.\d+) 缺所有權$", line)
            if hit:
                missing_next.add(hit.group(1))
            hit = re.match(r"READY (\d+\.\d+)$", line)
            if hit:
                ready.add(hit.group(1))
        proc = subprocess.run(
            [sys.executable, SPEC_MERGE, "check", "."],
            cwd=self.root, capture_output=True, text=True, encoding="utf-8",
        )
        missing_check = set(re.findall(r"task (\d+\.\d+) 缺所有權", proc.stdout + proc.stderr))
        self.assertEqual(missing_next, missing_check)
        self.assertEqual(missing_check, {"1.4", "1.5", "1.7"})
        self.assertEqual(ready, {"1.1", "1.2", "1.3"})
        self.assertNotIn("1.6", missing_check)


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=2).result
    n = result.testsRun
    ok = result.wasSuccessful()
    failed = len(result.failures) + len(result.errors)
    print(f"DISPATCH_STATE_TEST {'OK' if ok else 'FAIL'}（{n} 項{'' if ok else f'，失敗 {failed}'}）")
    sys.exit(0 if ok else 1)
