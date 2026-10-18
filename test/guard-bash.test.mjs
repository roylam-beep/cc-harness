// guard-bash.mjs 的直接測試（harness W7.3）
// 這支 hook 擋在**每一次** Bash 呼叫前面，所以「該放行的放行」比「該擋的擋住」更關鍵：
// 誤擋會弄壞整個 session，而且被擋的人沒有繞路可走。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { classifyCommand, classifyToolInput, stripHeredocs, SCRATCHPAD_HINTS } from "../hooks/guard-bash.mjs";

const SCRATCH = "/private/tmp/claude-501/proj/session/scratchpad";

test("擋 force push（三種寫法）", () => {
  for (const cmd of [
    "git push --force origin main",
    "git push -f",
    "git push --force-with-lease origin main",
  ]) {
    const hit = classifyCommand(cmd);
    assert.ok(hit, `未擋：${cmd}`);
    assert.equal(hit.rule, "git push --force");
    assert.ok(hit.hint.length > 0, "擋下時必須指路，不能只說不行");
  }
});

test("git reset 帶 mode 旗標一律擋，純 unstage 放行", () => {
  // 2026-08-23 收緊：原本只擋 --hard。帳號層政策把 reset 整體列入「要當輪授權」，
  // 因為 --soft／--mixed 移動 HEAD 就抹掉既有 commit，而本 repo 是共用 worktree。
  for (const [cmd, rule] of [
    ["git reset --hard HEAD~3", "git reset --hard"],
    ["git reset --soft HEAD~1", "git reset --soft"],
    ["git reset --mixed HEAD", "git reset --mixed"],
    ["git reset --keep HEAD~1", "git reset --keep"],
    ["git reset --merge", "git reset --merge"],
  ]) {
    const hit = classifyCommand(cmd);
    assert.equal(hit?.rule, rule, `未擋：${cmd}`);
    assert.ok(hit.hint.length > 0, "擋下時必須指路，不能只說不行");
  }
  // 不帶 mode 旗標＝只動 index，是每天都在用的 unstage，擋它會逼人繞路。
  assert.equal(classifyCommand("git reset HEAD -- src/x.ts"), null);
  assert.equal(classifyCommand("git reset -- src/x.ts"), null);
  assert.equal(classifyCommand("git restore -- src/x.ts"), null);
});

test("擋改寫既有工作的 git 動作（rebase／amend／刪本地分支）", () => {
  for (const [cmd, rule] of [
    ["git rebase -i main", "git rebase"],
    ["git rebase --onto main feat", "git rebase"],
    ["git commit --amend -m x", "git commit --amend"],
    ["git commit --amend --no-edit", "git commit --amend"],
    ["git branch -D unmerged", "git branch -D"],
    ["git branch --delete --force old", "git branch -D"],
  ]) {
    const hit = classifyCommand(cmd);
    assert.equal(hit?.rule, rule, `未擋：${cmd}`);
    assert.ok(hit.hint.length > 0, "擋下時必須指路，不能只說不行");
  }
});

test("刪遠端分支放行（2026-09-17 退役）", () => {
  // 刪一條已合併的分支什麼都沒丟（commit 已在 main 裡），跟 force push 不是同一件事。
  // 綁在同一條「遠端不可逆」是分類錯誤，實測每次清 PR 分支都被誤擋。
  for (const cmd of [
    "git push origin --delete stale",
    "git push origin -d stale",
    "git push origin :stale",
  ]) {
    assert.equal(classifyCommand(cmd), null, `誤擋：${cmd}`);
  }
  // 但 force push 照擋——同一支 git push，別退役過頭。
  assert.equal(classifyCommand("git push -f origin main")?.rule, "git push --force");
});

test("git branch -d 放行，-D 照擋（2026-09-17 放寬）", () => {
  // git 自己就會拒絕刪未合併的分支，那道檢查不需要本 hook 再做一次；
  // 擋它只是把「清掉已合併的 PR 分支」這種日常動作卡死。-D 是叫 git 別守，照擋。
  for (const cmd of [
    "git branch -d merged",
    "git branch --delete merged",
    "git branch -d -r origin/gone",
  ]) {
    assert.equal(classifyCommand(cmd), null, `誤擋：${cmd}`);
  }
  for (const cmd of ["git branch -D unmerged", "git branch --delete --force x", "git branch --delete -f x"]) {
    assert.equal(classifyCommand(cmd)?.rule, "git branch -D", `未擋：${cmd}`);
  }
});

