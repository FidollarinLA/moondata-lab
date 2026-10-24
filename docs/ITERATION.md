# 持续迭代节奏（对齐黑客松复审）

截止：2026-10-31。原则：每轮**可演示实质增量** + **公开提交** + 对照 [OFFICIAL_ACCEPTANCE](OFFICIAL_ACCEPTANCE.md) + [DIFF_VS_MOONFRAME](DIFF_VS_MOONFRAME.md)。

## 产品经理每周三句

1. 评委是否看懂「我们不是 MoonFrame 克隆」？
2. 增量是否落在生成契约 / 证据 / Agent 边界（而非再写一遍聚合）？
3. 有没有又把「自研 DataFrame」写回宣传？

## 软件工程师每轮清单

- [ ] MoonBit 契约或可运行路径有增量
- [ ] 独立期望值测试
- [ ] `node scripts/smoke.mjs` 与 `node scripts/demo-jury.mjs`
- [ ] 更新 CHANGELOG / OFFICIAL_ACCEPTANCE / DIFF 若定位变化
- [ ] 推送 `main` 并确认 CI

## Backlog（至 10/31）

| 优先级 | 项 | 验收条 |
| --- | --- | --- |
| P0 | Public + CI 绿 + **人工改申报书复审** | 报名、2、3 |
| P0 | 保持与 MoonFrame 差异叙事诚实 | 4 |
| P1 | 加深生成契约（更多 kind / 属性测试） | 1、4 |
| P1 | ~~contract 白名单 + demo-jury~~（v0.6） | 4、6 |
| P2 | 可选：对 MoonFrame 的互操作示例（依赖生态包） | 1 |
| P2 | 模型拒答评测集 | 6 |
| — | 列类型覆盖等表格 UX：仅当不强化「我们是 DF 库」叙事时再做 | — |
