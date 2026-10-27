# 与 MoonFrame 的差异（复审说明）

组委反馈：自研解析 / 聚合 / 绘图与生态库 [MoonFrame](https://mooncakes.io/docs/ihb2032/MoonFrame) 重叠，扣掉后「字段生成 + 交互编排」深度不足。本文件是工程自查，**不代表已通过复审**。

## 结论（给评委一句话）

**MoonFrame = MoonBit 通用 DataFrame / I/O / 聚合 / Vega-Lite。**  
**MoonData Lab = 可复现合成数据契约 + 证据链报告 + 受限 Agent 工具运行时（工作台）。**  
通用表格动词不再作为本项目的原创卖点；与 MoonFrame 能力重叠的部分在文档中明确降级为「工作台内薄封装」。

## 能力对照

| 能力 | MoonFrame | MoonData Lab（复审后定位） |
| --- | --- | --- |
| CSV / JSON / NDJSON DataFrame | ✅ 主业 | 工作台导入路径；**不宣称替代 MoonFrame** |
| group_by / join / lazy / expr | ✅ | 仅工作台内有限聚合；复杂整形请用 MoonFrame |
| Vega-Lite / 图表规范 | ✅ | 本机 SVG 预览是产品壳，**不是**图表库创新点 |
| 确定性合成字段生成（种子+方案指纹） | ❌ 非其定位 | ✅ **本项目 MoonBit 主业** |
| 合成标识 / 来源 SHA-256 / 报告证据链 | ❌ | ✅ 工作台强制产物 |
| 受限工具白名单（模型不可执行任意代码） | ❌ | ✅ MoonBit `contract` + Node 编排 |
| 本地小模型只规划坐标、不编造数值 | ❌ | ✅ 可选路径 |

## 本期加厚的「独立工程深度」

1. **生成契约（MoonBit `generator` + `contract`）**  
   规范化方案 JSON、工具调用白名单校验、独立期望值测试（number/linear/integer/category/sequence/text/date/missing 次序、linear 列 missing 等）；同方案同种子承诺可复现指纹；`queryCanonical` 覆盖 overview/group/distribution/scatter/line/plot（多 `yColumns` 次序保留）。
2. **证据链工作台**  
   报告重算、参数变更作废旧导出、合成标识；`planCanonical`（生成）与 `queryCanonical`（分析）进 provenance / 报告 `evidence` / UI 指纹行；工作区包顶层 `evidence[]`。
3. **Agent 边界**  
   只允许显式分析/生成工具；无 shell、无任意代码、无任意网络文件系统工具；`plan_chart`/`plot`/`explore` 强制 datasetId；稳定拒答文案：`Tool not allowlisted: run_shell`、`<tool> requires non-empty datasetId`、非法 propose → `Plan requires 1..32 columns` / `Plan rows/seed out of generation contract range`；`propose_generation` 只出带 `planCanonical` 的方案（`storeMutated=false`），不静默写库；成功调用写入 `trace.contract` / `evidence.toolsValidated`（MoonBit 校验，非模型自述）；本地小模型规划也经白名单后才计算。

评委冒烟：`GET /api/status` 的 `contracts` / `jury`，或 `node scripts/status-check.mjs` / `demo-jury` / `fingerprint-check`（后两者均校验精确拒答文案 + 白名单 evidence）。

## 明确不再宣传为原创亮点

- 「我们从零做了完整 CSV 解析与通用聚合库」  
- 「我们做了 MoonBit 版 pandas / 绘图库」  

这些与 MoonFrame 叙事冲突，且不利于复审。仓库内历史 `csv/` `explore/` 包仍服务当前工作台与回归，文档与申报书改为：**通用 DataFrame 请用 MoonFrame；本仓库贡献在生成契约与证据型 Agent 工作台。**
