#!/usr/bin/env python3
"""dispatch_state — runs.md 與 tasks.md 勾選的唯一寫入工具（單檔、只用標準庫）。

用法：
  dispatch_state.py upsert-run <change-dir> <N.M> [--agent A] [--run R] [--status S] [--pr N] [--note 文字]
  dispatch_state.py sync <change-dir> [--base 分支] [--check]
  dispatch_state.py stale <change-dir> [--base 分支]
  dispatch_state.py next <change-dir> [--max N] [--base 分支]

BASE 取值順序：--base → <change-dir>/gate.env 的 BASE= → main。
slug 是 <change-dir> 的目錄名。主 repo 是 change-dir 往上三層（docs/changes/<slug>）。
gh 執行檔：環境變數 DISPATCH_STATE_GH，沒設就用 PATH 上的 gh。

upsert-run
  沒有 runs.md 就建表（表頭 `| task | agentId | runId | 狀態 | PR | 備註 |`）。
  已有該列只改這次有帶的欄，不新增列。--pr 7 與 --pr #7 都寫成 #7。
  --status 只准 running／queued／finished／failed／stalled／merged／closed／reverted。
  成功不印行。

sync
  用 `gh pr list --state merged|closed|open --base <BASE>` 對帳，再看 origin/<BASE> 上
  標題符合 `Revert "<slug> N.M:` 的 commit。每條 N.M 取時間最晚的事件。
  base 不是 BASE 的 PR 不算。--check 只印差異、不寫檔。
  算出 closed 或 reverted 時，只要 (a) 該 N.M 在 BASE 上還有 open PR，或
  (b) 該列狀態是 queued／running／finished，或 (c) 該列 PR 欄有值、卻不是這次
  事件涉及的 PR（closed 看被關的那個；reverted 看被 revert 的原始合併 PR），
  就不寫、也不列入待改動。merged 可以蓋過任何狀態。
  行格式：`SYNC <N.M> merged|reverted|closed [#n]`；完全一致印 `SYNC 一致`。

stale
  base 是 BASE 的 open PR，head 不含 origin/<BASE> 最新 commit 時印 `STALE #<n> <標題>`。
  都不落後（或沒有 open PR）印 `STALE 無`。比對前先 fetch BASE，再
  `git fetch origin <headRefName>`（抓不到再試 `pull/<n>/head`）。
  本機原本沒有 head 不算落後。fetch 後仍取不到就印
  「無法對帳：取不到 PR #<n> 的 head」、退出碼 2。

next
  每個會說話的 task 一行，最後一行 `NEXT READY <k>｜在飛 <m>｜上限 <n>`。
  `READY <N.M>`／`WAIT <N.M> <原因>`／`SKIP <N.M> <狀態>`／`SKIP <N.M> <狀態> 需人工`。
  在飛＝runs.md 裡狀態 running 的列數（finished 不佔上限，只佔所有權；queued 不算，仍可 READY）。
  上限：--max，否則主 repo docs/changes/README.md 的 MAX_CONCURRENT=<n>，再沒有用 3。
  有沒有所有權與 spec_merge.py 的 ownership_found 同步：task 行每個 `｜所有權：`，
  以及區塊裡每一條縮排的 `- 所有權：`／`- **所有權**：`（全形冒號）都收，取聯集。
  冒號後有反引號路徑就用那些；冒號後空白才看更深一層 `- ` 子項。半形 `所有權:` 不算。
  任一處有反引號路徑就算有。依賴認 `｜依賴：` 或縮排的 `- 依賴：`（`、`／`,` 分隔，或 `無`）。
  沒寫就沿用波次（前面各 ## 組全勾才可派）；`依賴：無` 不等任何 task。
  區塊到下一條 task（`^\\s*-\\s*\\[`）或第 0 欄 `#` 標題為止，中間的沒縮排文字不切斷。
  running／finished 佔用所有權。重疊：同一路徑；`a/**` 含 `a/` 底下任何路徑；
  任一邊含 glob 字元就用 fnmatch 雙向比。gate.env 的 SCHEMA_GLOB 同時最多一條 READY 或在飛。

退出碼：0 成功（含 sync --check 一致、stale 有結果、next、upsert）／
1 sync --check 有待改／2 用法錯、狀態非法、sync／stale 時 gh 不在或未登入
（印「無法對帳」，不寫檔），或 stale fetch 後仍取不到 PR head
（印「無法對帳：取不到 PR #<n> 的 head」）。
防什麼：手改簿記跟合併狀態對不上、同一批檔同時派兩條、running 的 task 被再派一次、
重派中的列被 sync 蓋回 closed／reverted、沒 fetch 到的 PR head 被誤判落後。
"""
import argparse
import datetime
import fnmatch
import json
import os
import re
import subprocess
import sys
import tempfile

