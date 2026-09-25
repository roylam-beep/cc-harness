#!/usr/bin/env python3
"""tools/spec_merge.py 的單元測試：每條合併／檢查規則各一個案例，用子程序驗真實退出碼。
負向案例必須真的紅——證明閘會咬人，不是只證明綠燈會亮。
"""
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "..", "tools", "spec_merge.py")

REQ_A = """### Requirement: Export CSV
The system SHALL export user data as CSV.

#### Scenario: Click export
- **WHEN** the user clicks Export
- **THEN** a CSV downloads
"""
REQ_A2 = REQ_A + """
#### Scenario: Empty account
- **WHEN** the user has no data
- **THEN** an empty CSV downloads
"""
REQ_B = """### Requirement: Dark mode
The app SHALL offer a dark theme.

#### Scenario: Toggle
- **WHEN** the user toggles theme
- **THEN** the app switches to dark
"""
SPEC = "# demo Specification\n\n## Purpose\nDemo.\n\n## Requirements\n\n" + REQ_A + "\n" + REQ_B
DONE = "## 1. Wave\n- [x] 1.1 做完 ｜驗：pytest\n"
OPEN = ("## 1. Wave\n- [ ] 1.1 沒做 ｜驗：pytest\n  - 所有權：`src/a.py`\n"
        "- [x] 1.2 做完 ｜驗：pytest\n")


def delta(added="", modified="", removed="", purpose="", extra=""):
    s = ""
    if purpose:
        s += f"## Purpose\n{purpose}\n\n"
    if added:
        s += f"## ADDED Requirements\n\n{added}\n"
    if modified:
        s += f"## MODIFIED Requirements\n\n{modified}\n"
    if removed:
        s += f"## REMOVED Requirements\n\n{removed}\n"
    return s + extra


