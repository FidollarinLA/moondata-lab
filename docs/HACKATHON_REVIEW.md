# 黑客松 / 初审快速核对

面向评审与复审：本仓库已公开，可用标准 `git clone` 获取默认分支 `main`。

## 30 秒结论

| 项 | 状态 |
| --- | --- |
| 仓库可见性 | Public：https://github.com/FidollarinLA/moondata-lab |
| 默认分支 | `main`（与开发分支内容同步） |
| 问题 | 通用表格：生成可复现合成数据；上传已有表 → 图表 / 统计 / 可复核报告 |
| MoonBit 角色 | CSV 解析、确定性生成、描述统计、聚合、分位数、相关；**不是**聊天框包装 |
| 模型角色 | 可选；只规划受限工具参数，不编造数值，不执行任意代码 |
| 本地可跑 | Node 22+；`node scripts/build.mjs` → `node server/index.mjs` → `http://127.0.0.1:4321` |
| 无 UI 核心 | `node examples/core-only.mjs`（见 [CORE_USAGE](CORE_USAGE.md)） |

## 建议评审路径（约 10 分钟）

1. 克隆并打开 README，确认定位为「本地表格探索预览版」。
2. 构建启动后：生成销售台账 → 分组求和 → 下载报告，核对 SHA-256 与方法局限。
3. 或上传 `examples/sales-synthetic.csv`，用自由画图选坐标。
4. 可选：`node examples/core-only.mjs` 验证 MoonBit 数值链路独立可用。
5. 证据索引：[ACCEPTANCE](ACCEPTANCE.md)、[HUMAN_REVIEW](HUMAN_REVIEW.md)、`artifacts/`。

## 明确不宣称

- 不是任意格式 / 任意自然语言万能分析平台。
- 合成数据不是真实业务或隐私合成保证。
- 本地小模型可能选错字段；坐标与报告才是核对依据。
- 相关不证明因果；总体标准差不是样本标准差。

## 复审说明（针对「无法克隆」）

此前仓库曾为私有，未登录访问会显示 404，导致初审无法克隆。现已改为 Public，并提供 `main` 默认分支。请直接：

```sh
git clone https://github.com/FidollarinLA/moondata-lab.git
cd moondata-lab
git rev-parse --short HEAD
```

若仍失败，请记录本机网络错误信息并联系组委会；仓库侧已按公开可克隆验证。