test("擋繞過閘：--no-verify（commit 的 -n 是它的簡寫）", () => {
  for (const [cmd, rule] of [
    ["git commit --no-verify -m x", "git commit --no-verify"],
    ["git commit -n -m x", "git commit --no-verify"],
    ["git push --no-verify origin main", "git push --no-verify"],
  ]) {
    const hit = classifyCommand(cmd);
    assert.equal(hit?.rule, rule, `未擋：${cmd}`);
    assert.ok(hit.hint.length > 0, "擋下時必須指路，不能只說不行");
  }
});

test("git push -n 是 dry-run 不是 no-verify，放行", () => {
  // 同一個 -n 在 commit 與 push 意思相反。混在一起擋會誤擋每天在用的預演。
  assert.equal(classifyCommand("git push -n origin main"), null);
  assert.equal(classifyCommand("git push --dry-run origin main"), null);
});

test("git clean 帶 force 擋，dry-run 與不帶 force 放行", () => {
  for (const cmd of ["git clean -f", "git clean -fd", "git clean -fdx", "git clean --force -d"]) {
    const hit = classifyCommand(cmd);
    assert.equal(hit?.rule, "git clean -f", `未擋：${cmd}`);
    assert.ok(hit.hint.includes("git clean -n -d"), "必須指出可逆的預演路徑");
  }
  // -n 勝出（git 自己也是這個語意）；不帶 force 時 git 本來就會拒絕執行。
  assert.equal(classifyCommand("git clean -n -d"), null);
  assert.equal(classifyCommand("git clean -fdn"), null);
  assert.equal(classifyCommand("git clean --dry-run -fd"), null);
  assert.equal(classifyCommand("git clean -d"), null);
});

test("git clean -X 放行，-x 照擋（2026-09-17 放寬）", () => {
  // 大寫 X ＝只刪被 .gitignore 忽略的檔（build 產物），跟已放行的 `rm -rf dist` 同一類。
  // 小寫 x 意思相反：連 ignore 規則都不管，刪得比預設更多。只差一個大小寫，所以要有測試釘住。
  assert.equal(classifyCommand("git clean -fdX"), null);
  assert.equal(classifyCommand("git clean -f -X"), null);
  assert.equal(classifyCommand("git clean -fdx")?.rule, "git clean -f");
});

test("rebase 中途的收拾動作放行（擋了會把人鎖死在 rebase 裡）", () => {
  for (const flag of ["--abort", "--continue", "--skip", "--quit", "--edit-todo"]) {
    assert.equal(classifyCommand(`git rebase ${flag}`), null, `誤擋：git rebase ${flag}`);
  }
});

test("git 的前置旗標不影響子命令判定", () => {
  // `git -C <path> …`／`git -c k=v …` 會吃掉下一個 token；不跳過就會把路徑當子命令，
  // 於是 `git -C /x rebase main` 整條漏掉。
  assert.equal(classifyCommand("git -C /tmp/r rebase main")?.rule, "git rebase");
  assert.equal(classifyCommand("git -c commit.gpgsign=false commit --amend")?.rule, "git commit --amend");
  assert.equal(classifyCommand("git -C /tmp/r commit -m x"), null);
  assert.equal(classifyCommand("git -c commit.gpgsign=false commit -m x"), null);
});

test("擋遞迴強制刪除，四種旗標寫法都要抓到", () => {
  for (const flags of ["-rf", "-fr", "-r -f", "--recursive --force"]) {
    assert.ok(classifyCommand(`rm ${flags} docs/`), `未擋：rm ${flags}`);
  }
  assert.ok(classifyCommand("sudo rm -rf /etc"), "sudo 包一層仍要擋");
});

test("scratchpad 內的遞迴刪除放行，混了非 scratchpad 路徑就擋", () => {
  assert.equal(classifyCommand(`rm -rf ${SCRATCH}/tmp`), null);
  assert.equal(classifyCommand(`rm -rf ${SCRATCH}/a ${SCRATCH}/b`), null);
  assert.ok(
    classifyCommand(`rm -rf ${SCRATCH}/a docs/`),
    "一個目標在 scratchpad 不代表整條指令安全",
  );
  assert.ok(classifyCommand("rm -rf"), "沒指定路徑也擋（可能是變數展開成空字串）");
  for (const hint of SCRATCHPAD_HINTS) {
    assert.equal(classifyCommand(`rm -rf ${hint}x/tmp`), null, `${hint} 應放行`);
  }
});

