#!/usr/bin/env python3
"""spec_merge — per-change spec 層的唯一工具（單檔、只用標準庫，安裝時複製成 <repo>/scripts/spec_merge.py）。

用法：
  spec_merge.py check [<root>]         驗 docs/changes/*/{spec,tasks}.md 與 SPEC.md 的結構；不寫檔（pre-commit 掛這個）
  spec_merge.py <change-dir>           dry-run：印出合併後 SPEC.md 的 unified diff 與一行摘要
  spec_merge.py <change-dir> --apply   寫入 SPEC.md，印下一步 `git mv` 指令（不代做）

格式是 OpenSpec 的子集，本文見 docs/changes/README.md。標題比對：trim 後大小寫敏感。
合併順序 REMOVED → MODIFIED → ADDED；MODIFIED 的 Scenario 數不得少於現有（那是靜默丟失）。
缺檔一律跳過不當紅。退出碼：0 綠／1 內容或格式錯（一次收齊）／2 用法或路徑錯。
死法：連續 6 輪 docs/archive/rounds.md 的「changes 歸檔 N」不變 ＝ 沒人走這層，刪本檔與 docs/changes/，
pre-commit 的迴圈會自然跳過，不必改。
"""
import datetime
import difflib
import os
import re
import sys
from collections import OrderedDict

H2 = re.compile(r"^##\s+(.+?)\s*$")
REQ = re.compile(r"^###\s+Requirement:\s*(.+?)\s*$")
SCN = re.compile(r"^####\s+Scenario:\s*(.+?)\s*$")
WHEN = re.compile(r"^\s*-\s+\*\*WHEN\*\*")
THEN = re.compile(r"^\s*-\s+\*\*THEN\*\*")
TASK_ANY = re.compile(r"^\s*-\s*\[")
TASK_OK = re.compile(r"^\s*-\s*\[( |[xX])\]\s*\d+\.\d+\s+\S")
TASK_DONE = re.compile(r"^\s*-\s*\[[xX]\]")
ADDED, MODIFIED, REMOVED = "ADDED Requirements", "MODIFIED Requirements", "REMOVED Requirements"
DELTA_OK = ("Purpose", "不做", ADDED, MODIFIED, REMOVED)
SPEC_OK = ("Purpose", "Requirements")
MAX_ACTIVE = 3          # 進行中 change 超過就警告：先收一個再開
SPEC_WARN_CHARS = 6_000  # 單份 delta 超過就警告：spec 只寫可觀察行為


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def sections(text):
    """回 (前言行, [(## 標題, 本文行)])。"""
    pre, secs, cur = [], [], None
    for line in text.splitlines():
        m = H2.match(line)
        if m:
            cur = (m.group(1), [])
            secs.append(cur)
        elif cur is None:
            pre.append(line)
        else:
            cur[1].append(line)
    return pre, secs


def scenarios(block):
    out = []
    for line in block[1:]:
        m = SCN.match(line)
        if m:
            out.append((m.group(1), []))
        elif out:
            out[-1][1].append(line)
    return out


def norm(block):
    return "\n".join(l.rstrip() for l in block).strip()


def parse_reqs(body, where, fails, need_scn=True):
    """本文行 → OrderedDict{名: 區塊行}。重複標題、### 前的雜文、零 Scenario、缺 WHEN／THEN 都進 fails。"""
    reqs, name, stray = OrderedDict(), None, False
    for line in body:
        m = REQ.match(line)
        if m:
            name = m.group(1)
            if name in reqs:
                fails.append(f"{where}：Requirement「{name}」重複")
            reqs[name] = [line]
        elif name is None:
            stray = stray or bool(line.strip())
        else:
            reqs[name].append(line)
    if stray:
        fails.append(f"{where}：`### Requirement:` 之前有雜文，這節只能放 Requirement 區塊")
    if need_scn:
        for n, blk in reqs.items():
            scns = scenarios(blk)
            if not scns:
                fails.append(f"{where}：Requirement「{n}」沒有 Scenario（每條至少一個 `#### Scenario:`）")
            for sn, lines in scns:
                if not any(WHEN.match(l) for l in lines) or not any(THEN.match(l) for l in lines):
                    fails.append(f"{where}：Scenario「{sn}」缺 `- **WHEN**` 或 `- **THEN**`")
    return reqs


