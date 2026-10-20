// 「改的是不是程式檔」的唯一一份判定，cc-watch（改了程式沒驗就提醒）在用。
//
// **本檔不讀 process.env**：cc-watch 跑在 mod 執行環境，那裡沒有 `process`（實測 typeof 是
// undefined）。設定由呼叫端讀好，經 codePathConfig() 轉成物件傳進 isCodePath()。
//
// 可設定（帳號層 settings.json 的 env，或啟動 Claude Code 時的環境；逗號分隔、可留空）：
//   CC_DOC_EXTS       額外當成「文件」的副檔名，例如 `rst,adoc`。內建 md／mdx／txt 永遠算文件。
//   CC_NONCODE_PATHS  路徑含其中任一段就不算程式檔，例如 `/fixtures/,/docs/`（子字串比對）。
// 兩個都沒設＝跟以前完全一樣。

/** 內建的文件副檔名（小寫、不帶點）。 */
export const DOC_EXTS = ['md', 'mdx', 'txt'];

/** 讀設定時要看的環境變數名。 */
export const CODE_PATH_ENV = ['CC_DOC_EXTS', 'CC_NONCODE_PATHS'];

/** `a, b,,c` → ['a','b','c']。 */
export function parseList(value) {
  return String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** 環境變數（或任何同形物件）→ isCodePath 的設定。 */
export function codePathConfig(env = {}) {
  return {
    docExts: parseList(env.CC_DOC_EXTS).map((e) => e.replace(/^\./, '').toLowerCase()),
    nonCode: parseList(env.CC_NONCODE_PATHS),
  };
}

/** 算不算「改了程式」：文件、暫存、memory、使用者列的排除路徑不算。 */
export function isCodePath(path, config = {}) {
  if (!path) return false;
  const ext = /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase();
  if (ext && (DOC_EXTS.includes(ext) || config.docExts?.includes(ext))) return false;
  if (/^(\/private)?\/tmp\/|^\/var\/folders\//.test(path)) return false;
  if (path.includes('/.claude/projects/')) return false;
  if (config.nonCode?.some((s) => path.includes(s))) return false;
  return true;
}
