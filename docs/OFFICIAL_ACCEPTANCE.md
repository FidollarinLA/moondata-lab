# 官方验收六条对照（十月赛）

依据：[2026 MoonBit 黑客松](https://moonbitlang.github.io/Hackathon2026/) 公开验收条目。最终以赛事章程与群通知为准。本文件是工程自查，**不代表已通过审核**。

| # | 官方要求 | 本仓库证据 | 状态 |
| --- | --- | --- | --- |
| 1 | MoonBit 为主 | `csv/` `generator/` `explore/` `analysis/` `api/` 为数值核心；JS 只做会话/UI/编排，不静默替换计算。见 [CORE_USAGE](CORE_USAGE.md)、[METHODS](METHODS.md) | 持续加强 MoonBit 契约与测试 |
| 2 | 仓库公开、提交可追踪 | Public；默认分支 `main`；Actions CI；Issues 承载迭代计划 | 已公开可克隆 |
| 3 | 能运行：README + 示例 + 测试 | README 快速开始；`node scripts/smoke.mjs`；`examples/core-only.mjs`；MoonBit 双后端 + Node + 浏览器测试 | 已具备 |
| 4 | 本期工作有效 | v0.3–v0.5.3：自由画图、本地模型、XLSX、工作区、样本标准差、混合列/高缺失脏数据提示；见 CHANGELOG | 继续公开提交至 10/31 |
| 5 | 开源合规 | Apache-2.0；参考来源 [THIRD_PARTY](../THIRD_PARTY.md) | 已具备 |
| 6 | AI 可解释 | [AI_USAGE](AI_USAGE.md)：哪些由 AI 辅助、哪些必须人工掌握 | 已具备 |

## 报名表仍须本人完成

- 一页 Markdown **申报书须人工撰写**（表单要求不要直接用 AI 代写）。可用 [SUBMISSION_TEMPLATE](SUBMISSION_TEMPLATE.md) 作提纲，**请你自己改写后粘贴**。
- 入群并把群昵称改为 GitHub ID：`FidollarinLA`。
- 十月最多改报名 **3 次**；截止 **2026-10-31**（报名与验收同日）。
- 身份证、银行卡等敏感信息只填官方表单，**不要**提交进公开仓库。

## 选题方向对齐

官方启发方向含「数据处理」。本项目属于：**可复现合成数据 + 扁平表分析工作台**，MoonBit 提供解析与统计核心，可选 AI 只规划受限工具。