def load_delta(change_dir, fails, label=None):
    """docs/changes/<slug>/spec.md → (purpose 行, {ADDED/MODIFIED/REMOVED: reqs})。"""
    where = f"{label or change_dir}/spec.md"
    _, secs = sections(read(os.path.join(change_dir, "spec.md")))
    purpose, delta, seen = [], {k: OrderedDict() for k in (ADDED, MODIFIED, REMOVED)}, {}
    for h2, body in secs:
        if h2 not in DELTA_OK:
            fails.append(f"{where}：不允許的節「## {h2}」（只准 {'／'.join(DELTA_OK)}）")
        elif h2 == "Purpose":
            purpose = [l.rstrip() for l in body if l.strip()]
        elif h2 == "不做":
            continue
        else:
            delta[h2] = parse_reqs(body, f"{where} {h2}", fails, need_scn=(h2 != REMOVED))
            for n in delta[h2]:
                if n in seen:
                    fails.append(f"{where}：Requirement「{n}」同時出現在 {seen[n]} 與 {h2}")
                seen[n] = h2
    if not any(delta.values()):
        fails.append(f"{where}：ADDED／MODIFIED／REMOVED 三節皆空，沒東西可合併")
    return purpose, delta


def load_spec(path, fails):
    """SPEC.md → (標題行, purpose 行, reqs)；不存在回 None。"""
    if not os.path.isfile(path):
        return None
    pre, secs = sections(read(path))
    title = next((l for l in pre if l.startswith("# ")), "# Specification")
    purpose, reqs = [], OrderedDict()
    for h2, body in secs:
        if h2 not in SPEC_OK:
            fails.append(f"SPEC.md：不允許的節「## {h2}」（只准 Purpose／Requirements；delta 標題不得進主 spec）")
        elif h2 == "Purpose":
            purpose = [l.rstrip() for l in body if l.strip()]
        else:
            reqs = parse_reqs(body, "SPEC.md", fails)
    return title, purpose, reqs


def merge(current, delta, fails, warns):
    out = OrderedDict(current)
    for n in delta[REMOVED]:
        if n in out:
            del out[n]
        else:
            warns.append(f"REMOVED「{n}」在 SPEC.md 不存在，視為已移除")
    for n, blk in delta[MODIFIED].items():
        if n not in out:
            fails.append(f"MODIFIED「{n}」在 SPEC.md 不存在（新需求請放 ADDED）")
            continue
        was, now = len(scenarios(out[n])), len(scenarios(blk))
        if now < was:
            fails.append(f"MODIFIED「{n}」Scenario {was} → {now}，會靜默丟失；MODIFIED 必須帶完整區塊")
            continue
        out[n] = blk
    for n, blk in delta[ADDED].items():
        if n not in out:
            out[n] = blk
        elif norm(out[n]) == norm(blk):
            warns.append(f"ADDED「{n}」已存在且內容相同，跳過")
        else:
            fails.append(f"ADDED「{n}」已存在且內容不同（要改請用 MODIFIED）")
    return out


def render(title, purpose, reqs):
    parts = [title, "", "## Purpose", *(purpose or ["TBD"]), "", "## Requirements"]
    for blk in reqs.values():
        parts += ["", norm(blk)]
    return "\n".join(parts).rstrip() + "\n"


def tasks_stats(text):
    """回 (總數, 已勾, 未勾, 格式錯的行號, 沒寫「驗：」的條數)。"""
    total = done = noverify = 0
    bad = []
    for i, line in enumerate(text.splitlines(), 1):
        if not TASK_ANY.match(line):
            continue
        if not TASK_OK.match(line):
            bad.append(i)
            continue
        total += 1
        done += bool(TASK_DONE.match(line))
        noverify += "驗：" not in line
    return total, done, total - done, bad, noverify


def report(tag, fails, warns):
    for w in warns:
        print("⚠️ ", w)
    if fails:
        print(f"{tag} FAIL:")
        for x in fails:
            print(" -", x)
        return 1
    return 0


