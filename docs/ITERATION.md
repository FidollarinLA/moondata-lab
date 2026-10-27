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
| P1 | ~~provenance.planCanonical + reject 评测~~（v0.6.1） | 4、6 |
| P1 | ~~属性测试：同方案不同键序 → 同指纹；改种子 → 不同行哈希~~（v0.6.2） | 1、4 |
| P1 | ~~生成契约再加深：date/boolean/missing 指纹面 + 报告引用 planCanonical~~（v0.6.3） | 1、4 |
| P1 | ~~报告/导出证据再加厚：JSON evidence + fingerprint-check CLI~~（v0.6.4） | 4、6 |
| P1 | ~~Agent 边界：plan_chart datasetId + local planner 不绕过 allowlist~~（v0.6.5） | 6 |
| P1 | ~~申报辅助：README/RESUBMIT 评委三步压缩~~（v0.6.6） | 2、3、4 |
| P1 | ~~boolean/date 独立期望值 + METHODS 交叉引用~~（v0.6.7） | 1 |
| P1 | ~~证据面：UI 指纹行展示 planCanonical 摘要~~（v0.6.8） | 4、3 |
| P1 | ~~category 等概率独立期望值~~（v0.6.9） | 1 |
| P1 | ~~status API edition + contracts + jury 指针~~（v0.6.10） | 2、4 |
| P1 | ~~missing×boolean 组合期望值~~（v0.6.11） | 1 |
| P0 | **人工改写申报书并复审提交**（工程侧已备评委三步） | 报名、2、3 |
| P1 | ~~工作区 evidence + 导入声称指纹 UI~~（v0.6.12） | 4 |
| P1 | ~~number lerp 独立期望值~~（v0.6.13） | 1 |
| P1 | ~~linear+noise 独立期望值~~（v0.6.14） | 1 |
| P1 | ~~报告/工具轨迹：allowlist 校验结果写入 evidence~~（v0.6.15） | 4、6 |
| P1 | ~~explore queryCanonical 进入报告 evidence~~（v0.6.16） | 4 |
| P1 | ~~integer 闭区间独立期望值~~（v0.6.17） | 1 |
| P1 | ~~UI/fingerprint-check 展示 queryCanonical~~（v0.6.18） | 3、4 |
| P1 | ~~missing×integer 组合期望值~~（v0.6.19） | 1 |
| P1 | ~~linear 源缺失 / noise=0 仍耗 RNG~~（v0.6.20） | 1、4 |
| P1 | ~~sequence/text 种子无关闭合式~~（v0.6.21） | 1 |
| P1 | ~~status/DIFF 暴露 planCanonical·queryCanonical·白名单指针~~（v0.6.22） | 2、4、6 |
| P1 | ~~missing×number + 申报提纲证据要点~~（v0.6.23） | 1、2、3 |
| P1 | ~~demo-jury 白名单 evidence + README 评委三步~~（v0.6.24） | 3、4、6 |
| P1 | ~~missing×category RNG 次序独立期望值~~（v0.6.25） | 1 |
| P2 | 可选：对 MoonFrame 的互操作示例（依赖生态包） | 1 |
| P2 | ~~工具拒答评测集（allowlist 面）~~（v0.6.1）；模型语义拒答另开 | 6 |
| — | 列类型覆盖等表格 UX：仅当不强化「我们是 DF 库」叙事时再做 | — |
