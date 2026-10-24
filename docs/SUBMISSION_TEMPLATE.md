# 报名申报书提纲（请人工改写后使用）

> **不要把本文直接粘贴进官方报名表。**  
> 赛事要求申报书由参赛者本人撰写。请用自己的话重写一页以内 Markdown，再提交。  
> 复审请先读 [RESUBMIT](RESUBMIT.md) 与 [DIFF_VS_MOONFRAME](DIFF_VS_MOONFRAME.md)。

建议结构：

```markdown
# MoonData Lab 项目申报书

## 项目名称
MoonData Lab

## 一句话简介
（用你自己的话：可复现合成数据契约 + 证据链工作台；通用 DataFrame 不与 MoonFrame 抢定位）

## 参赛方向
数据处理 / 新项目（或按表单选项填写）

## 与生态关系（复审必写）
承认 MoonFrame 覆盖通用 CSV/聚合/Vega-Lite。本项目不做「又一个 DataFrame」。
MoonBit 贡献在：确定性字段生成契约、方案规范化指纹、受限工具白名单、报告证据链。

## 至少三个完整场景
1. 固定方案+种子生成销售台账 → 两次 SHA-256 一致 → 报告含指纹  
2. `node scripts/demo-jury.mjs`：无 UI 走通生成/分组/报告  
3. 助手路径：非法工具名被 MoonBit contract 拒绝；合法 propose_generation 只出方案不落库  

## 核心功能
- MoonBit `generator` + `contract`：合成方案、规范化指纹、工具允许列表  
- 工作台：证据型报告、可选本地模型只规划坐标  
- 表格分析为工作台能力，不宣称替代 MoonFrame  

## 原创或参考
生成契约与 Agent 边界为原创实现。交互参考过通用探索工具；MoonFrame / MoonCharts 为生态参考，未移植其源码。见 THIRD_PARTY.md。Apache-2.0。

## 公开仓库
https://github.com/FidollarinLA/moondata-lab
```

提交前自检：仓库 Public、能 clone、`main` 有 README、至少 10 条有效提交、群昵称=GitHub ID、申报书已人工改写。