def run_merge(change_dir, apply):
    change_dir = os.path.abspath(change_dir.rstrip("/"))
    if not os.path.isfile(os.path.join(change_dir, "spec.md")):
        print(f"SPEC_MERGE 用法錯：{change_dir}/spec.md 不存在")
        return 2
    root = os.path.dirname(os.path.dirname(os.path.dirname(change_dir)))
    slug = os.path.basename(change_dir)
    spec_path = os.path.join(root, "SPEC.md")
    fails, warns = [], []
    purpose, delta = load_delta(change_dir, fails, f"docs/changes/{slug}")
    cur = load_spec(spec_path, fails)
    if fails:
        return report("SPEC_MERGE", fails, warns)
    title, cur_purpose, cur_reqs = cur or (f"# {os.path.basename(root)} Specification", purpose, OrderedDict())
    new = merge(cur_reqs, delta, fails, warns)
    tasks_path = os.path.join(change_dir, "tasks.md")
    if os.path.isfile(tasks_path):
        _, _, open_n, _, _ = tasks_stats(read(tasks_path))
        if open_n:
            (fails if apply else warns).append(f"tasks.md 尚有 {open_n} 項未完成，不得合併" if apply
                                              else f"tasks.md 尚有 {open_n} 項未完成（--apply 會擋）")
    if fails:
        return report("SPEC_MERGE", fails, warns)
    old = read(spec_path) if cur else ""
    text = render(title, cur_purpose, new)
    summary = (f"-{len(delta[REMOVED])} ~{len(delta[MODIFIED])} +{len(delta[ADDED])} → 共 {len(new)} 條 Requirement"
               f"（repo root：{root}）")
    for w in warns:
        print("⚠️ ", w)
    if apply:
        with open(spec_path, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"SPEC_MERGE OK：{summary}，已寫入 SPEC.md")
        print(f"下一步：mkdir -p docs/archive/changes && git mv docs/changes/{slug} "
              f"docs/archive/changes/{datetime.date.today().isoformat()}-{slug}")
    else:
        sys.stdout.writelines(difflib.unified_diff(old.splitlines(True), text.splitlines(True),
                                                   "SPEC.md", f"SPEC.md (+{slug})"))
        print(f"SPEC_MERGE DRY-RUN：{summary}；加 --apply 才寫入")
    return 0


def run_check(root):
    root = os.path.abspath(root)
    fails, warns = [], []
    cdir = os.path.join(root, "docs", "changes")
    slugs = sorted(d for d in os.listdir(cdir)
                   if os.path.isdir(os.path.join(cdir, d)) and not d.startswith(".")) if os.path.isdir(cdir) else []
    for s in slugs:
        d, rel = os.path.join(cdir, s), f"docs/changes/{s}"
        if os.path.isfile(os.path.join(d, "spec.md")):
            load_delta(d, fails, rel)
            n = len(read(os.path.join(d, "spec.md")))
            if n > SPEC_WARN_CHARS:
                warns.append(f"{rel}/spec.md {n:,} 字 > {SPEC_WARN_CHARS:,}：spec 只寫可觀察行為，設計與步驟不進來")
        if os.path.isfile(os.path.join(d, "tasks.md")):
            total, done, _, bad, noverify = tasks_stats(read(os.path.join(d, "tasks.md")))
            for i in bad:
                fails.append(f"{rel}/tasks.md L{i}：task 行格式錯，應為 `- [ ] N.M <結果> ｜驗：<怎麼驗>`")
            if total == 0 and not bad:
                fails.append(f"{rel}/tasks.md 沒有任何 task")
            if noverify:
                warns.append(f"{rel}/tasks.md 有 {noverify} 條沒寫「驗：」")
            if total and done == total:
                warns.append(f"{rel} 任務全勾但未歸檔 → python3 scripts/spec_merge.py {rel} --apply，再 git mv 進 docs/archive/changes/")
    if len(slugs) > MAX_ACTIVE:
        warns.append(f"docs/changes/ 進行中 {len(slugs)} > {MAX_ACTIVE}（{'、'.join(slugs)}）——先收一個再開")
    spec = load_spec(os.path.join(root, "SPEC.md"), fails)
    rc = report("SPEC_MERGE CHECK", fails, warns)
    if rc == 0:
        print(f"SPEC_MERGE CHECK OK（進行中 change {len(slugs)}/{MAX_ACTIVE}"
              f"{'' if os.path.isdir(cdir) else '，docs/changes/ 不存在跳過'}、"
              f"SPEC.md {'無' if spec is None else f'{len(spec[2])} 條 Requirement'}）")
    return rc


def main(argv):
    args = [a for a in argv if a != "--apply"]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 2
    if args[0] == "check":
        return run_check(args[1] if len(args) > 1 else ".")
    if not os.path.isdir(args[0]):
        print(f"SPEC_MERGE 用法錯：{args[0]} 不是目錄")
        return 2
    return run_merge(args[0], "--apply" in argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