class T(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = os.path.join(self.tmp.name, "demo")
        os.makedirs(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, rel, text):
        p = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)

    def get(self, rel):
        with open(os.path.join(self.root, rel), encoding="utf-8") as f:
            return f.read()

    def run_tool(self, *args):
        r = subprocess.run([sys.executable, TOOL, *args], cwd=self.root, capture_output=True, text=True)
        return r.returncode, r.stdout + r.stderr

    def change(self, spec, tasks=DONE, slug="s"):
        self.put(f"docs/changes/{slug}/spec.md", spec)
        if tasks is not None:
            self.put(f"docs/changes/{slug}/tasks.md", tasks)
        return f"docs/changes/{slug}"

    # ── 合併 ──
    def test_01_create_dry_run_does_not_write(self):
        d = self.change(delta(added=REQ_A, purpose="Ship exports."))
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 0, out)
        self.assertIn("+# demo Specification", out)
        self.assertFalse(os.path.exists(os.path.join(self.root, "SPEC.md")))

    def test_02_create_apply_uses_delta_purpose(self):
        d = self.change(delta(added=REQ_A, purpose="Ship exports."))
        rc, out = self.run_tool(d, "--apply")
        self.assertEqual(rc, 0, out)
        self.assertIn("## Purpose\nShip exports.", self.get("SPEC.md"))
        self.assertIn("git mv docs/changes/s docs/archive/changes/", out)

    def test_03_create_without_purpose_is_tbd(self):
        d = self.change(delta(added=REQ_A))
        self.run_tool(d, "--apply")
        self.assertIn("## Purpose\nTBD", self.get("SPEC.md"))

    def test_04_added_appends_keeping_order(self):
        self.put("SPEC.md", SPEC)
        d = self.change(delta(added=REQ_B.replace("Dark mode", "Light mode")))
        rc, _ = self.run_tool(d, "--apply")
        self.assertEqual(rc, 0)
        s = self.get("SPEC.md")
        self.assertLess(s.index("Export CSV"), s.index("Dark mode"))
        self.assertLess(s.index("Dark mode"), s.index("Light mode"))

    def test_05_added_identical_is_idempotent_warning(self):
        self.put("SPEC.md", SPEC)
        d = self.change(delta(added=REQ_A))
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 0, out)
        self.assertIn("⚠️", out)
        self.assertNotIn("\n+### Requirement", out)

    def test_06_added_same_name_different_content_fails(self):
        self.put("SPEC.md", SPEC)
        d = self.change(delta(added=REQ_A.replace("CSV downloads", "JSON downloads")))
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 1)
        self.assertIn("Export CSV", out)

    def test_07_modified_missing_fails(self):
        self.put("SPEC.md", SPEC)
        d = self.change(delta(modified=REQ_B.replace("Dark mode", "Ghost")))
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 1)
        self.assertIn("MODIFIED「Ghost」", out)

    def test_08_modified_fewer_scenarios_fails(self):
        self.put("SPEC.md", SPEC.replace(REQ_A, REQ_A2))
        d = self.change(delta(modified=REQ_A))
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 1)
        self.assertIn("2 → 1", out)

    def test_09_modified_equal_or_more_replaces_in_place(self):
        self.put("SPEC.md", SPEC)
        d = self.change(delta(modified=REQ_A2.replace("CSV downloads", "CSV downloads fast")))
        rc, _ = self.run_tool(d, "--apply")
        self.assertEqual(rc, 0)
        s = self.get("SPEC.md")
        self.assertIn("CSV downloads fast", s)
        self.assertIn("Empty account", s)
        self.assertLess(s.index("Export CSV"), s.index("Dark mode"))

    def test_10_removed_missing_warns_and_continues(self):
        self.put("SPEC.md", SPEC)
        d = self.change(delta(removed="### Requirement: Ghost\n"))
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 0, out)
        self.assertIn("⚠️", out)

    def test_11_rename_is_removed_plus_added(self):
        self.put("SPEC.md", SPEC)
        d = self.change(delta(added=REQ_B.replace("Dark mode", "Night mode"), removed="### Requirement: Dark mode\n"))
        rc, _ = self.run_tool(d, "--apply")
        self.assertEqual(rc, 0)
        s = self.get("SPEC.md")
        self.assertNotIn("Requirement: Dark mode", s)
        self.assertIn("Requirement: Night mode", s)

    def test_12_duplicate_header_same_and_cross_section_fail(self):
        d = self.change(delta(added=REQ_A + "\n" + REQ_A))
        self.assertEqual(self.run_tool(d)[0], 1)
        self.put("SPEC.md", SPEC)
        d = self.change(delta(modified=REQ_A, removed="### Requirement: Export CSV\n"))
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 1)
        self.assertIn("同時出現", out)

    def test_13_duplicate_header_in_spec_md_fails(self):
        self.put("SPEC.md", SPEC + "\n" + REQ_B)
        d = self.change(delta(added=REQ_A.replace("Export CSV", "Other")))
        self.assertEqual(self.run_tool(d)[0], 1)

    def test_14_zero_scenario_added_fails_removed_ok(self):
        d = self.change(delta(added="### Requirement: Bare\nThe system SHALL do X.\n"))
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 1)
        self.assertIn("沒有 Scenario", out)
        self.put("SPEC.md", SPEC)
        d = self.change(delta(removed="### Requirement: Dark mode\n"))
        self.assertEqual(self.run_tool(d)[0], 0)

    def test_15_illegal_h2_in_delta_or_spec_fails(self):
        d = self.change(delta(added=REQ_A, extra="\n## Design\nstuff\n"))
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 1)
        self.assertIn("## Design", out)
        self.put("SPEC.md", SPEC + "\n## ADDED Requirements\n")
        d = self.change(delta(added=REQ_B.replace("Dark mode", "Other")))
        self.assertEqual(self.run_tool(d)[0], 1)

    def test_16_all_sections_empty_fails(self):
        d = self.change("## Purpose\nOnly words.\n\n## 不做\n- nothing\n")
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 1)
        self.assertIn("皆空", out)

    def test_17_apply_blocked_by_open_tasks_dry_run_only_warns(self):
        d = self.change(delta(added=REQ_A), tasks=OPEN)
        rc, out = self.run_tool(d, "--apply")
        self.assertEqual(rc, 1)
        self.assertIn("1 項未完成", out)
        self.assertFalse(os.path.exists(os.path.join(self.root, "SPEC.md")))
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 0, out)
        self.assertIn("⚠️", out)

    def test_18_bad_paths_exit_2(self):
        self.assertEqual(self.run_tool("docs/changes/nope")[0], 2)
        os.makedirs(os.path.join(self.root, "docs/changes/empty"))
        self.assertEqual(self.run_tool("docs/changes/empty")[0], 2)
        self.assertEqual(self.run_tool()[0], 2)

    def test_19_apply_twice_is_byte_stable(self):
        d = self.change(delta(added=REQ_A + "\n" + REQ_B, purpose="P."))
        self.run_tool(d, "--apply")
        first = self.get("SPEC.md")
        rc, _ = self.run_tool(d, "--apply")
        self.assertEqual(rc, 0)
        self.assertEqual(first, self.get("SPEC.md"))

    def test_20_missing_when_or_then_fails(self):
        d = self.change(delta(added=REQ_A.replace("- **THEN** a CSV downloads", "- a CSV downloads")))
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 1)
        self.assertIn("WHEN", out)

    # ── check ──
    def test_21_check_no_changes_dir_is_green(self):
        rc, out = self.run_tool("check", ".")
        self.assertEqual(rc, 0, out)
        self.assertIn("不存在跳過", out)

    def test_22_check_all_green_counts(self):
        self.put("SPEC.md", SPEC)
        self.change(delta(added=REQ_B.replace("Dark mode", "Other")), tasks=OPEN)
        rc, out = self.run_tool("check", ".")
        self.assertEqual(rc, 0, out)
        self.assertIn("進行中 change 1/3", out)
        self.assertIn("SPEC.md 2 條", out)

    def test_23_check_bad_task_line_fails(self):
        self.change(delta(added=REQ_A), tasks="## 1. W\n- [~] 1.1 weird ｜驗：x\n")
        rc, out = self.run_tool("check", ".")
        self.assertEqual(rc, 1)
        self.assertIn("tasks.md L2", out)
        self.change(delta(added=REQ_A), tasks="## 1. W\nno tasks here\n")
        rc, out = self.run_tool("check", ".")
        self.assertEqual(rc, 1)
        self.assertIn("沒有任何 task", out)

    def test_24_check_bad_delta_and_bad_spec_fail(self):
        self.change(delta(added="### Requirement: Bare\nno scenario\n"))
        self.assertEqual(self.run_tool("check", ".")[0], 1)
        self.change(delta(added=REQ_A))
        self.put("SPEC.md", "# x\n\n## Purpose\np\n\n## MODIFIED Requirements\n")
        self.assertEqual(self.run_tool("check", ".")[0], 1)

    def test_25_check_warnings_do_not_fail(self):
        for s in ("a", "b", "c", "d"):
            self.change(delta(added=REQ_A), tasks=DONE, slug=s)
        self.change(delta(added=REQ_A), tasks="## 1. W\n- [ ] 1.1 no verify phrase\n  - 所有權：`src/a.py`\n", slug="e")
        rc, out = self.run_tool("check", ".")
        self.assertEqual(rc, 0, out)
        self.assertIn("進行中 5 > 3", out)
        self.assertIn("全勾但未歸檔", out)
        self.assertIn("沒寫「驗：」", out)

    def test_26_unchecked_task_missing_ownership_fails(self):
        # 未縮排的「所有權：」、以及標題後面的標記，都不算這條 task 的。已勾的不查。
        red = (
            "## 1. W\n"
            "- [ ] 1.1 沒有所有權 ｜驗：pytest\n"
            "- [ ] 1.9 標記沒縮排 ｜驗：pytest\n"
            "所有權：`src/c.py`\n"
            "- [x] 1.2 已勾不用 ｜驗：pytest\n"
            "- [ ] 1.5 標題切斷 ｜驗：pytest\n"
            "## 2. 下一組\n"
            "  - 所有權：`src/leak.py`\n"
        )
        d = self.change(delta(added=REQ_A), tasks=red)
        rc, out = self.run_tool("check", ".")
        self.assertEqual(rc, 1, out)
        self.assertIn("tasks.md L2：task 1.1 缺所有權", out)
        self.assertIn("tasks.md L3：task 1.9 缺所有權", out)
        self.assertIn("tasks.md L6：task 1.5 缺所有權", out)
        self.assertNotIn("task 1.2", out)
        rc, out = self.run_tool(d)
        self.assertEqual(rc, 0, out)
        self.assertNotIn("缺所有權", out)

        # 冒號在粗體外面時，「所有權：」不是連續子字串；空值加巢狀子項也要認。
        green = (
            "## 1. W\n"
            "- [ ] 1.3 粗體巢狀 ｜驗：pytest\n"
            "  - **所有權**：\n"
            "    - `tools/spec_merge.py`\n"
            "    - `test/spec_merge.test.py`\n"
            "- [ ] 1.8 空值巢狀 ｜驗：pytest\n"
            "  - 所有權：\n"
            "    - `commands/cc-gate.md`\n"
            "- [ ] 1.6 行內 ｜所有權：`src/b.py` ｜驗：pytest\n"
            "- [x] 1.7 已勾沒寫也行 ｜驗：pytest\n"
        )
        self.change(delta(added=REQ_A), tasks=green)
        rc, out = self.run_tool("check", ".")
        self.assertEqual(rc, 0, out)

    def test_27_ownership_needs_backtick_path_on_a_marker_line(self):
        # 順口出現的字樣、沒包反引號、空值沒子項、冒號後有字但沒有反引號，都不算。
        bad = (
            "## 1. W\n"
            "- [ ] 1.1 順口 ｜驗：pytest\n"
            "  - 契約：不要動所有權：`src/a.py` 以外的檔\n"
            "- [ ] 1.2 空值沒子項 ｜驗：pytest\n"
            "  - 所有權：\n"
            "- [ ] 1.4 沒包反引號 ｜驗：pytest\n"
            "  - 所有權：src/a.py\n"
            "    - `src/b.py`\n"
            "- [ ] 1.5 行上沒有直槓 所有權：`src/a.py` ｜驗：pytest\n"
            "- [ ] 1.3 冒號在粗體內 ｜驗：pytest\n"
            "  - **所有權：**\n"
            "    - `src/a.py`\n"
        )
        self.change(delta(added=REQ_A), tasks=bad)
        rc, out = self.run_tool("check", ".")
        self.assertEqual(rc, 1, out)
        for nm in ("1.1", "1.2", "1.4", "1.5", "1.3"):
            self.assertIn(f"task {nm} 缺所有權", out)
        self.assertNotIn("改成全形", out)

        half = (
            "## 1. W\n"
            "- [ ] 1.6 半形子行 ｜驗：pytest\n"
            "  - 所有權:`src/a.py`\n"
            "- [ ] 1.7 半形行內 ｜所有權:`src/b.py` ｜驗：pytest\n"
            "- [ ] 1.8 粗體半形 ｜驗：pytest\n"
            "  - **所有權**:\n"
            "    - `src/c.py`\n"
            "- [x] 1.9 已勾半形不用 ｜驗：pytest\n"
            "  - 所有權:src/d.py\n"
            "- [ ] 2.1 小標切斷 ｜驗：pytest\n"
            "### 小標\n"
            "  - 所有權：`src/e.py`\n"
        )
        self.change(delta(added=REQ_A), tasks=half)
        rc, out = self.run_tool("check", ".")
        self.assertEqual(rc, 1, out)
        self.assertIn("task 1.6 缺所有權（未勾 task 要有至少一個反引號路徑；改成全形「：」）", out)
        self.assertIn("task 1.7 缺所有權（未勾 task 要有至少一個反引號路徑；改成全形「：」）", out)
        self.assertIn("task 1.8 缺所有權（未勾 task 要有至少一個反引號路徑；改成全形「：」）", out)
        two = next(line for line in out.splitlines() if "task 2.1 缺所有權" in line)
        self.assertEqual(two.split("：", 1)[-1],
                         "task 2.1 缺所有權（未勾 task 要有至少一個反引號路徑）")
        self.assertNotIn("task 1.9", out)

        good = (
            "## 1. W\n"
            "- [ ] 1.1 多個路徑 ｜驗：pytest\n"
            "  - 所有權：`src/a.py`、`src/b.py`\n"
            "- [ ] 1.2 行內空值 ｜所有權： ｜驗：pytest\n"
            "  - `src/c.py`\n"
            "- [ ] 1.3 粗體同行 ｜驗：pytest\n"
            "  - **所有權**：`src/d.py`\n"
        )
        self.change(delta(added=REQ_A), tasks=good)
        rc, out = self.run_tool("check", ".")
        self.assertEqual(rc, 0, out)


if __name__ == "__main__":
    r = unittest.main(exit=False, verbosity=0).result
    n = r.testsRun
    ok = r.wasSuccessful()
    print(f"SPEC_MERGE_TEST {'OK' if ok else 'FAIL'}（{n} 項{'' if ok else f'，失敗 {len(r.failures) + len(r.errors)}'}）")
    sys.exit(0 if ok else 1)
