# MoonData Lab

[![Verify MoonData Lab](https://github.com/FidollarinLA/moondata-lab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/FidollarinLA/moondata-lab/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**可复现的合成数据契约 + 证据链工作台（MoonBit）。**  
通用 DataFrame / 聚合 / Vega-Lite 请用生态库 [MoonFrame](https://mooncakes.io/docs/ihb2032/MoonFrame)——本项目**不**把自己定位成又一个表格库。差异说明：[与 MoonFrame 的差异](docs/DIFF_VS_MOONFRAME.md) · 复审说明：[RESUBMIT](docs/RESUBMIT.md)。

本机中文工作台（v0.6）：用固定方案与种子生成可复现数据；对当前会话做有限分析与报告；可选模型只规划受限工具。不承诺任意格式或自然语言一次做对。

| 评审想看的 | 去哪里 |
| --- | --- |
| 为何不是 MoonFrame 重复造轮子 | [DIFF_VS_MOONFRAME](docs/DIFF_VS_MOONFRAME.md) |
| 复审改了什么 | [RESUBMIT](docs/RESUBMIT.md) |
| 官方六条对照 | [OFFICIAL_ACCEPTANCE](docs/OFFICIAL_ACCEPTANCE.md) |
| 5 分钟无 UI 演示 | `node scripts/demo-jury.mjs` |
| AI 红线 | [AI_USAGE](docs/AI_USAGE.md) |

```sh
git clone https://github.com/FidollarinLA/moondata-lab.git
cd moondata-lab
node scripts/smoke.mjs
node scripts/demo-jury.mjs    # 生成 → 分组 → 报告指纹（给评委）
node server/index.mjs         # http://127.0.0.1:4321
```

仓库 **Public**，默认分支 **`main`**。

## MoonBit 负责什么（复审后口径）

| 包 | 角色 |
| --- | --- |
| `generator/` | 确定性合成字段（Park–Miller）、缺失与线性依赖 |
| `contract/` | 方案规范化指纹、Agent 工具白名单校验 |
| `csv/` `explore/` `analysis/` | 工作台内计算路径；**不宣称**替代 MoonFrame DataFrame |

JS 只做会话、UI 与编排，不静默替换数值。模型（可选）不能执行 shell / 任意代码。

## 当前可以做什么

- **生成数据**：可编辑字段、行数、种子；同方案同种子复现；`_synthetic=true` 与来源指纹。
- **证据报告**：Markdown/JSON 从查询重算；含 SHA-256、排除行数、方法局限。
- **受限助手**：仅 `profile` / `explore` / `plot` / `propose_generation` 等白名单工具；提出生成方案须用户确认后才落库。
- **工作台分析**：导入 CSV/JSON/JSONL/XLSX（首表）、自由画图、工作区包——产品壳能力，不是与 MoonFrame 对标的库创新点。

## 快速开始

需要 Node.js 22+ 与 MoonBit 工具链。Windows 可先 `node scripts/setup-windows-toolchain.mjs`（见 [WINDOWS_BUILD](docs/WINDOWS_BUILD.md)）。

```sh
node scripts/build.mjs
node scripts/demo-jury.mjs
node server/index.mjs
```

## 文档与许可

Apache-2.0。第三方与参考：[THIRD_PARTY](THIRD_PARTY.md)。持续迭代：[ITERATION](docs/ITERATION.md)。