test("repo 內的可重生目錄放行（誤擋這類等於天天擋）", () => {
  for (const cmd of [
    "rm -rf .tmp-size",
    "rm -rf node_modules",
    "rm -rf dist/*",
    "rm -rf packages/web/node_modules",
    "rm -rf build/ coverage/",
    "rm -rf .next .turbo",
    "rm -rf __pycache__",
    "rm -rf tmp",
  ]) {
    assert.equal(classifyCommand(cmd), null, `應放行：${cmd}`);
  }
});

test("可重生的名字不能當成逃生門：repo 外與 .. 一律擋", () => {
  for (const cmd of [
    "rm -rf /var/tmp",
    "rm -rf ~/tmp",
    "rm -rf ../../node_modules",
    "rm -rf .git",
    "rm -rf .",
    "rm -rf src",
    "rm -rf node_modules docs/",
  ]) {
    assert.ok(classifyCommand(cmd), `應擋：${cmd}`);
  }
});

test("放行日常指令（誤擋比漏擋貴）", () => {
  for (const cmd of [
    "git push origin main",
    "git push --follow-tags origin main",
    "git commit -m 'x'",
    "git branch --show-current",
    "git branch -a",
    "git branch --merged",
    "git branch --list 'feat/*'",
    "git rebase --abort",
    "git reset -- README.md",
    "rm -f note.txt",
    "rm docs/a.md",
    "npm run verify",
    "rmdir empty",
    "git log --oneline -5",
  ]) {
    assert.equal(classifyCommand(cmd), null, `誤擋：${cmd}`);
  }
});

test("複合指令逐段判", () => {
  assert.ok(classifyCommand("cd /tmp && rm -rf /var/data"));
  assert.ok(classifyCommand("echo start; git push --force"));
  assert.ok(classifyCommand("ls | xargs rm -rf /x"));
  assert.equal(classifyCommand("cd /tmp && ls && git status"), null);
});

test("heredoc body 是資料不是指令", () => {
  // 本檔第一次上線就被自己擋下：寫 hook 說明時內文提到被擋指令的字面文字，
  // heredoc body 被當指令解析。修在解析層，不是放寬規則。
  const cmd = ["cat > doc.md <<'EOD'", "說明：rm -rf / 會被擋", "EOD"].join("\n");
  assert.equal(classifyCommand(cmd), null);

  // 但 heredoc 結束後的真指令仍要抓到
  const after = ["cat <<EOD", "x", "EOD", "rm -rf docs/"].join("\n");
  assert.ok(classifyCommand(after));

  assert.ok(!stripHeredocs(cmd).includes("說明"), "heredoc 內容應被剝除");
});

test("非字串／空輸入放行（fail open）", () => {
  assert.equal(classifyCommand(undefined), null);
  assert.equal(classifyCommand(""), null);
  assert.equal(classifyCommand("   "), null);
});

test("第九類：wait-for-run.js 前景執行擋，背景放行（2026-09-23 加）", () => {
  // 近 30 天逐字稿裡 4 次「Command timed out after 10m」全是它在前景跑。
  const cmd = 'node /Users/x/cursor-api/scripts/wait-for-run.js bc-1 run-2 --label "smoke"';
  const fg = classifyToolInput({ command: cmd });
  assert.ok(fg, "前景要擋");
  assert.match(fg.rule, /wait-for-run\.js/);
  assert.ok(fg.hint.includes("run_in_background"), "擋下時必須指路到 run_in_background");
  assert.equal(classifyToolInput({ command: cmd, run_in_background: true }), null, "背景要放行");
  assert.ok(classifyToolInput({ command: cmd, run_in_background: false }), "false 視同前景");
  // 複合指令裡藏著也要抓；heredoc 內文提到不算
  assert.ok(classifyToolInput({ command: `cd /tmp && ${cmd}` }));
  assert.equal(classifyToolInput({ command: ["cat <<'EOD'", cmd, "EOD"].join("\n") }), null);
  // 前八類優先：前景 watcher 加 force push，回的是 force push 那條
  assert.equal(classifyToolInput({ command: `git push --force && ${cmd}` }).rule, "git push --force");
  // 既有行為不變
  assert.equal(classifyToolInput({ command: "git status" }), null);
  assert.equal(classifyToolInput({}), null);
  assert.equal(classifyToolInput(undefined), null);

  // 端對端：hook 進程從 stdin 讀 tool_input.run_in_background
  const hook = new URL("../hooks/guard-bash.mjs", import.meta.url).pathname;
  const run = (tool_input) =>
    spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_name: "Bash", tool_input }), env: { ...process.env, CC_GUARD_BASH: undefined } });
  const blocked = run({ command: cmd });
  assert.equal(blocked.status, 2, "前景 → exit 2");
  assert.match(String(blocked.stderr), /run_in_background/);
  assert.equal(run({ command: cmd, run_in_background: true }).status, 0, "背景 → exit 0");
});

