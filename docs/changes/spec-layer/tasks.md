## 1. 工具
- [x] 1.1 `tools/spec_merge.py` 三用（check／dry-run／--apply）＋ `test/spec_merge.test.py` 25 案 ｜驗：`python3 test/spec_merge.test.py` 印 `SPEC_MERGE_TEST OK（25 項）`
- [x] 1.2 `test/run-all.sh` 掛上 check 與測試 ｜驗：`sh test/run-all.sh` 印出 `── spec_merge ──` 段且 ALL GREEN

## 2. 樣板與安裝器
- [x] 2.1 `templates/hooks/pre-commit` 逐支跑兩支、`templates/docs/changes/README.md`、`templates/README.md` 兩列、`templates/AGENTS.md` 一行路標 ｜驗：`sh tools/install-hooks.sh` 後 `git commit` 輸出同時有 `CHECK_DOCS` 與 `SPEC_MERGE CHECK`
- [x] 2.2 `commands/cc-harness.md` 安裝行加 `cp spec_merge.py`、第二段第 3 項加 check ｜驗：`python3 test/test_skills.py` 綠

## 3. skill 接線
- [x] 3.1 `cc-close` ①③ 接合併與建 change 資料夾、`cc-gate` 讀情境寫回 tasks.md、`cc-handover` 完成定義改路標 ｜驗：`python3 test/test_skills.py` 綠，三檔 `grep -c docs/changes` 皆 ≥1

## 4. 收尾
- [x] 4.1 plugin 0.3.0、`docs/decisions.md` 一條、`BACKLOG.md` 排水＋兩行（建 `docs/archive/ICEBERG.md`） ｜驗：`sh test/run-all.sh` ALL GREEN（需 `claude plugin update cc-harness`）
