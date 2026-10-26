# 复审改动说明（针对组委驳回）

**驳回要点：** 自研解析/聚合/绘图与 [MoonFrame](https://mooncakes.io/docs/ihb2032/MoonFrame) 重叠；扣掉后「字段生成 + 交互编排」深度不足。  
**截止：** 2026-10-31 前可改报名表复审（≤3 次）。本文件不代替你本人改写的申报书。

## 产品经理结论

把项目从「又一个 MoonBit 表格分析库」改成：

> **可复现合成数据契约 + 证据链报告 + 受限 Agent 工具运行时**；通用 DataFrame 能力让位给 MoonFrame。

## 工程增量（请评委看这些）

| 增量 | 位置 |
| --- | --- |
| 与 MoonFrame 差异对照 | [DIFF_VS_MOONFRAME](DIFF_VS_MOONFRAME.md) |
| MoonBit `contract`：方案规范化指纹、工具白名单 | `contract/` |
| 工具调用在执行前经 MoonBit 校验 | `server/workbench-agent.mjs` + `validate_tool_json` |
| 生成结果携带 `planCanonical` 指纹 | `provenance.planCanonical`（JSON 导出） |
| 拒答评测（shell / 缺参工具） | `test/agent-reject.test.mjs` |
| 指纹属性测试（键序 / 种子） | `contract/contract_test.mbt` + `test/generate-contract.test.mjs` |
| 5 分钟无 UI 演示 | `node scripts/demo-jury.mjs`（含拒答断言） |

## 申报书应怎么改（你自己写）

1. **不要**再写「我们独立实现了完整 CSV/聚合/绘图库」。  
2. **要写**：相对 MoonFrame，本项目贡献是生成契约、指纹证据、Agent 边界；工作台可调用分析，但 DataFrame 主业不在此。  
3. 三个场景改为：同种子复现 → 报告含 SHA-256 → 非法工具被白名单拒绝（可用 `demo-jury.mjs` 证据）。

提纲仍见 [SUBMISSION_TEMPLATE](SUBMISSION_TEMPLATE.md)（必须人工改写后粘贴）。