test("逃生門 CC_GUARD_BASH=off：設了整支停用，沒設照擋", () => {
  // 這條只能端對端測——開關在 main()，不在純函式裡。
  // 設計重點：讀的是 **hook 進程自己的 env**，所以 agent 在 Bash 指令裡塞
  // `CC_GUARD_BASH=off …` 沒有用（那是它子 shell 的環境），不構成繞過路徑。
  const hook = new URL("../hooks/guard-bash.mjs", import.meta.url).pathname;
  const payload = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push --force origin main" } });
  const run = (env) => spawnSync(process.execPath, [hook], { input: payload, env: { ...process.env, ...env } }).status;

  assert.equal(run({ CC_GUARD_BASH: undefined }), 2, "沒設開關時 force push 要照擋");
  assert.equal(run({ CC_GUARD_BASH: "off" }), 0, "設了 off 要整支停用");
  assert.equal(run({ CC_GUARD_BASH: "on" }), 2, "只有字面 off 才停用，其他值一律照擋");
});

// ── 第十類：push 前要有 gate 紀錄（2026-10-18）──────────────────────────────

import { classifyPushGate, isCodePath, GATE_RECORD } from "../hooks/guard-bash.mjs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 假的 io：diffs 以範圍字串當 key，回該範圍動到的檔；up＝upstream 名（null＝沒有）。 */
function fakeIo({ up = "origin/main", head = "abc1234def", diffs = {}, record = "" } = {}) {
  return {
    git: (args) => {
      const a = args.join(" ");
      if (a.includes("@{u}")) return up ? `${up}\n` : null;
      if (a.startsWith("rev-parse --verify")) return null;
      if (a === "rev-parse HEAD") return `${head}\n`;
      if (a.startsWith("diff --name-only ")) {
        const r = a.slice("diff --name-only ".length);
        return r in diffs ? diffs[r].join("\n") : null;
      }
      return null;
    },
    record: () => record,
  };
}

test("isCodePath：.md／.txt、暫存、memory 不算程式檔，其餘都算", () => {
  for (const p of ["remake/src/Wof.Core/Original/Irq.cs", "hooks/guard-bash.mjs", "package.json", "Makefile"]) {
    assert.equal(isCodePath(p), true, p);
  }
  for (const p of ["README.md", "docs/a.MDX", "notes.txt", "/tmp/x.ts", "/private/tmp/claude-1/x.py", "/var/folders/a/b.js", "/Users/u/.claude/projects/p/memory/m.json", ""]) {
    assert.equal(isCodePath(p), false, p);
  }
});

test("第十類：有程式改動、HEAD 沒紀錄 → 擋，訊息指路到 /cc-gate 與紀錄指令", () => {
  const io = fakeIo({ diffs: { "origin/main..HEAD": ["src/a.ts", "README.md"] } });
  const hit = classifyPushGate("git push origin main", io);
  assert.ok(hit, "應擋");
  assert.match(hit.rule, /gate/);
  assert.match(hit.why, /src\/a\.ts/);
  assert.ok(!hit.why.includes("README.md"), "非程式檔不列");
  assert.ok(hit.hint.includes("/cc-gate") && hit.hint.includes(GATE_RECORD) && hit.hint.includes("skip"), "必須指路");
});

test("第十類：只動文件 → 放行", () => {
  const io = fakeIo({ diffs: { "origin/main..HEAD": ["README.md", "docs/x.txt"] } });
  assert.equal(classifyPushGate("git push", io), null);
});

test("第十類：HEAD 有 pass 或 skip → 放行；別的 SHA 的 skip 不算", () => {
  const diffs = { "origin/main..HEAD": ["a.cs"] };
  assert.equal(classifyPushGate("git push", fakeIo({ diffs, record: "abc1234 pass\n" })), null);
  assert.equal(classifyPushGate("git push", fakeIo({ diffs, record: "abc1234def skip\n" })), null);
  assert.ok(classifyPushGate("git push", fakeIo({ diffs, record: "fffffff skip\n" })), "skip 只對寫下當時的 HEAD 有效");
  assert.ok(classifyPushGate("git push", fakeIo({ diffs, record: "abc1234 maybe\n" })), "亂寫的判定字不算");
});

