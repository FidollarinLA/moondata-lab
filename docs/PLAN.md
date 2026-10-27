# MoonData Lab 通用版实施计划

范围修订：2026-10-18（Asia/Shanghai）。本计划替代此前误限定到电机的方案。

## 产品范围

面向多领域表格数据的 AI 工作台。销售台账、库存、问卷、运营数据、传感器和实验记录都是示例领域，不作为硬编码业务模型。

用户已明确选择**两者都做**：“生成新数据集”与“上传已有数据后生成分析、图表和报告”均为交付范围。当前版本 **v0.5（本地表格探索预览版）**：在 v0.4 基础上完成 XLSX 导入、工作区包、分析路径收敛到自由画图，以及对外话术锁定。旧阶跃工具仅作历史回归模块。

## 当前已完成的共同基础

- [x] 新通用版本目录 moondata-lab，保留原版 Git 历史。
- [x] 产品与模块标识改为 MoonData Lab / moondata_lab。
- [x] 可复用的严格 CSV 解析、数值统计、受限模型工具循环和导出基础。
- [x] 归档旧计划并记录范围纠正。
- [x] 通用数据分析流程：去除时间必须递增、必须填目标值等专业前提。
- [x] 通用数据生成流程：字段定义、行数、随机种子、约束和明确的合成标识。
- [x] 多领域示例、新页面、新端到端验收。
- [ ] GitHub 推送：认证条件沿用前次记录，目标仓库改为 moondata-lab。

## 分阶段实现

| 阶段 | 内容 | 验收标准 |
| --- | --- | --- |
| A 领域解耦 | 通用数据集、字段类型和质量概览；专业分析移至可选模块 | 无时间列的销售台账也能导入和概览；不要求电机参数 |
| B 数据生成 | 自然语言或字段配置描述合成数据；预览生成方案后执行；固定种子复现 | 行数、字段、范围与类型符合约束；CSV/JSON/JSONL 输出明确标为合成 |
| C 通用分析 | 描述统计、分组聚合、分布、趋势与两列关系 | 分别使用台账、问卷和实验记录验证；计算有来源和缺失值策略 |
| D 图表与报告 | 图形选择、自然语言迭代、结果依据和导出 | 图表与实际计算一致；报告不含模型编造的数值 |
| E 产品验证 | 跨领域端到端、错误输入、取消、窄屏、模型协议 | 重新生成通用版证据，不能沿用旧电机截图和验收结论 |
| F GitHub | 干净提交、推送、远端 SHA 与 CI 核对 | 未认证或未推送时不报告发布成功 |

## 本版执行明细与状态

1. **A 已完成**：保留原目录，在 moondata-lab 建立通用版本。CSV / JSON / JSONL、类型、数值摘要、缺失、不同值与预览；无时间列台账可直接分析。
2. **B 已完成**：8 类字段、种子、范围、概率、日期与前向线性依赖。MoonBit 执行随机取样和关系计算，Node 只校验/格式化；逐行标识与 JSON 方案导出；同方案同种子指纹一致。
3. **C 已完成**：概览、五种分组聚合、等宽直方图、插值分位数、完整配对 Pearson、原始行顺序折线；缺失不补零，常数相关返回 null。
4. **D 已完成**：图表、表格、来源指纹与报告；参数改动禁用旧下载；模型工具循环可提出方案，用户检查后执行；离线不冒充自然语言模型。
5. **E 已完成本机检查**：JS / WasmGC 数学核对、64项Node测试、21个通用浏览器场景和8项真实本地模型流程检查，覆盖390px、类型、格式、恶意文本、取消与模型工具链。远程模型提供商实测未做，详见 ACCEPTANCE。
6. **F 待登录**：已准备发布脚本、CI、分阶段提交和交付包；本机 gh 尚未登录，连接器查询目标仓库返回不可访问。登录后执行发布脚本，核对远端 SHA，再检查 Actions；不强推。

## v0.3 本轮增量

- [x] 其他/自定义作为显式入口，保留字段编辑自由度。
- [x] 自由画图：所有横轴字段、最多8个数值纵轴、三种图型、自动推荐与字段回填。
- [x] 实际数值/日期间隔、独立缺失处理、多序列图例与可导出依据。
- [x] Qwen0.6B预训练权重和便携CPU运行器下载、摘要校验、本机启动与清理。
- [x] 中文问题和当前选择生成受约束绘图配置；换图型保留用户坐标，未知显式横轴拒绝。
- [x] 本地真实推理与浏览器验收，不再仅有模拟服务。
- [ ] GitHub登录与远端推送仍待外部登录条件，不以本地完成冒充发布。

## v0.5 本轮增量

