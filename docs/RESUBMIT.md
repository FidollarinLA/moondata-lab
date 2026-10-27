# 复审改动说明（针对组委驳回）

**驳回要点：** 自研解析/聚合/绘图与 [MoonFrame](https://mooncakes.io/docs/ihb2032/MoonFrame) 重叠；扣掉后「字段生成 + 交互编排」深度不足。  
**截止：** 2026-10-31 前可改报名表复审（≤3 次）。**本文件不代替你本人改写的申报书。**

## 产品经理结论

> **可复现合成数据契约 + 证据链报告 + 受限 Agent 工具运行时**；通用 DataFrame 让位给 MoonFrame。

## 评委三步（与 README 一致）

1. `node scripts/demo-jury.mjs` → 生成 / 分组 / 报告指纹；精确拒 shell；propose 不落库且指纹≡生成  
2. `node scripts/fingerprint-check.mjs` → 指纹与 CSV SHA 自洽；精确拒答 + propose≡generate + `toolsValidated`  
3. [DIFF_VS_MOONFRAME](DIFF_VS_MOONFRAME.md) → 定位一句话；`/api/status` 含 `proposeGeneration`

也可一条龙：`node scripts/smoke.mjs`（含上两项）。

## 工程增量（请评委看这些）

| 增量 | 位置 |
| --- | --- |
| 与 MoonFrame 差异 | [DIFF_VS_MOONFRAME](DIFF_VS_MOONFRAME.md) |
| MoonBit `contract` 指纹 + 白名单 | `contract/` |
| 工具执行前 MoonBit 校验 | `workbench-agent` / `local-planner` + `validate_tool_json` |
| `planCanonical` / `queryCanonical` 进 provenance、报告 `evidence`、UI 指纹行 | 生成、explore、报告、工作台 |
| 工具轨迹 `trace.contract` / `evidence.toolsValidated`（MoonBit 白名单，非模型自述） | Agent / builtin / local-planner |
| 拒答评测（精确文案：shell / 空 datasetId） | `test/agent-reject.test.mjs` |
| `propose_generation` 不落库 + 指纹≡generate | workbench-agent + demo-jury / fingerprint-check |
| 独立期望值（number/linear/integer/category/date/missing 次序等） | `generator_test` + `generate-contract` |
| 离线自检 | `scripts/fingerprint-check.mjs` |
| 5 分钟演示 | `scripts/demo-jury.mjs` |
| status 冒烟（含 `proposeGeneration`） | `GET /api/status` 或 `node scripts/status-check.mjs` |
| 工作区证据摘要 | 导出包顶层 `evidence[]`（含 planCanonical / verified） |

## 申报书应怎么改（你自己写）

1. **不要**写「我们独立实现了完整 CSV/聚合/绘图库」。  
2. **要写**：相对 MoonFrame，贡献是生成契约、指纹证据、Agent 边界。  
3. 三个场景对齐评委三步：同种子复现 → 报告含 SHA-256/`planCanonical` → 非法工具被拒（贴 `demo-jury` / `fingerprint-check` 输出即可）。

提纲：[SUBMISSION_TEMPLATE](SUBMISSION_TEMPLATE.md)（必须人工改写后粘贴）。
