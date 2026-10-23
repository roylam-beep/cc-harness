---
description: 檢查 skill 本身：固定規則打分＋個資掃描（SkillEvaluator，不呼叫模型），再比對 description 找互搶觸發。唯讀，只回報不改；要 AI 讀完給設計意見改用 skill-auditor。EN: check skills, skill quality score, overlapping skill triggers
argument-hint: "[skill 路徑或目錄；留空＝當前 repo 的 skill 與 command]"
allowed-tools: Read, Glob, Grep, Bash(uvx:*), Bash(mktemp:*), Bash(mkdir:*), Bash(cp:*), Bash(python3:*), Bash(ls:*)
disallowed-tools: Write, Edit, NotebookEdit
---

檢查 $ARGUMENTS 裡的 skill。留空＝當前 repo 的 `commands/*.md`、`skills/*/SKILL.md`、
`.claude/commands/*.md`、`.claude/skills/*/SKILL.md`。不主動讀 `~/.claude/`；要查帳號層就把路徑當參數給。

兩段，各自獨立：第 1 段壞了照樣跑第 2 段。

## 前提

PATH 上要有 `uv`（`uvx` 隨附）。第一次跑會下載並建置 SkillEvaluator，約十幾秒到一分鐘；之後走快取。
沒有 `uv`：第 1 段整段跳過，回報開頭寫一句「沒有 uv，只做了重疊比對」。

## 1. 機器打分＋個資掃描（不呼叫模型）

SkillEvaluator 只吃「資料夾＋`SKILL.md`」。單檔 command 先複製成那個形狀，全部放暫存目錄，不寫進 repo：

```bash
T=$(mktemp -d "${TMPDIR:-/tmp}/cc-skillcheck.XXXX")
for f in <每個單檔 .md>; do n=$(basename "$f" .md); mkdir -p "$T/s/$n"; cp "$f" "$T/s/$n/SKILL.md"; done
for d in <每個含 SKILL.md 的資料夾>; do cp -R "$d" "$T/s/"; done
se() { uvx -q --python 3.13 --from git+https://github.com/roylam-beep/SkillEvaluator@c9d170e77bdef0b32a4811fb9b14484578559b2e skillevaluator "$@"; }
se quality-check "$T/s" -r cli -r json -o "$T/q"
se pii-scan "$T/s" -r cli -r json -o "$T/p"
```

用 function 不用 `SE="uvx …"; $SE`：zsh 不拆變數裡的空格，實測 exit 127。版本釘在 commit：打分規則換了，下面的過濾表就會錯，要升版就連過濾表一起重驗。

**過濾**（實測：對中文 skill，這類扣分幾乎全是英文標題比對，沒有訊號）——
`quality_discoverability`／`quality_reliability` 裡「缺 `## Purpose`／`## Prerequisites`／`## Limitations`／
`## Troubleshooting`／error handling」與「No examples provided」，**不逐條列**。
改成讀該 skill 本文判斷那項資訊是不是真的缺：例如本文叫了 `gh`、MCP、外部 CLI 卻沒寫前提，才算一條；
只是標題名字不同（`## 防什麼` 就是 Purpose）就收成一行 `略過 <N> 條英文標題比對`。

其餘 finding（`correctness`、`efficiency`、任何 `high`/`critical`、`pii-scan` 全部）照原文列。
`pii-scan` 實測抓得到 email 與帶使用者名稱的家目錄路徑；抓不到電話與 API key，不要宣稱它查過這兩樣。

## 2. 互搶觸發（Claude 自己比，不用 API）

把目標 skill 的 `description` 兩兩比，再跟本 session skill 清單裡其他已裝 skill 的描述比
（清單本來就在你的 context 裡，不另外讀檔）。只抓一種事：**同一句使用者的話，兩支都會接**。
用途相近但觸發句分得開的不算。死指標（指向不存在的 skill）不在這裡查，repo 的機械檢查會管。

## 輸出

先一張表，一支一行：`skill｜分數｜真問題數｜撞誰`。下面一條一行，最嚴重在前：

- `fix <skill>：<真的缺什麼>。[<路徑>:<行>]`
- `pii <skill>：<抓到什麼>。[<路徑>:<行>]`
- `overlap /<a> ↔ /<b>：「<使用者會講的那句話>」兩邊都接。建議 <哪支的 description 加哪個排除語>。`

結尾一行 `略過 <N> 條英文標題比對；完整報告：$T/q、$T/p`。
全乾淨就只回 `skill 沒問題。` 加分數表，不湊數。

「這支 skill 到底有沒有讓結果變好」（裝與不裝各跑一次比較）不是本支的事，
那要燒好幾倍用量；要做就用 `skill-creator:skill-creator` 的 eval。

## 邊界

- 唯讀：只回報，不改 skill、不 commit、不進 BACKLOG。報告放 `$T`，不寫進 repo。
- 過度工程（能砍什麼）走 `/cc-audit`；正確性 bug 走 `/code-review`。

## 防什麼

skill 越裝越多，description 互搶觸發、內文漏寫前提或夾帶個資，平常沒有東西會量；本支補這個量測。
