### Contract
- **Spec**: 队员的 key SHALL 采用带前缀的形式（如 `p10531`），使纯数字的旧格式解析失败。系统 MUST 让旧格式失败，且 MUST 说明是链接过期，MUST NOT 返回一个笼统的错误。搜索结果 SHALL 报出因缺少参赛 UTR 而未参与计算的队员人数，MUST NOT 静默地把人从池子里去掉。搜索结果 SHALL 报出含估算值的队员人数与参赛 UTR 未裁决的队员人数。名单页与排阵引擎 SHALL 使用同一条链，对同一名队员给出同一个数字。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_lineup_api.py -q` → expected: 全部通过；key 断言已改为带前缀形式
- **Code**:
  - D4：两套 id 都是小整数且互不相干，静默沿用会让旧链接算出一套「看起来合法」而锁错人的阵容。`_parse_locks` 已是「解析不了就拒绝而不是跳过」，本次沿用，只把纯数字明确识别成**旧格式**并给出对应错误。
  - D1：`load_roster` 调用同一个 `resolve_match_utr`，MUST NOT 自己再写一遍取值规则。
  - 未参与计算的队员数、估算队员数、未裁决队员数三个计数随结果返回。
- **Threshold**: 80
