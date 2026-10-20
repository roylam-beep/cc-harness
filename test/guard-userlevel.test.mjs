// guard-userlevel.mjs 的直接測試。
// 這支掛在每一次 Write／Edit／Bash 前面：「日常 coding 不被問」跟「寫帳號層一定問」一樣重要，
// 所以放行案例跟要問的案例一樣多。家目錄用假的 /Users/tester，不碰真的 ~/.claude。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { classifyPath, classifyToolCall, mentionedPaths } from "../hooks/guard-userlevel.mjs";

const HOME = "/Users/tester";
const REPO = "/Users/tester/Documents/repo";
const ctx = { home: HOME, cwd: REPO };
const bash = (command, cwd = REPO) => classifyToolCall("Bash", { command }, { home: HOME, cwd });
const write = (file_path, tool = "Write") => classifyToolCall(tool, { file_path }, ctx);

test("classifyPath：帳號層三個根、兩個放行區、專案級 .claude 不算", () => {
  assert.equal(classifyPath("~/.claude/CLAUDE.md", HOME), "protected");
  assert.equal(classifyPath("~/.claude", HOME), "protected");
  assert.equal(classifyPath("$HOME/.claude.json", HOME), "protected");
  assert.equal(classifyPath("${HOME}/.claude.json.tmp", HOME), "protected");
  assert.equal(classifyPath("/Users/tester/.agents/skills/x/SKILL.md", HOME), "protected");
  assert.equal(classifyPath("~/.claude/projects/-p/memory/MEMORY.md", HOME), "exempt");
  assert.equal(classifyPath("~/.claude/projects/-p/memory", HOME), "exempt");
  assert.equal(classifyPath("~/.claude/plans/x.md", HOME), "exempt");
  assert.equal(classifyPath("~/.claude/projects/-p/abc.jsonl", HOME), "protected", "對話紀錄不是 memory");
  assert.equal(classifyPath(`${REPO}/.claude/settings.json`, HOME), null, "專案級 .claude 不是帳號層");
  assert.equal(classifyPath("~/.claudeX/a", HOME), null);
  assert.equal(classifyPath("~/.claude/../Documents/x", HOME), null, "正規化後已離開帳號層");
  assert.equal(classifyPath("../.claude/x", HOME, `${HOME}/Documents`), "protected", "相對路徑對 cwd 解析");
  assert.equal(classifyPath("''", HOME, `${HOME}/.claude`), null, "空字串不是路徑");
});

test("檔案工具：寫帳號層要問，memory／plans／repo 放行", () => {
  for (const [p, tool] of [
    [`${HOME}/.claude/CLAUDE.md`, "Write"],
    [`${HOME}/.claude/settings.json`, "Edit"],
    [`${HOME}/.claude/skills/x/SKILL.md`, "MultiEdit"],
    [`${HOME}/.claude.json`, "Edit"],
    [`${HOME}/.agents/skills/x/SKILL.md`, "Write"],
  ]) {
    assert.ok(write(p, tool), `未問：${tool} ${p}`);
  }
  assert.ok(classifyToolCall("NotebookEdit", { notebook_path: `${HOME}/.claude/n.ipynb` }, ctx));
  assert.equal(write(`${HOME}/.claude/projects/-p/memory/a.md`), null);
  assert.equal(write(`${HOME}/.claude/plans/plan.md`), null);
  assert.equal(write(`${REPO}/src/app.ts`), null);
  assert.equal(write(`${REPO}/.claude/settings.json`), null);
  assert.equal(classifyToolCall("Read", { file_path: `${HOME}/.claude/CLAUDE.md` }, ctx), null);
});