STATUSES = ("running", "queued", "finished", "failed", "stalled", "merged", "closed", "reverted")
SKIP_PLAIN = ("running", "finished", "merged")
SKIP_HUMAN = ("failed", "stalled")
HOLDING = ("running", "finished")
COLS = ("task", "agentId", "runId", "狀態", "PR", "備註")
HEADER = "| task | agentId | runId | 狀態 | PR | 備註 |"
SEP = "|---|---|---|---|---|---|"

TASK_LINE = re.compile(r"^(\s*)-\s*\[([ xX])\]\s*(\d+\.\d+)(?=\s|$)")
H2 = re.compile(r"^##(?!#)\s+")
DEP_LINE = re.compile(r"^(?P<indent>\s+)-\s+(?:\*\*)?依賴(?:\*\*)?：\s*(?P<value>.*?)\s*$")
BAR_FIELD = re.compile(r"｜(所有權|依賴)：(.*?)(?=｜|$)")
ASSIGN = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
MAX_CONCURRENT = re.compile(r"^MAX_CONCURRENT\s*=\s*(\d+)", re.M)
BACKTICK = re.compile(r"`([^`]+)`")
# 以下四則與 spec_merge.py 的 TASK_ANY／HEADING／BACKTICK_PATH／OWN_SUB／OWN_INLINE 同步。
TASK_ANY = re.compile(r"^\s*-\s*\[")
HEADING = re.compile(r"^#{1,6}\s")
BACKTICK_PATH = re.compile(r"`[^`]+`")
OWN_SUB = re.compile(r"^-\s+(\*\*所有權\*\*|所有權)(：|:)(.*)$")
OWN_INLINE = re.compile(r"｜所有權(：|:)(.*?)(?=｜|$)")
REDISPATCH = ("queued", "running", "finished")


