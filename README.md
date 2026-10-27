# MoonData Lab

[![Verify MoonData Lab](https://github.com/FidollarinLA/moondata-lab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/FidollarinLA/moondata-lab/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**可复现合成数据契约 + 证据链工作台（MoonBit）。**  
通用 DataFrame / 聚合 / Vega-Lite → 请用 [MoonFrame](https://mooncakes.io/docs/ihb2032/MoonFrame)。本仓库**不是**又一个表格库。  
对照：[与 MoonFrame 的差异](docs/DIFF_VS_MOONFRAME.md) · 复审要点：[RESUBMIT](docs/RESUBMIT.md)

仓库 **Public**，默认分支 **`main`**。当前工程口径 v0.6.56。

## 评委三步（约 5 分钟，无浏览器也可）

| 步 | 做什么 | 期望证据 |
| --- | --- | --- |
| 1 | `node scripts/demo-jury.mjs` | 生成 → 分组 → 报告含 `planCanonical` + `queryCanonical`；拒 `run_shell`；builtin 轨迹含白名单 `trace.contract` |
| 2 | `node scripts/fingerprint-check.mjs` | 独立重算指纹与 CSV SHA-256；拒 shell + builtin 白名单 `toolsValidated` |
| 3 | 打开 [DIFF_VS_MOONFRAME](docs/DIFF_VS_MOONFRAME.md)；可选 `node scripts/status-check.mjs` | 定位一句话；`/api/status` 含 `proposeGeneration` / 白名单 / `jury` |

```sh
git clone https://github.com/FidollarinLA/moondata-lab.git
cd moondata-lab
node scripts/smoke.mjs          # 含 jury + fingerprint-check
node server/index.mjs           # 可选 UI：http://127.0.0.1:4321
```

需要 Node.js 22+ 与 MoonBit。Windows 可先 `node scripts/setup-windows-toolchain.mjs`（[WINDOWS_BUILD](docs/WINDOWS_BUILD.md)）。

## 本项目贡献什么（复审口径）

| MoonBit | 角色 |
| --- | --- |
| `generator/` | 确定性合成字段（Park–Miller）、缺失与线性依赖 |
| `contract/` | 方案规范化指纹、Agent 工具白名单（含 `datasetId`） |
| `csv/` `explore/` `analysis/` | 工作台内计算路径；**不宣称**替代 MoonFrame |

JS 只做会话、UI 与编排。可选模型只规划白名单工具；local planner 也经 MoonBit 校验后才计算。

## 文档索引

| 文档 | 用途 |
| --- | --- |
| [RESUBMIT](docs/RESUBMIT.md) | 驳回后改了什么、申报书怎么写 |
| [OFFICIAL_ACCEPTANCE](docs/OFFICIAL_ACCEPTANCE.md) | 官方六条对照 |
| [SUBMISSION_TEMPLATE](docs/SUBMISSION_TEMPLATE.md) | 申报提纲（**须人工改写**） |
| [AI_USAGE](docs/AI_USAGE.md) | AI 红线 |
| [ITERATION](docs/ITERATION.md) | 持续迭代 backlog |

Apache-2.0 · [THIRD_PARTY](THIRD_PARTY.md)