test("Bash 讀帳號層一律放行", () => {
  for (const cmd of [
    "cat ~/.claude/settings.json",
    "ls -la ~/.claude ~/.agents/skills",
    "grep -rn x ~/.claude/CLAUDE.md",
    "sed -n 1,5p ~/.claude/README.md",
    "head -5 ~/.claude/CLAUDE.md | grep x",
    "cat ~/.claude/a > /tmp/b",
    "cp ~/.claude/a /tmp/",
    "find ~/.claude -name '*.md'",
    "du -sh ~/.claude/projects",
    "git -C ~/.claude status --short",
    "git -C ~/.claude log --oneline -3 && git -C ~/.claude diff",
    "git -C ~/.claude branch -a",
    "git -C ~/.claude config --get user.name",
    "cd ~/.claude && ls && git status",
    "claude plugin list",
    "claude mcp list",
    "echo ~/.claude",
    "python3 -c \"import json;print(json.load(open('/Users/tester/.claude.json')).keys())\"",
    "python3 - <<'EOF'\nimport json\nd=json.load(open('/Users/tester/.claude/settings.json'))\nprint(d)\nEOF",
    "cat ~/.claude/x 2>/dev/null >&2",
    // 以下是回放 30 天紀錄抓到的誤問，修掉後鎖住
    "bash ~/.claude/x/test.sh 2>&1 | tail -3",
    "claude mcp add --help",
    "git -C ~/.claude config core.excludesFile",
    "git -C ~/.claude fetch -q origin",
    // 2026-10-20 做 MCP 的誤問：讀 ~/.claude.json 拿 env，再 stdin.write 餵子程序
    "python3 - <<'EOF'\nimport json, os, subprocess\ncfg = json.load(open(os.path.expanduser(\"~/.claude.json\")))\nproc = subprocess.Popen(['x'], stdin=subprocess.PIPE, text=True)\nproc.stdin.write(json.dumps(cfg) + \"\\n\")\nEOF",
    "claude mcp add foo -- npx foo",
    "claude mcp add --scope local gmc-local -e K=v -- python mcp_server.py",
    "claude mcp add -s project foo -- npx foo",
    "claude mcp remove -s local foo",
  ]) {
    assert.equal(bash(cmd), null, `誤問：${cmd}`);
  }
});

test("Bash 日常 coding 不被問", () => {
  for (const cmd of [
    "npm test",
    "git add -A && git commit -m x",
    "rm -rf node_modules && mkdir -p dist",
    "echo hi > out.txt",
    "sed -i '' 's/a/b/' src/x.ts",
    "python3 - <<'EOF'\nopen('out.txt','w').write('x')\nEOF",
    "node -e \"require('fs').writeFileSync('a.json','{}')\"",
    "claude -p 'hello'",
    // 回放最大宗誤問：用 python 改 repo 的 docs，內文剛好寫到 ~/.claude（反引號包著，不是路徑字面值）
    "python3 - <<'PY'\np='docs/plans/x.md'\ns=open(p).read()\ns+='規則在 `~/.claude/CLAUDE.md`'\nopen(p,'w').write(s)\nPY",
  ]) {
    assert.equal(bash(cmd), null, `誤問：${cmd}`);
  }
});

test("Bash 寫帳號層要問", () => {
  for (const cmd of [
    "echo hi > ~/.claude/x",
    "echo hi >> $HOME/.claude/CLAUDE.md",
    "cp /tmp/a ~/.claude/a",
    "cp -r skill ${HOME}/.claude/skills/",
    "mv ~/.claude/a /tmp/",
    "rm ~/.claude/.DS_Store",
    "mkdir -p ~/.agents/skills/x",
    "touch /Users/tester/.claude/x",
    "tee ~/.claude/x < /dev/null",
    "ln -s /repo/skill ~/.claude/skills/skill",
    "sed -i '' 's/a/b/' ~/.claude/CLAUDE.md",
    "find ~/.claude -name .DS_Store -delete",
    "find ~/.claude -name x -exec rm {} \\;",
    "git -C ~/.claude add .gitignore",
    "git -C ~/.claude commit -m x",
    "git -C ~/.claude rm -r -q skills/x",
    "git -C ~/.claude branch -D x",
    "cd ~/.claude && git add . && git commit -m x",
    "cd ~/.claude/skills && rm a",
    "cd ~/.claude && echo x > y",
    "claude plugin update cc-harness",
    "claude plugin uninstall typesafe@typesafe-ai",
    "claude plugin marketplace remove typesafe-ai",
    "claude mcp add -s user foo -- npx foo",
    "claude mcp add --scope=user foo -- npx foo",
    "claude mcp remove foo",
    // 路徑存進變數、隔幾句才拿來寫（swipepage 改 ~/.claude.json 的實際寫法）
    "python3 -I - <<'PY'\nimport json,os\np=os.path.expanduser(\"~/.claude.json\"); d=json.load(open(p))\nd['x']=1\njson.dump(d,open(p,'w'),indent=2)\nPY",
    "python3 - <<'EOF'\nimport json\nd={}\njson.dump(d,open('/Users/tester/.claude.json','w'))\nEOF",
    "python3 -c \"import shutil; shutil.copy('a', '/Users/tester/.claude/a')\"",
    "cat <<'EOF' > ~/.claude/x\nhello\nEOF",
    "bash -c 'rm ~/.claude/x'",
    "git -C ~/.claude config user.name x",
    "python3 - <<'PY'\nimport os\np=os.path.expanduser(\"~/.claude/commands/x.md\")\nopen(p,'w').write('x')\nPY",
    "sudo rm ~/.claude/x",
  ]) {
    assert.ok(bash(cmd), `未問：${cmd}`);
  }
});

