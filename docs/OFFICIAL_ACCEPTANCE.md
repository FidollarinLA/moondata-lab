# 官方验收六条对照（十月赛 · 复审口径）

依据：[2026 MoonBit 黑客松](https://moonbitlang.github.io/Hackathon2026/) 公开验收条目。最终以赛事章程与群通知为准。本文件是工程自查，**不代表已通过审核**。

| # | 官方要求 | 本仓库证据 | 状态 |
| --- | --- | --- | --- |
| 1 | MoonBit 为主 | 主业：`generator/` 合成契约、`contract/` 指纹与工具白名单；工作台计算仍走 MoonBit。**不以**自研 DataFrame 对抗 [MoonFrame](DIFF_VS_MOONFRAME.md) | 复审加厚契约层 |
| 2 | 仓库公开、提交可追踪 | Public；`main`；Actions；Issues | 已公开可克隆 |
| 3 | 能运行：README + 示例 + 测试 | README「评委三步」；`smoke` / `demo-jury` / `fingerprint-check`；MoonBit + Node | 已具备 |
| 4 | 本期工作有效 | v0.6.39：评委脚本断言非法 propose；见 CHANGELOG / [RESUBMIT](RESUBMIT.md) | 继续至 10/31 |
| 5 | 开源合规 | Apache-2.0；[THIRD_PARTY](../THIRD_PARTY.md) | 已具备 |
| 6 | AI 可解释 | [AI_USAGE](AI_USAGE.md)；工具白名单由 MoonBit 校验，并写入 `trace.contract` / `evidence` | 已加强 |

## 报名表仍须本人完成

- 一页 Markdown **申报书须人工撰写**（勿直接粘贴 AI 文）。提纲：[SUBMISSION_TEMPLATE](SUBMISSION_TEMPLATE.md)，**按 RESUBMIT 口径改写**。
- 群昵称 = GitHub ID：`FidollarinLA`。
- 十月最多改报名 **3 次**；截止 **2026-10-31**。
- 敏感信息只填官方表单，勿进公开仓库。

## 选题方向

**可复现合成数据 + 证据型 Agent 工作台**；通用表格库能力归属 MoonFrame 生态。