def read_text(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write_atomic(path, text):
    folder = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(prefix=".dispatch_state.", dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def task_key(tid):
    major, minor = tid.split(".")
    return (int(major), int(minor))


def backticks(text):
    return [p.strip() for p in BACKTICK.findall(text) if p.strip()]


def unique(items):
    out = []
    for item in items:
        if item not in out:
            out.append(item)
    return out


class Task:
    def __init__(self, tid, checked, section, ownership, deps):
        self.id = tid
        self.checked = checked
        self.section = section
        self.ownership = ownership  # None＝沒有反引號路徑；清單＝有
        self.deps = deps            # None＝沒寫（走波次）；清單＝明示，空清單＝無


def bar_field(line, name):
    for label, value in BAR_FIELD.findall(line):
        if label == name:
            return value.strip()
    return None


def indent_cols(line):
    """行首空白的欄寬。tab 算 4；全形空白算 1。與 spec_merge.py 的 indent_cols 同步。"""
    n = 0
    for ch in line:
        if ch == "\t":
            n += 4
        elif ch.isspace():
            n += 1
        else:
            break
    return n


def nested_has_backtick_path(lines, parent_indent):
    """更深一層的 `- ` 子項裡有沒有反引號路徑。碰到同層或更淺的非空行就停。
    與 spec_merge.py 的 nested_has_backtick_path 同步。"""
    for line in lines:
        if not line.strip():
            continue
        ind = indent_cols(line)
        if ind <= parent_indent:
            break
        content = line.lstrip()
        if re.match(r"^-\s+", content) and BACKTICK_PATH.search(content):
            return True
    return False


def ownership_found(task_line, body):
    """回 (有至少一個反引號路徑, 認得出的位置寫了半形冒號)。
    與 spec_merge.py 的 ownership_found 同步。

    只認 task 行上的「｜所有權：」，或縮排子行開頭的「- 所有權：」／「- **所有權**：」。
    冒號後有反引號路徑才算；冒號後是空白，才看更深一層的 `- ` 子項。
    """
    half = False

    def take(rest, following, parent_indent, fullwidth):
        nonlocal half
        if not fullwidth:
            half = True
            return False
        if BACKTICK_PATH.search(rest):
            return True
        if rest.strip() == "":
            return nested_has_backtick_path(following, parent_indent)
        return False

    for m in OWN_INLINE.finditer(task_line):
        if take(m.group(2), body, indent_cols(task_line), m.group(1) == "："):
            return True, False
    for i, line in enumerate(body):
        if not line[:1].isspace():
            continue
        m = OWN_SUB.match(line.lstrip())
        if not m:
            continue
        if take(m.group(3), body[i + 1:], indent_cols(line), m.group(2) == "："):
            return True, False
    return False, half


def nested_ownership_paths(lines, parent_indent):
    """與 nested_has_backtick_path 同一停點，改回收反引號路徑。"""
    paths = []
    for line in lines:
        if not line.strip():
            continue
        ind = indent_cols(line)
        if ind <= parent_indent:
            break
        content = line.lstrip()
        if re.match(r"^-\s+", content):
            paths.extend(backticks(content))
    return paths


def ownership_paths(task_line, body):
    """task 行每個「｜所有權：」與每一條縮排所有權子行的路徑聯集。
    認定位置與 spec_merge.py 的 ownership_found 同步：全形冒號才算；
    冒號後有反引號就用那些路徑；冒號後空白才看更深一層的「- 」子項。
    """
    paths = []

    def take(rest, following, parent_indent, fullwidth):
        if not fullwidth:
            return
        if BACKTICK_PATH.search(rest):
            paths.extend(backticks(rest))
            return
        if rest.strip() == "":
            paths.extend(nested_ownership_paths(following, parent_indent))

    for m in OWN_INLINE.finditer(task_line):
        take(m.group(2), body, indent_cols(task_line), m.group(1) == "：")
    for i, line in enumerate(body):
        if not line[:1].isspace():
            continue
        m = OWN_SUB.match(line.lstrip())
        if not m:
            continue
        take(m.group(3), body[i + 1:], indent_cols(line), m.group(2) == "：")
    return unique(paths)


def parse_dep_value(value):
    if value is None:
        return None
    if value in ("無", "无"):
        return []
    return re.findall(r"\d+\.\d+", value)


def parse_deps(task_line, block):
    for line in block:
        matched = DEP_LINE.match(line)
        if matched:
            return parse_dep_value(matched.group("value").strip())
    return parse_dep_value(bar_field(task_line, "依賴"))


def parse_tasks(text):
    lines = text.splitlines()
    tasks, section, i = [], 0, 0
    while i < len(lines):
        line = lines[i]
        if H2.match(line):
            section += 1
            i += 1
            continue
        m = TASK_LINE.match(line)
        if not m:
            i += 1
            continue
        i += 1
        # 區塊到下一條 task 或第 0 欄 # 標題為止。與 spec_merge.py 的
        # open_tasks_missing_ownership 同步：中間沒縮排的文字不切斷。
        block = []
        while i < len(lines) and not TASK_ANY.match(lines[i]) and not HEADING.match(lines[i]):
            block.append(lines[i])
            i += 1
        owned, _half = ownership_found(line, block)
        tasks.append(Task(
            m.group(3),
            m.group(2) in ("x", "X"),
            section,
            ownership_paths(line, block) if owned else None,
            parse_deps(line, block),
        ))
    return tasks


def load_env_file(path):
    vals = {}
    if not os.path.isfile(path):
        return vals
    for raw in read_text(path).splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = ASSIGN.match(line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        else:
            val = re.split(r"\s+#", val, maxsplit=1)[0].strip()
        vals[key] = val
    return vals


def resolve_base(change_dir, explicit):
    if explicit:
        return explicit
    base = load_env_file(os.path.join(change_dir, "gate.env")).get("BASE", "").strip()
    return base or "main"


def repo_root(change_dir):
    d = os.path.abspath(change_dir)
    return os.path.dirname(os.path.dirname(os.path.dirname(d)))


def max_concurrent(root):
    path = os.path.join(root, "docs", "changes", "README.md")
    if not os.path.isfile(path):
        return 3
    m = MAX_CONCURRENT.search(read_text(path))
    return int(m.group(1)) if m else 3


def schema_globs(change_dir):
    raw = load_env_file(os.path.join(change_dir, "gate.env")).get("SCHEMA_GLOB", "").strip()
    return raw.split() if raw else []


def is_glob(path):
    return any(ch in path for ch in "*?[]")


def doublestar_contains(pattern, path):
    """`a/**` 包含 `a/` 底下任何路徑（不含 a 自己）。"""
    if not pattern.endswith("/**"):
        return False
    prefix = pattern[:-3]
    return path.startswith(prefix + "/")


def paths_overlap(a, b):
    if a == b:
        return True
    if doublestar_contains(a, b) or doublestar_contains(b, a):
        return True
    if is_glob(a) or is_glob(b):
        if fnmatch.fnmatchcase(b, a) or fnmatch.fnmatchcase(a, b):
            return True
    return False


def lists_overlap(left, right):
    for a in left:
        for b in right:
            if paths_overlap(a, b):
                return True
    return False


def first_overlapping_path(blocked, holder):
    for path in blocked:
        if any(paths_overlap(path, other) for other in holder):
            return path
    return None


def cell(value):
    return (value or "").replace("|", "／").replace("\n", " ").strip()


def is_separator(cells):
    return bool(cells) and all(re.fullmatch(r":?-{1,}:?", c) for c in cells)


def load_runs(path):
    if not os.path.isfile(path):
        return []
    rows = []
    for line in read_text(path).splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if not cells or cells[0] == "task" or is_separator(cells):
            continue
        row = {col: "" for col in COLS}
        for i, col in enumerate(COLS):
            if i < len(cells):
                row[col] = cells[i]
        rows.append(row)
    return rows


def render_runs(rows):
    lines = [HEADER, SEP]
    for row in rows:
        lines.append("| " + " | ".join(cell(row.get(col, "")) for col in COLS) + " |")
    return "\n".join(lines) + "\n"


def norm_pr(raw):
    text = (raw or "").strip()
    if text.startswith("#"):
        text = text[1:]
    if not text.isdigit():
        return None
    return "#" + str(int(text))


def pr_from_number(number):
    if number is None or number == "":
        return ""
    try:
        return "#" + str(int(number))
    except (TypeError, ValueError):
        return ""


def gh_exe():
    return os.environ.get("DISPATCH_STATE_GH") or "gh"


def run_gh(args):
    exe = gh_exe()
    override = os.environ.get("DISPATCH_STATE_GH")
    if override and (os.sep in override) and not (os.path.isfile(override) and os.access(override, os.X_OK)):
        return None
    try:
        return subprocess.run([exe, *args], capture_output=True, text=True, encoding="utf-8")
    except FileNotFoundError:
        return None


def gh_ready():
    result = run_gh(["auth", "status"])
    if result is None or result.returncode != 0:
        print("無法對帳")
        return False
    return True


def gh_pr_list(state, base):
    result = run_gh([
        "pr", "list", "--state", state, "--base", base, "--limit", "200",
        "--json", "number,title,mergedAt,closedAt,baseRefName,headRefOid,headRefName",
    ])
    if result is None or result.returncode != 0:
        return None
    try:
        data = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return None
    if not isinstance(data, list):
        return None
    return data


def base_matches(pr, base):
    name = pr.get("baseRefName")
    if name is None or name == "":
        return True
    return name == base


def run_git(cwd, args, timeout=60):
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    try:
        return subprocess.run(
            ["git", "-C", cwd, *args],
            capture_output=True, text=True, encoding="utf-8", timeout=timeout, env=env,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None


def git_root(change_dir):
    result = run_git(change_dir, ["rev-parse", "--show-toplevel"])
    if result is None or result.returncode != 0:
        return None
    return result.stdout.strip()


def fetch_base(root, base):
    remote = run_git(root, ["remote", "get-url", "origin"])
    if remote is None or remote.returncode != 0:
        return
    run_git(root, ["fetch", "origin", base])


def parse_time(value):
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed


def title_patterns(slug):
    esc = re.escape(slug)
    return (
        re.compile(rf"^{esc} (\d+\.\d+):"),
        re.compile(rf'^Revert "{esc} (\d+\.\d+):'),
    )


class Event:
    def __init__(self, when, kind, pr):
        self.when = when
        self.kind = kind
        self.pr = pr

    def rank(self):
        # 時間相同時合併蓋過 revert：spec 要求 revert 必須晚於該次合併。
        return (self.when, 1 if self.kind == "merge" else 0)


def origin_revert_events(root, base, slug, known):
    result = run_git(root, ["log", f"origin/{base}", "--format=%cI%x09%s"])
    if result is None or result.returncode != 0:
        return []
    _, revert_re = title_patterns(slug)
    found = []
    for line in result.stdout.splitlines():
        if "\t" not in line:
            continue
        stamp, subject = line.split("\t", 1)
        matched = revert_re.match(subject.strip())
        when = parse_time(stamp)
        if not matched or when is None:
            continue
        tid = matched.group(1)
        if tid in known:
            found.append((tid, Event(when, "revert", "")))
    return found


def apply_marks(text, marks):
    """marks：{task id: 'x' 或 ' '}。只改勾選字元，其餘逐字保留。"""
    if not marks:
        return text
    lines = text.splitlines(keepends=True)
    out = []
    for line in lines:
        if line.endswith("\r\n"):
            core, nl = line[:-2], "\r\n"
        elif line.endswith("\n"):
            core, nl = line[:-1], "\n"
        else:
            core, nl = line, ""
        new = core
        for tid, mark in marks.items():
            matched = re.match(
                r"^(\s*-\s*\[)([ xX])(\]\s*)" + re.escape(tid) + r"(?=\s|$)",
                core,
            )
            if not matched:
                continue
            if matched.group(2) != mark:
                new = matched.group(1) + mark + matched.group(3) + tid + core[matched.end():]
            break
        out.append(new + nl)
    return "".join(out)


def sync_line(tid, status, pr):
    if pr:
        return f"SYNC {tid} {status} {pr}"
    return f"SYNC {tid} {status}"


def blank_row(tid):
    row = {col: "" for col in COLS}
    row["task"] = tid
    return row


def find_row(rows, tid):
    for row in rows:
        if row["task"] == tid:
            return row
    return None


def cmd_upsert(change_dir, tid, updates):
    if not re.fullmatch(r"\d+\.\d+", tid):
        print(f"用法錯：task 應為 N.M，收到 {tid}")
        return 2
    if not updates:
        print("用法錯：至少要帶一個欄位（--agent／--run／--status／--pr／--note）")
        return 2
    if "狀態" in updates and updates["狀態"] not in STATUSES:
        print(f"狀態非法：{updates['狀態']}（只准 {'／'.join(STATUSES)}）")
        return 2
    path = os.path.join(change_dir, "runs.md")
    rows = load_runs(path)
    row = find_row(rows, tid)
    if row is None:
        row = blank_row(tid)
        rows.append(row)
    for key, value in updates.items():
        row[key] = value
    write_atomic(path, render_runs(rows))
    return 0


def plan_sync(change_dir, base):
    """回 (新 tasks 本文, 新 runs 列, [(tid, 狀態, PR)])。gh 失敗回 None。"""
    tasks_path = os.path.join(change_dir, "tasks.md")
    tasks_text = read_text(tasks_path)
    tasks = parse_tasks(tasks_text)
    known = {t.id: t for t in tasks}
    slug = os.path.basename(change_dir.rstrip("/"))
    merged = gh_pr_list("merged", base)
    closed = gh_pr_list("closed", base)
    opened = gh_pr_list("open", base)
    if merged is None or closed is None or opened is None:
        return None
    done_re, revert_re = title_patterns(slug)
    events = {tid: [] for tid in known}
    for pr in merged:
        if not base_matches(pr, base):
            continue
        title = (pr.get("title") or "").strip()
        when = parse_time(pr.get("mergedAt"))
        if when is None:
            continue
        kind, tid = None, None
        merged_hit = done_re.match(title)
        revert_hit = revert_re.match(title)
        if merged_hit:
            kind, tid = "merge", merged_hit.group(1)
        elif revert_hit:
            kind, tid = "revert", revert_hit.group(1)
        if tid in events and kind:
            events[tid].append(Event(when, kind, pr_from_number(pr.get("number"))))
    root = git_root(change_dir)
    if root:
        fetch_base(root, base)
        for tid, event in origin_revert_events(root, base, slug, events):
            events[tid].append(event)
    closed_of = {}
    for pr in closed:
        if not base_matches(pr, base):
            continue
        if pr.get("mergedAt"):
            continue
        title = (pr.get("title") or "").strip()
        hit = done_re.match(title)
        if not hit or hit.group(1) not in known:
            continue
        tid = hit.group(1)
        when = parse_time(pr.get("closedAt")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
        number = int(pr.get("number") or 0)
        prev = closed_of.get(tid)
        if prev is None or (when, number) >= (prev[0], prev[1]):
            closed_of[tid] = (when, number, pr_from_number(pr.get("number")))
    open_of = set()
    for pr in opened:
        if not base_matches(pr, base):
            continue
        hit = done_re.match((pr.get("title") or "").strip())
        if hit and hit.group(1) in known:
            open_of.add(hit.group(1))
    old_rows = load_runs(os.path.join(change_dir, "runs.md"))
    new_rows = [dict(row) for row in old_rows]
    marks = {}
    changes = []
    for task in sorted(tasks, key=lambda t: task_key(t.id)):
        tid = task.id
        evs = events[tid]
        desired = None
        event_pr = ""
        if evs:
            winner = max(evs, key=lambda e: e.rank())
            if winner.kind == "merge":
                desired = ("merged", winner.pr, True)
                event_pr = winner.pr
            else:
                merges = [e for e in evs if e.kind == "merge" and e.pr]
                merge_pr = max(merges, key=lambda e: e.rank()).pr if merges else ""
                existing = find_row(old_rows, tid)
                pr = merge_pr or (existing["PR"] if existing else "")
                desired = ("reverted", pr, False)
                # reverted 的事件 PR 是被 revert 的原始合併 PR，不是 revert PR 自己。
                event_pr = merge_pr
        elif tid in closed_of and not any(e.kind == "merge" for e in evs):
            desired = ("closed", closed_of[tid][2], None)
            event_pr = closed_of[tid][2]
        if desired is None:
            continue
        status, pr, checked = desired
        row = find_row(new_rows, tid)
        # sync 不蓋重派中的列：closed／reverted 碰到 (a)(b)(c) 任一條就不寫。
        # merged 不受此限。
        if status in ("closed", "reverted") and (
            tid in open_of
            or (row is not None and row["狀態"] in REDISPATCH)
            or (row is not None and (row.get("PR") or "") and (row.get("PR") or "") != event_pr)
        ):
            continue
        mark_changed = checked is not None and task.checked != checked
        row_changed = row is None or row["狀態"] != status or row["PR"] != pr
        if not mark_changed and not row_changed:
            continue
        if mark_changed:
            marks[tid] = "x" if checked else " "
        if row is None:
            row = blank_row(tid)
            new_rows.append(row)
        row["狀態"] = status
        row["PR"] = pr
        changes.append((tid, status, pr))
    return apply_marks(tasks_text, marks), new_rows, changes


def cmd_sync(change_dir, base, check):
    tasks_path = os.path.join(change_dir, "tasks.md")
    if not os.path.isfile(tasks_path):
        print(f"用法錯：{tasks_path} 不存在")
        return 2
    if not gh_ready():
        return 2
    planned = plan_sync(change_dir, base)
    if planned is None:
        print("無法對帳")
        return 2
    new_tasks, new_rows, changes = planned
    runs_path = os.path.join(change_dir, "runs.md")
    old_tasks = read_text(tasks_path)
    old_rows = load_runs(runs_path)
    tasks_differ = new_tasks != old_tasks
    runs_differ = [tuple(row.get(col, "") for col in COLS) for row in old_rows] != [
        tuple(row.get(col, "") for col in COLS) for row in new_rows
    ]
    if not tasks_differ and not runs_differ:
        print("SYNC 一致")
        return 0
    for tid, status, pr in changes:
        print(sync_line(tid, status, pr))
    if check:
        return 1
    if tasks_differ:
        write_atomic(tasks_path, new_tasks)
    if runs_differ:
        write_atomic(runs_path, render_runs(new_rows))
    return 0


def commit_exists(root, oid):
    if not oid:
        return False
    probe = run_git(root, ["cat-file", "-e", f"{oid}^{{commit}}"])
    return probe is not None and probe.returncode == 0


def head_contains(root, base_oid, head_oid):
    if not commit_exists(root, head_oid):
        return False
    anc = run_git(root, ["merge-base", "--is-ancestor", base_oid, head_oid])
    return anc is not None and anc.returncode == 0


def ensure_pr_head(root, pr):
    """比對前先 fetch。回傳 head commit 是否到得了本機。

    先 `git fetch origin <headRefName>`；還是沒有這個 commit 就再試 `pull/<n>/head`。
    """
    oid = (pr.get("headRefOid") or "").strip()
    ref = (pr.get("headRefName") or "").strip()
    if ref:
        run_git(root, ["fetch", "origin", ref])
    if commit_exists(root, oid):
        return True
    number = pr.get("number")
    if number not in (None, ""):
        try:
            n = int(number)
        except (TypeError, ValueError):
            n = None
        if n is not None:
            run_git(root, ["fetch", "origin", f"pull/{n}/head"])
    return commit_exists(root, oid)


def cmd_stale(change_dir, base):
    if not gh_ready():
        return 2
    prs = gh_pr_list("open", base)
    if prs is None:
        print("無法對帳")
        return 2
    prs = [pr for pr in prs if base_matches(pr, base)]
    if not prs:
        print("STALE 無")
        return 0
    root = git_root(change_dir)
    if root is None:
        print("無法對帳")
        return 2
    fetch_base(root, base)
    rev = run_git(root, ["rev-parse", f"origin/{base}"])
    if rev is None or rev.returncode != 0:
        print("無法對帳")
        return 2
    base_oid = rev.stdout.strip()
    missing = []
    for pr in prs:
        if not ensure_pr_head(root, pr):
            missing.append(pr)
    if missing:
        for pr in sorted(missing, key=lambda item: int(item.get("number") or 0)):
            print(f"無法對帳：取不到 PR #{pr.get('number')} 的 head")
        return 2
    behind = []
    for pr in prs:
        oid = (pr.get("headRefOid") or "").strip()
        if not head_contains(root, base_oid, oid):
            behind.append(pr)
    if not behind:
        print("STALE 無")
        return 0
    for pr in sorted(behind, key=lambda item: int(item.get("number") or 0)):
        number = pr.get("number")
        title = (pr.get("title") or "").strip()
        print(f"STALE #{number} {title}")
    return 0


def wave_clear(task, tasks):
    return all(other.checked for other in tasks if other.section < task.section)


def unmet_deps(task, by_id):
    missing = []
    for dep in task.deps:
        other = by_id.get(dep)
        if other is None or not other.checked:
            missing.append(dep)
    return missing


def find_conflict(task, holders):
    """回 (對方 task, 這條自己重疊的路徑)。編號小的佔用者優先。"""
    for holder in sorted(holders, key=lambda item: task_key(item.id)):
        if holder.id == task.id or not holder.ownership:
            continue
        path = first_overlapping_path(task.ownership, holder.ownership)
        if path:
            return holder, path
    return None, None


def cmd_next(change_dir, max_n):
    tasks_path = os.path.join(change_dir, "tasks.md")
    if not os.path.isfile(tasks_path):
        print(f"用法錯：{tasks_path} 不存在")
        return 2
    if max_n is None:
        max_n = max_concurrent(repo_root(change_dir))
    elif max_n < 0:
        print("用法錯：--max 不可為負")
        return 2
    tasks = parse_tasks(read_text(tasks_path))
    rows = load_runs(os.path.join(change_dir, "runs.md"))
    status = {row["task"]: row["狀態"] for row in rows}
    by_id = {task.id: task for task in tasks}
    globs = schema_globs(change_dir)
    in_flight = sum(1 for row in rows if row["狀態"] == "running")
    holders = [
        task for task in tasks
        if status.get(task.id) in HOLDING and task.ownership
    ]
    schema_busy = any(
        status.get(task.id) == "running" and task.ownership and lists_overlap(task.ownership, globs)
        for task in tasks
    )
    lines = {}
    candidates = []
    for task in sorted(tasks, key=lambda item: task_key(item.id)):
        st = status.get(task.id, "")
        if st in SKIP_PLAIN:
            lines[task.id] = f"SKIP {task.id} {st}"
            continue
        if st in SKIP_HUMAN:
            lines[task.id] = f"SKIP {task.id} {st} 需人工"
            continue
        if task.checked:
            continue
        if task.ownership is None:
            lines[task.id] = f"WAIT {task.id} 缺所有權"
            continue
        if task.deps is not None:
            missing = unmet_deps(task, by_id)
            if missing:
                lines[task.id] = f"WAIT {task.id} 依賴 {'、'.join(missing)} 未合併"
                continue
        elif not wave_clear(task, tasks):
            lines[task.id] = f"WAIT {task.id} 前波未合併"
            continue
        candidates.append(task)
    ready = []
    slots = max(0, max_n - in_flight)
    for task in candidates:
        holder, path = find_conflict(task, holders + ready)
        if holder is not None:
            lines[task.id] = f"WAIT {task.id} 所有權與 {holder.id} 重疊：{path}"
            continue
        if globs and lists_overlap(task.ownership, globs) and schema_busy:
            lines[task.id] = f"WAIT {task.id} schema 序列化"
            continue
        if len(ready) >= slots:
            lines[task.id] = f"WAIT {task.id} 超過上限"
            continue
        ready.append(task)
        if globs and lists_overlap(task.ownership, globs):
            schema_busy = True
        lines[task.id] = f"READY {task.id}"
    for task in sorted(tasks, key=lambda item: task_key(item.id)):
        if task.id in lines:
            print(lines[task.id])
    print(f"NEXT READY {len(ready)}｜在飛 {in_flight}｜上限 {max_n}")
    return 0


def require_dir(path):
    if not os.path.isdir(path):
        print(f"用法錯：{path} 不是目錄")
        return None
    return os.path.abspath(path)


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 2
    parser = argparse.ArgumentParser(prog="dispatch_state.py", add_help=False, allow_abbrev=False)
    sub = parser.add_subparsers(dest="cmd")

    upsert = sub.add_parser("upsert-run", add_help=False)
    upsert.add_argument("change_dir")
    upsert.add_argument("task")
    upsert.add_argument("--agent")
    upsert.add_argument("--run")
    upsert.add_argument("--status")
    upsert.add_argument("--pr")
    upsert.add_argument("--note")

    sync = sub.add_parser("sync", add_help=False)
    sync.add_argument("change_dir")
    sync.add_argument("--base")
    sync.add_argument("--check", action="store_true")

    stale = sub.add_parser("stale", add_help=False)
    stale.add_argument("change_dir")
    stale.add_argument("--base")

    nxt = sub.add_parser("next", add_help=False)
    nxt.add_argument("change_dir")
    nxt.add_argument("--max", type=int)
    nxt.add_argument("--base")

    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        code = exc.code
        return code if isinstance(code, int) else 2
    if not args.cmd:
        print(__doc__.strip())
        return 2
    change_dir = require_dir(args.change_dir)
    if change_dir is None:
        return 2
    if args.cmd == "upsert-run":
        updates = {}
        if args.agent is not None:
            updates["agentId"] = args.agent
        if args.run is not None:
            updates["runId"] = args.run
        if args.status is not None:
            updates["狀態"] = args.status
        if args.pr is not None:
            pr = norm_pr(args.pr)
            if pr is None:
                print(f"用法錯：--pr 要是數字，收到 {args.pr}")
                return 2
            updates["PR"] = pr
        if args.note is not None:
            updates["備註"] = args.note
        return cmd_upsert(change_dir, args.task, updates)
    if args.cmd == "sync":
        return cmd_sync(change_dir, resolve_base(change_dir, args.base), args.check)
    if args.cmd == "stale":
        return cmd_stale(change_dir, resolve_base(change_dir, args.base))
    return cmd_next(change_dir, args.max)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
