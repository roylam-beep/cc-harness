// hooks/guard-watch-script.mjs 的測試。跑法：node plugins/cc-dispatch/test/guard-watch-script.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { classifyToolInput } from "../hooks/guard-watch-script.mjs";

const cmd = 'node /Users/x/cursor-api/scripts/wait-for-run.js bc-1 run-2 --label "smoke"';

test("前景執行擋，擋下時指路到 run_in_background", () => {
  const hit = classifyToolInput({ command: cmd });
  assert.match(hit?.rule ?? "", /wait-for-run\.js 前景執行/);
  assert.ok(hit.hint.includes("run_in_background"));
  assert.ok(classifyToolInput({ command: cmd, run_in_background: false }), "false 視同前景");
  assert.ok(classifyToolInput({ command: `cd /tmp && ${cmd}` }), "複合指令裡也要抓");
  assert.ok(classifyToolInput({ command: "./scripts/wait-for-run.js a r" }), "直接執行也算");
});

test("背景執行、只是提到路徑、heredoc 內文 → 放行", () => {
  assert.equal(classifyToolInput({ command: cmd, run_in_background: true }), null);
  for (const c of [
    "ls -la /Users/x/cursor-api/scripts/wait-for-run.js",
    "cat scripts/wait-for-run.js | head",
    "grep -n retry scripts/wait-for-run.js",
    ["cat <<'EOD'", cmd, "EOD"].join("\n"),
    "git status",
  ]) assert.equal(classifyToolInput({ command: c }), null, c);
  assert.equal(classifyToolInput({}), null);
  assert.equal(classifyToolInput(undefined), null);
});

test("設定：追加腳本、逐類放行、整支停用", () => {
  const env = { CC_GUARD_BASH_WATCH_SCRIPTS: "watch-job.sh" };
  assert.match(classifyToolInput({ command: "sh tools/watch-job.sh 42" }, env)?.rule ?? "", /watch-job\.sh/);
  assert.ok(classifyToolInput({ command: cmd }, env), "內建那支永遠在");
  assert.equal(classifyToolInput({ command: cmd }, { CC_GUARD_BASH_ALLOW: "rebase,watch-script" }), null);
  assert.equal(classifyToolInput({ command: cmd }, { CC_GUARD_BASH: "off" }), null);
});

test("端對端：exit 2 擋、背景 exit 0、壞 JSON fail open", () => {
  const hook = new URL("../hooks/guard-watch-script.mjs", import.meta.url).pathname;
  const env = { ...process.env, CC_GUARD_BASH: "", CC_GUARD_BASH_ALLOW: "" };
  const run = (input) => spawnSync("node", [hook], { input, env }).status;
  assert.equal(run(JSON.stringify({ tool_input: { command: cmd } })), 2);
  assert.equal(run(JSON.stringify({ tool_input: { command: cmd, run_in_background: true } })), 0);
  assert.equal(run("not json"), 0);
});
