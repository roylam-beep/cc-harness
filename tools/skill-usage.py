#!/usr/bin/env python3
"""skill-usage.py — 從 Claude Code 逐字稿算 skill 實際使用量（harness 死法／退役判準的唯一資料源）。

讀 ~/.claude/projects/*/*.jsonl。使用者打的 slash command 取 <command-name> 標籤；
agent 派的取 Skill tool_use。日期取訊息內嵌 timestamp（不是檔案 mtime——mtime 會被 resume 改寫）。

用法：
  python3 tools/skill-usage.py                 # 全部 repo、全部時間
  python3 tools/skill-usage.py --days 30       # 近 30 天
  python3 tools/skill-usage.py --repo google-meta-ads   # 只算路徑含此字串的 repo
  python3 tools/skill-usage.py --family        # 只列 cc-* 與其舊名（見 ALIASES）
  python3 tools/skill-usage.py --oneline       # 一行摘要，給 session-start hook 印
  python3 tools/skill-usage.py --toolcount     # 每次 slash 呼叫到「使用者下一句」之間的 tool call 數（A/B 基線）

輸出只含 skill 名、次數、日期、repo 目錄名末段；不讀訊息正文，不會帶出任何內容。
死法：Claude Code 若改變逐字稿格式（標籤或 tool_use 結構），本腳本歸零輸出＝該修不該信。
"""
import argparse, collections, datetime as dt, glob, json, os, re, sys

ALIASES = {  # 現名: 舊名（改名會重設計數器，這張表把它接回去）
    "cc-close": ["round", "next-round"], "cc-handover": ["handover"], "cc-gate": ["gate"],
    "cc-harness": ["ff-harness", "harness"], "cc-show": ["show"], "cc-plan": ["plan"],
    "cc-explore": ["explore"], "cc-grill": ["grill"], "cc-audit": ["audit"],
    "cc-diagnose-source": ["diagnose-source"], "cc-hermes-mcp-test": ["hermes-mcp-test"],
    "cc-explain": ["simple-explain"],  # 併入 plugin 時改名，31 次／30 天的計數器由這行接回
}
BUILTIN = {"model", "compact", "context", "clear", "help", "init", "login", "mcp", "plugin", "effort", "usage-credits"}

# 搬進 plugin 後，同一支 skill 在逐字稿裡叫 `cc-harness:cc-close`（plugin 名做前綴，
# 實測自 codex plugin 的 `codex:rescue`）。不剝前綴＝計數器歸零＝違反原則 4，
# 所以這裡先剝再查 ALIASES。
PLUGIN_PREFIXES = ("cc-harness:",)

def canon(name):
    for p in PLUGIN_PREFIXES:
        if name.startswith(p): name = name[len(p):]; break
    for k, v in ALIASES.items():
        if name == k or name in v: return k
    return name