- [x] 对外定位锁定为「本地表格探索预览版」。
- [x] XLSX 导入（仅第一个工作表）与 UTF-8 文本校验。
- [x] 工作区导出/导入包（重启后可恢复数据集与可选视图）。
- [x] UI 分析路径收敛：折线/散点只走自由画图；更多统计保留概览/分组/分布。
- [x] 多序列空列跳过、非柱状图 Y 轴按数据范围、截断提示与通用 demo。
- [x] GitHub 已公开推送；默认分支改为 `main`，并补充黑客松初审核对页。
- [x] 对齐官方六条：OFFICIAL_ACCEPTANCE、AI_USAGE、ITERATION、smoke 脚本；MoonBit 增加样本标准差。
- [ ] 按组委会要求于 2026-10-31 前**人工改写**申报书并更新报名表申请复审（最多 3 次）。
- [ ] 持续按 [ITERATION](ITERATION.md) 公开提交实质增量至截止日。
- [x] 建立审核导向持续迭代说明：[ITERATION](ITERATION.md)（过审门槛、P0/P1/P2 backlog、每轮节奏）。
- [x] v0.5.3：MoonBit 脏数据提示（混合列 / 高缺失），概览与界面可见。
- [x] v0.6.0：正视 MoonFrame 驳回意见；`contract` 包 + demo-jury + 申报/README 口径转向合成契约与证据工作台。
- [x] v0.6.1：生成 provenance 写入 `planCanonical`；拒答评测集；demo-jury 校验白名单拒 `run_shell`。
- [x] v0.6.2：多 kind 指纹键序稳定 + 种子分歧属性测试（独立期望线形式）。
- [x] v0.6.3：date/boolean/missing 指纹面；Markdown 报告写入 planCanonical。
- [x] v0.6.4：JSON 报告顶层 `evidence`；`scripts/fingerprint-check.mjs` 纳入 smoke。
- [x] v0.6.5：plan_chart 强制 datasetId；local planner 校验后才 explore；拒测扩面。
- [x] v0.6.6：README/RESUBMIT/申报提纲统一「评委三步」路径（文档压缩）。
- [x] v0.6.7：boolean/date 独立期望值测试 + METHODS 交叉引用。
- [x] v0.6.8：工作台指纹行展示 planCanonical 摘要（title 全文）。
- [x] v0.6.9：category `floor(u*|choices|)` 独立期望值 + METHODS 说明。
- [x] v0.6.10：`/api/status` 暴露 contracts/jury；status-check 纳入 smoke。
- [x] v0.6.11：missing×boolean RNG 顺序独立期望值 + METHODS 说明。
- [x] v0.6.12：工作区包 `evidence[]`；导入后 UI 展示声称 planCanonical。
- [x] v0.6.13：`number` lerp + decimals 独立期望值（METHODS 闭合式）。
- [x] v0.6.14：`linear` + noise 独立期望值（METHODS 闭合式）。
- [x] v0.6.15：Agent/builtin 工具轨迹写入 MoonBit allowlist evidence。
- [x] v0.6.16：MoonBit `queryCanonical` + 报告 evidence（与 planCanonical 并列）。
- [x] v0.6.17：`integer` 闭区间独立期望值（METHODS 闭合式）。
- [x] v0.6.18：explore 附带 queryCanonical；UI + fingerprint-check 验收。
- [x] v0.6.19：missing×integer RNG 次序独立期望值。
- [x] v0.6.20：linear 源缺失 / noise=0 仍耗 RNG；RESUBMIT 评委路径含 queryCanonical。
- [x] v0.6.21：sequence/text 种子无关独立期望值。
- [x] v0.6.22：status/DIFF 暴露 planCanonical·queryCanonical·白名单评委指针。
- [x] v0.6.23：missing×number 期望值；SUBMISSION_TEMPLATE 证据要点同步。
- [x] v0.6.24：demo-jury 断言白名单 evidence；README 评委三步更新。
- [x] v0.6.25：missing×category RNG 次序独立期望值 + METHODS。
- [x] v0.6.26：missing×date RNG 次序（保留格用行下标）+ METHODS。
- [x] v0.6.27：linear 列 missing 次序独立期望值 + METHODS。
- [x] v0.6.28：missing×sequence/text 行下标期望值 + METHODS。
- [x] v0.6.29：fingerprint-check / status-check 白名单 evidence 断言。
- [x] v0.6.30：distribution/scatter/line queryCanonical 独立期望值。
- [x] v0.6.31：空 datasetId / shell 拒答文案独立期望值。
- [x] v0.6.32：demo-jury 精确拒答；plot 多 yColumns 次序指纹。
- [x] v0.6.33：fingerprint-check 精确拒答对齐；DIFF 评委证据面刷新。
- [x] v0.6.34：propose_generation 返回 planCanonical 且不写入 DatasetStore。
- [x] v0.6.35：propose 指纹与 generate provenance 一致性契约。
- [x] v0.6.36：fingerprint-check / status 暴露 propose 不落库指针。
- [x] v0.6.37：评委材料与 status 测试同步 propose/精确拒答。
- [x] v0.6.38：非法 propose_generation 稳定拒答且不写库。
- [x] v0.6.39：demo-jury / fingerprint-check 断言非法 propose 拒答。

## 下一版本候选（不作为已完成能力）

优先加深生成契约与 Agent 边界；可选 MoonFrame 互操作示例。列类型覆盖 / GBK / 多数据集比较仅在不强化「自研 DataFrame」叙事时考虑。长文本训练、自动训练与实时采集另立范围。

## 实现边界

通用是领域可扩展，不意味着第一版支持任何格式、任何行业的专业算法。优先覆盖结构化表格；图片、音频、任意文档和专业训练语料另行确定。

电机阶跃计算只作为历史专业模块保留。默认入口、助手提示、分析参数和示例均需脱离 motor 假设。

## 历史

旧计划见 archive/MOTOR_V0_PLAN.md。旧原型仍在原 moonmotor-lab 目录，未被覆盖或发布。范围调整说明见 SCOPE_CORRECTION.md。
