## 1. 三件併行
- [x] 1.1 `commands/cc-dispatch.md` 的 `sync` 抓事後 revert（PR 標題與 main 的 `Revert "` commit）並改回未勾、記 `reverted` ｜驗：`sh test/run-all.sh` 綠，本文含 `reverted` 與 `Revert "<slug>`
- [x] 1.2 `commands/cc-close.md` 第①步記 `PR 合併 a／退回 b｜gate 缺陷 c` 並撈 `## 學到的` ｜驗：`sh test/run-all.sh` 綠，本文含 `gate 缺陷 c` 與 `## 學到的`
- [ ] 1.3 `templates/docs/changes/README.md` 加「派工」節含 `MAX_CONCURRENT=3`，`cc-dispatch` 從它取上限 ｜驗：`python3 tools/spec_merge.py check .` 綠，`grep -c MAX_CONCURRENT commands/cc-dispatch.md` ≥1