def scan(base, days, repo_filter, exclude_session):
    since = (dt.datetime.utcnow() - dt.timedelta(days=days)).strftime("%Y-%m-%d") if days else ""
    rows = collections.defaultdict(list)  # (repo, skill, kind) -> [date]
    for d in sorted(os.listdir(base)):
        if repo_filter and repo_filter not in d: continue
        for f in glob.glob(os.path.join(base, d, "*.jsonl")):
            if exclude_session and exclude_session in f: continue
            with open(f, encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    if "<command-name>" not in line and '"Skill"' not in line: continue
                    try: o = json.loads(line)
                    except json.JSONDecodeError: continue
                    ts = (o.get("timestamp") or "")[:10]
                    if since and ts < since: continue
                    m = o.get("message") or {}
                    c = m.get("content") if isinstance(m, dict) else None
                    if o.get("type") == "user" and isinstance(c, str):
                        for n in re.findall(r"<command-name>/([A-Za-z0-9:_-]+)</command-name>", c):
                            rows[(d, canon(n), "user")].append(ts)
                    elif o.get("type") == "assistant" and isinstance(c, list):
                        for b in c:
                            if b.get("type") == "tool_use" and b.get("name") == "Skill":
                                rows[(d, canon(b.get("input", {}).get("skill", "?")), "agent")].append(ts)
    return rows

def episodes(base, days, repo_filter, exclude_session):
    """一次 slash 呼叫 = 一段 episode：從使用者打 /X 那則，到使用者下一則自己打的訊息為止。
    回 [(skill, date, tool_calls, repo)]。tool_calls 只數 assistant 的 tool_use block。
    這是 P3 A/B 的分子：同一支 skill 改寫前後，跑完一次要花幾個 tool call。"""
    since = (dt.datetime.utcnow() - dt.timedelta(days=days)).strftime("%Y-%m-%d") if days else ""
    out = []
    for d in sorted(os.listdir(base)):
        if repo_filter and repo_filter not in d: continue
        for f in glob.glob(os.path.join(base, d, "*.jsonl")):
            if exclude_session and exclude_session in f: continue
            cur = None  # [skill, date, count]
            with open(f, encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    if '"type"' not in line: continue
                    try: o = json.loads(line)
                    except json.JSONDecodeError: continue
                    typ, ts = o.get("type"), (o.get("timestamp") or "")[:10]
                    m = o.get("message") or {}
                    c = m.get("content") if isinstance(m, dict) else None
                    if typ == "user" and isinstance(c, str):
                        if cur: out.append((cur[0], cur[1], cur[2], d)); cur = None
                        names = re.findall(r"<command-name>/([A-Za-z0-9:_-]+)</command-name>", c)
                        if names:
                            n = canon(names[0])
                            if n not in BUILTIN and not (since and ts < since):
                                cur = [n, ts, 0]
                    elif typ == "assistant" and isinstance(c, list) and cur:
                        cur[2] += sum(1 for b in c if isinstance(b, dict) and b.get("type") == "tool_use")
            if cur: out.append((cur[0], cur[1], cur[2], d))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=0)
    ap.add_argument("--repo", default="")
    ap.add_argument("--family", action="store_true")
    ap.add_argument("--oneline", action="store_true")
    ap.add_argument("--toolcount", action="store_true")
    ap.add_argument("--exclude-session", default=os.environ.get("CLAUDE_SESSION_ID", ""))
    a = ap.parse_args()
    base = os.path.expanduser("~/.claude/projects")
    if not os.path.isdir(base): print("no ~/.claude/projects"); return
    if a.toolcount:
        eps = episodes(base, a.days, a.repo, a.exclude_session)
        if a.family: eps = [e for e in eps if e[0].startswith("cc-")]
        agg = collections.defaultdict(list)
        for n, ts, cnt, d in eps: agg[n].append(cnt)
        print(f"{'skill':<22}{'n':>4}{'median':>8}{'mean':>7}{'max':>6}   每次 tool call 數")
        for n, v in sorted(agg.items(), key=lambda x: -len(x[1])):
            sv = sorted(v); med = sv[len(sv)//2] if len(sv) % 2 else (sv[len(sv)//2-1]+sv[len(sv)//2])/2
            print(f"{n:<22}{len(v):>4}{med:>8}{sum(v)/len(v):>7.1f}{max(v):>6}   {v}")
        if not agg: print("（0 筆）")
        return
    rows = scan(base, a.days, a.repo, a.exclude_session)
    tot = collections.defaultdict(lambda: {"user": 0, "agent": 0, "first": "9", "last": "0", "repos": set()})
    for (d, n, k), v in rows.items():
        if n in BUILTIN: continue
        if a.family and not n.startswith("cc-"): continue
        t = tot[n]; t[k] += len(v); t["repos"].add(d)
        t["first"] = min([t["first"]] + v); t["last"] = max([t["last"]] + v)
    items = sorted(tot.items(), key=lambda x: -(x[1]["user"] + x[1]["agent"]))
    if a.oneline:
        print("skill 使用（近 %s 天）：" % (a.days or "全部") + " ".join(f"{n} {t['user']+t['agent']}" for n, t in items[:8]) or "無")
        return
    print(f"{'skill':<22}{'user':>6}{'agent':>7}{'total':>7}  {'repos':>5}  first → last")
    for n, t in items:
        print(f"{n:<22}{t['user']:>6}{t['agent']:>7}{t['user']+t['agent']:>7}  {len(t['repos']):>5}  {t['first'][5:]} → {t['last'][5:]}")
    if not items: print("（0 筆——若確定有用過，逐字稿格式可能改了，見檔頭死法）")

if __name__ == "__main__":
    main()
