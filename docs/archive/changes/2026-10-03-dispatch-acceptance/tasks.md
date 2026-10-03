## 1. 規則文字
- [x] 1.1 README：子句都要有 Scenario、同波無讀寫依賴、驗法要讓反例變紅、禁 skip、介面約定進 spec、改正 hook 宣稱 ｜驗：python3 tools/spec_merge.py check . ｜所有權：templates/docs/changes/README.md
- [x] 1.2 cc-dispatch 契約：禁 skip 遮依賴、介面約定寫進 spec.md ｜驗：python3 test/test_skills.py ｜所有權：commands/cc-dispatch.md
- [x] 1.3 cc-dispatch from-plan：子句對 Scenario、同波無依賴、[驗法弱]、gate.env 帶 GATE_2 ｜驗：python3 test/test_skills.py ｜所有權：commands/cc-dispatch.md
- [x] 1.4 cc-dispatch 驗收：自己 clone、合進 BASE 後核對、BLOCKER 四種、佔位檔頭、不開瀏覽器 ｜驗：python3 test/test_skills.py ｜所有權：commands/cc-dispatch.md
- [x] 1.5 cc-close ①：reviews 的非阻擋也走 A／B／C，介面約定先補 spec ｜驗：python3 test/test_skills.py ｜所有權：commands/cc-close.md
