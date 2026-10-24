# 黑客松 / 初审快速核对

面向评审与复审：本仓库已公开，可用标准 `git clone` 获取默认分支 `main`。  
官方六条逐项证据：[OFFICIAL_ACCEPTANCE](OFFICIAL_ACCEPTANCE.md)。持续迭代节奏：[ITERATION](ITERATION.md)。

## 30 秒结论

| 项 | 状态 |
| --- | --- |
| 仓库可见性 | Public：https://github.com/FidollarinLA/moondata-lab |
| 默认分支 | `main` |
| 定位 | **合成契约 + 证据工作台**；不是 MoonFrame 式 DataFrame 库 → [DIFF_VS_MOONFRAME](DIFF_VS_MOONFRAME.md) |
| MoonBit 角色 | `generator` 确定性生成、`contract` 指纹与工具白名单；工作台内统计；**不是**聊天包装 |
| 模型角色 | 可选；白名单工具；不编造数值；见 [AI_USAGE](AI_USAGE.md) |
| 本地可跑 | `node scripts/smoke.mjs`；`node scripts/demo-jury.mjs`；`server/index.mjs` → `:4321` |
| 复审材料 | [RESUBMIT](RESUBMIT.md)（申报书须人工改写） |

## 建议评审路径（约 10 分钟）

1. 克隆并打开 README，确认定位为「本地表格探索预览版」（v0.5）。
2. Windows 若本机无 MoonBit：先按 [WINDOWS_BUILD](WINDOWS_BUILD.md) 执行一次 `node scripts/setup-windows-toolchain.mjs`（固定哈希，写入项目 `.local`，不改系统安装）。
3. `node scripts/build.mjs` → `node server/index.mjs` → 浏览器打开 `http://127.0.0.1:4321`。
4. 点「我想生成数据」→ 用默认销售台账生成 → 自由画图或分组求和 → 下载 Markdown 报告，核对 SHA-256 与方法局限。
5. 或点「我已有数据」上传 `examples/sales-synthetic.csv`，在自由画图选坐标。
6. 可选：另开终端 `node examples/core-only.mjs`，确认不启网页也能跑 MoonBit 解析与计算。
7. 证据索引：[ACCEPTANCE](ACCEPTANCE.md)、[HUMAN_REVIEW](HUMAN_REVIEW.md)、`artifacts/`；迭代节奏见 [ITERATION](ITERATION.md)。

## 明确不宣称

- 不是任意格式 / 任意自然语言万能分析平台。
- 合成数据不是真实业务或隐私合成保证。
- 本地小模型可能选错字段；坐标与报告才是核对依据。
- 相关不证明因果；`stddev` 为总体标准差（N），`sample_stddev` 为样本标准差（N−1，不足两点则为空）。

## 复审说明（针对「无法克隆」）

此前仓库曾为私有，未登录访问会显示 404，导致初审无法克隆。现已改为 Public，并提供 `main` 默认分支。请直接：

```sh
git clone https://github.com/FidollarinLA/moondata-lab.git
cd moondata-lab
git rev-parse --short HEAD
```

若仍失败，请记录本机网络错误信息并联系组委会；仓库侧已按公开可克隆验证。