test("Bash 寫 memory／plans 放行", () => {
  for (const cmd of [
    "echo x >> ~/.claude/projects/-p/memory/MEMORY.md",
    "rm ~/.claude/projects/-p/memory/old.md",
    "mkdir -p ~/.claude/plans && mv /tmp/p.md ~/.claude/plans/",
  ]) {
    assert.equal(bash(cmd), null, `誤問：${cmd}`);
  }
});

test("Bash cwd 本身在帳號層時，相對路徑寫入也問", () => {
  assert.ok(bash("touch x", `${HOME}/.claude`));
  assert.ok(bash("echo x > y", `${HOME}/.claude`));
  // 回放誤問：在對話紀錄目錄裡用 node 讀 jsonl，箭頭函式的 `=>` 不是重導向
  assert.equal(bash("node -e \"lines.map(l=>JSON.parse(l))\"", `${HOME}/.claude/projects/-p`), null);
  assert.equal(bash("awk '{ if ($1 > 3) print }' f", `${HOME}/.claude`), null);
  assert.ok(bash("git add .", `${HOME}/.claude`));
  assert.equal(bash("ls", `${HOME}/.claude`), null);
  assert.equal(bash("touch x", `${HOME}/.claude/projects/-p/memory`), null);
});

test("mentionedPaths 抓四種寫法", () => {
  const got = mentionedPaths("a ~/.claude/x $HOME/.agents ${HOME}/.claude.json '/Users/tester/.claude/y'", HOME);
  assert.deepEqual(got, ["~/.claude/x", "$HOME/.agents", "${HOME}/.claude.json", "/Users/tester/.claude/y"]);
  assert.deepEqual(mentionedPaths(got.join(" ") + " '/Users/tester/.claude/y' `~/.claude/z`", HOME, { quoted: true }), ["/Users/tester/.claude/y"]);
});

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "hooks", "guard-userlevel.mjs");
function runHook(payload, env = {}) {
  return spawnSync("node", [HOOK], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    env: { ...process.env, HOME, ...env },
    encoding: "utf8",
  });
}

test("進程：要問時 exit 0＋stdout 印 ask JSON，路徑以 ~ 顯示", () => {
  const r = runHook({ tool_name: "Write", tool_input: { file_path: `${HOME}/.claude/CLAUDE.md` }, cwd: REPO });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /~\/\.claude\/CLAUDE\.md/);
});

test("進程：放行時沒有輸出；壞 stdin fail open；總開關關掉整支", () => {
  const allow = runHook({ tool_name: "Bash", tool_input: { command: "npm test" }, cwd: REPO });
  assert.equal(allow.status, 0);
  assert.equal(allow.stdout, "");
  const broken = runHook("not json");
  assert.equal(broken.status, 0);
  assert.equal(broken.stdout, "");
  const off = runHook({ tool_name: "Write", tool_input: { file_path: `${HOME}/.claude/x` } }, { CC_GUARD_USERLEVEL: "off" });
  assert.equal(off.status, 0);
  assert.equal(off.stdout, "");
});

test("CLAUDE_CONFIG_DIR：搬走的帳號層也問，memory／plans 照樣放行；沒設時不影響", () => {
  const cfg = "/opt/cc-config";
  const moved = { home: HOME, cwd: REPO, configDir: cfg };
  assert.ok(classifyToolCall("Write", { file_path: `${cfg}/CLAUDE.md` }, moved), "搬走的 CLAUDE.md 要問");
  assert.equal(classifyToolCall("Write", { file_path: `${cfg}/projects/-p/memory/x.md` }, moved), null, "memory 放行");
  assert.ok(classifyToolCall("Bash", { command: 'echo x >> "$CLAUDE_CONFIG_DIR/settings.json"' }, moved), "變數寫法也抓");
  assert.ok(classifyToolCall("Bash", { command: `python3 -c "open('${cfg}/settings.json','w')"` }, moved), "直譯器內文也抓");
  assert.ok(classifyToolCall("Write", { file_path: `${HOME}/.claude/CLAUDE.md` }, moved), "原本的 ~/.claude 照樣問");
  assert.equal(classifyToolCall("Write", { file_path: `${cfg}/CLAUDE.md` }, ctx), null, "沒設 configDir 時 /opt 不是帳號層");
  const viaEnv = runHook({ tool_name: "Write", tool_input: { file_path: `${cfg}/settings.json` }, cwd: REPO }, { CLAUDE_CONFIG_DIR: cfg });
  assert.equal(JSON.parse(viaEnv.stdout).hookSpecificOutput.permissionDecision, "ask", "進程讀 CLAUDE_CONFIG_DIR");
});