test("第十類：pass 之後只多了文件 commit 仍放行，多了程式檔就要重驗；skip 不享有這個寬限", () => {
  const diffs = { "origin/main..HEAD": ["a.cs", "n.md"], "1111111..HEAD": ["n.md"], "2222222..HEAD": ["b.cs"] };
  assert.equal(classifyPushGate("git push", fakeIo({ diffs, record: "1111111 pass\n" })), null);
  assert.ok(classifyPushGate("git push", fakeIo({ diffs, record: "2222222 pass\n" })), "pass 之後又動了程式檔");
  assert.ok(classifyPushGate("git push", fakeIo({ diffs, record: "1111111 skip\n" })), "skip 不吃寬限");
});

test("第十類：dry-run、刪遠端分支、不是 push → 不看", () => {
  const io = fakeIo({ diffs: { "origin/main..HEAD": ["a.cs"] } });
  for (const cmd of ["git push -n", "git push --dry-run origin main", "git push origin --delete x", "git push origin :x", "git status", "git commit -m push"]) {
    assert.equal(classifyPushGate(cmd, io), null, cmd);
  }
  assert.ok(classifyPushGate("cd x && git push -u origin feat", io), "複合指令裡的 push 要抓");
  assert.equal(classifyPushGate(["cat <<'E'", "git push", "E"].join("\n"), io), null, "heredoc 內文不算");
});

test("第十類：算不出範圍就放行（fail open）", () => {
  const diffs = { "origin/main..HEAD": ["a.cs"] };
  assert.equal(classifyPushGate("git push", fakeIo({ up: null })), null, "沒 upstream 又沒 origin/main");
  assert.equal(classifyPushGate("git push", fakeIo({ diffs: {} })), null, "git diff 失敗");
  assert.equal(classifyPushGate("git push", { git: () => { throw new Error("boom"); }, record: () => "" }), null, "丟例外");
  assert.equal(classifyPushGate(undefined, fakeIo({ diffs })), null);
});

test("第十類端對端：真的暫存 repo——擋、寫 pass 後放行、只動文件放行、逃生門照樣有效", () => {
  const root = mkdtempSync(join(tmpdir(), "gate-e2e-"));
  try {
    const sh = (cwd, ...args) => {
      const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
      assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout;
    };
    const remote = join(root, "remote.git");
    const work = join(root, "work");
    mkdirSync(work);
    sh(root, "init", "-q", "--bare", "-b", "main", remote);
    sh(work, "init", "-q", "-b", "main");
    sh(work, "remote", "add", "origin", remote);
    writeFileSync(join(work, "README.md"), "x\n");
    sh(work, "add", "."); sh(work, "commit", "-q", "-m", "init");
    sh(work, "push", "-q", "-u", "origin", "main");

    const hook = new URL("../hooks/guard-bash.mjs", import.meta.url).pathname;
    const push = (env = {}) => spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ tool_name: "Bash", cwd: work, tool_input: { command: "git push origin main" } }),
      env: { ...process.env, CC_GUARD_BASH: undefined, ...env },
      encoding: "utf8",
    });

    writeFileSync(join(work, "README.md"), "y\n");
    sh(work, "commit", "-q", "-am", "docs only");
    assert.equal(push().status, 0, "只動文件 → 放行");

    writeFileSync(join(work, "a.cs"), "class A {}\n");
    sh(work, "add", "."); sh(work, "commit", "-q", "-m", "code");
    const blocked = push();
    assert.equal(blocked.status, 2, "動了程式檔、沒紀錄 → exit 2");
    assert.match(blocked.stderr, /a\.cs/);
    assert.match(blocked.stderr, /\/cc-gate/);
    assert.equal(push({ CC_GUARD_BASH: "off" }).status, 0, "逃生門照樣有效");

    const recPath = join(work, sh(work, "rev-parse", "--git-path", GATE_RECORD).trim());
    appendFileSync(recPath, `${sh(work, "rev-parse", "HEAD").trim()} pass\n`);
    assert.equal(push().status, 0, "寫了 pass → 放行");

    writeFileSync(join(work, "b.cs"), "class B {}\n");
    sh(work, "add", "."); sh(work, "commit", "-q", "-m", "more code");
    assert.equal(push().status, 2, "pass 之後又動程式檔 → 再擋");
    appendFileSync(recPath, `${sh(work, "rev-parse", "HEAD").trim()} skip\n`);
    assert.equal(push().status, 0, "使用者明說跳過 → 寫 skip 放行");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
