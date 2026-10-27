# 通用计算契约 v1

## 生成 moondata.generate/1

随机数由 MoonBit 的 Park–Miller 16807 生成器完成，使用 Schrage 整数约简避免 JS / WasmGC 的 32 位溢出。状态范围 1..2147483646；每次 `u=state/2147483647`，因此 0<u<1。不是密码学随机数，不能用于密钥、隐私保护或真实分布保证。

按行、按字段顺序取样。缺失概率大于零时先取一次随机数决定是否为 null；缺失则不再取该单元格的其他随机数。字段顺序、类型和缺失率改变会改变后续样本。只有同一规范化方案、种子和契约版本承诺复现。

| 类型 | 定义 |
| --- | --- |
| integer | `min + floor(u*(max-min+1))`，整数闭区间 |
| number | `min*(1-u)+max*u`，按 decimals 四舍五入并夹回上下界 |
| sequence | `start + rowIndex*step`；可附文本 prefix |
| text | prefix 与数值序列拼接，不生成语义长文本 |
| category | 等概率选择 choices；重复选项相当于增加权重 |
| boolean | `u < probability` |
| date | UTC 起始日期加整数天步长，输出 YYYY-MM-DD |
| linear | `slope*source + intercept + noise*(2u-1)`，四舍五入 |

**独立期望值（非实现快照）：** seed=`1` 时前三个 `u` 为 `16807/M`、`282475249/M`、`1622650073/M`（`M=2147483647`）。因此 `probability=0.5` 的 boolean 三行为 `true,true,false`；Park–Miller `u∈(0,1)`，故 `probability=0` → 全 `false`，`probability=1` → 全 `true`。`missing=0` 的 date 不消耗 RNG，第 `i` 行日序为 `start_day + i*step`（例如 `startDate=2026-01-01`、`step=1` → `2026-01-01..03`）。category 下标为 `floor(u * |choices|)`：`[A,B]` → `A,A,B`；`[X,Y,Z]` → `X,X,Z`；重复选项等价加权。sequence / text 为 `start + i*step`（text 加 prefix），**不消耗 RNG**，改种子行不变：`start=10,step=5` → `10,15,20`；`prefix=R-` → `R-1,R-2,R-3`；负步长合法：`start=10,step=-3` → `10,7,4`；`prefix=N,start=5,step=-1` → `N5,N4,N3`。integer 为 `min + floor(u*(max-min+1))`（闭区间）：`[0,10]` → `0, 1, 8`；`[3,5]` → `3, 3, 5`；`[7,7]` → `7, 7, 7`。number 为 `round(min*(1-u)+max*u, decimals)` 再夹回 `[min,max]`：`[0,10]@2` → `0, 1.32, 7.56`；`[1,2]@3` → `1, 1.132, 1.756`；`[0,10]@0` → `0, 1, 8`（指纹含 `decimals=0`，非省略）；`min=max=5` → 恒为 `5`（仍按行抽 RNG，指纹含 `min=5,max=5`）。linear 为 `round(slope*src+intercept+noise*(2u-1), decimals)`（sequence 源不耗 RNG）：`slope=2,intercept=1,noise=0.5,decimals=2`、源 `1..3` → `2.5, 4.63, 7.26`；`noise=0` → `3, 5, 7`。**来源为 null 时输出 null 且不抽噪声**；来源有效时即使 `noise=0` 仍消耗一次 RNG。例：integer `[0,10]`、`missing=0.3` 后接 `y=2x+1`、五行 → `(null,null)×2,(5,11),(null,null)×2`。`missing>0` 时先抽一次：`u < missing` 则该格为 null 且**不再**抽该格其它随机数；例如 boolean `missing=0.3`、`probability=0.5`、五行 → `null,null,true,true,null`；integer `[0,10]`、`missing=0.3`、五行 → `null,null,5,2,null`；number `[0,10]@2`、`missing=0.3`、五行 → `null,null,4.59,2.19,null`；category `[A,B]`、`missing=0.3`、五行 → `null,null,A,A,null`；`[X,Y,Z]`、`missing=0.3` → `null,null,Y,X,null`；date `start=2026-01-01`、`step=1`、`missing=0.3`、五行 → `null,null,2026-01-03..05`（保留格用**行下标** `start_day+i*step`，不再抽 RNG）；linear `y=2x+1`、`noise=0`、`missing=0.3`、源 sequence `1..5` → `(1,null),(2,null),(3,7),(4,9),(5,null)`（null 跳过噪声抽取；保留格即使 `noise=0` 仍耗一次 RNG）；sequence `start=10,step=5`、`missing=0.3` → `null,null,20,25,30`；text `R-`、`missing=0.3` → `null,null,R-3,R-4,R-5`（保留格用行下标，不再抽 RNG）。覆盖测试：`generator/generator_test.mbt`、`test/generate-contract.test.mjs`。

linear 只引用同一行中位于前面的数值字段，来源缺失时输出 null（不抽噪声 RNG）。额外设置的 missing 与来源缺失会叠加，最终缺失率不保证等于设置值。noise 是均匀噪声半宽，不是正态标准差；`noise=0` 仍占一次抽取。类别选项均匀、独立，不隐含业务相关性。日期允许负步长或零步长（`step=0` → 各行重复 `start_day`，不消耗 RNG，改种子行不变）；范围 1900-01-01 至 2199-12-31。sequence / text 的步长必须非零，否则规范化阶段拒答 `序列步长不能为零或导致结果超界`（与 date 不同）。保留字段 `_synthetic` 或列名重名 → `字段类型无效、重名或使用了保留字段 _synthetic`；空类别 → `类别字段需要选项`；数值 `min>max` → `数值上下界无效`；linear 未引用前方数值列 → `线性关联需引用前面的数值字段`；非法 `startDate` → `起始日期须为有效的 YYYY-MM-DD`；`missing`/`probability`/`noise` 越界 → `缺失概率 0–0.8，布尔概率 0–1，噪声幅度非负`；`decimals` 非 0..8 → `小数位数 必须是 0–8 的整数`；均不写库。

行数 1..10000、字段 1..32，含 `_synthetic` 的单元格总数最多 300000。种子、类型、有限数、范围、依赖、字段重名在执行前验证；生成数值有界。所有记录附加 `_synthetic=true`。这是合成标识，不是真实性或隐私保证。

JSON 导出记录完整规范化方案、种子、契约和算法；CSV / JSONL 保留逐行标识。CSV UTF-8 原始内容的 SHA-256 不含文件名、UUID 或创建时间，因此可用来验证重复生成。

## 导入与字段识别

严格 CSV 不自动修复行宽、重复表头或坏引号。空白单元格视为缺失；0 不是缺失；NaN、Infinity 和其他非数值文本不参与数值分析。字段显示 numeric（可解析数）、missing（空白）、invalid（非空且不可解析数），其中 invalid 不表示文本列有业务错误。

非空值全部可解析有限数时标为 number；严格有效 YYYY-MM-DD 为 date；true/false 为 boolean；同时含可解析数值与非数值时标为 mixed；其余为 text。混合列仍可选作数值分析，非数值单元格会排除。没有自动单位推断，单位应体现在字段名或使用者说明中。

脏数据提示由 MoonBit `@csv.quality_notes` 按列计数生成：混合列说明有效/排除个数；缺失占比 ≥30% 时给出整数百分比（空白视为缺失，0 不算缺失）。纯文本列的非数值单元格不视为错误。界面与概览报告展示这些提示，不自动修复数据。

JSON / JSONL 为扁平对象，按第一次出现的字段顺序合并表头；不存在的键转为缺失。保留上传 JSON 中的数值/布尔/null 类型；CSV 转换到 JSON 保持字符串，不把 001 改成 1。内容指纹对应**原始上传 UTF-8 文本**，包括 BOM、换行和 JSON 空白；不会用转换后的 CSV 冒充原始来源。

导入中的合成标识或 provenance 仅为来源文件声明，标记 imported，不能证明生成过程或数据真实性。模型上下文不包含导入的任意 provenance。

## 统计 moondata.explore/1

分析参数指纹 `queryCanonical` 由 MoonBit `@contract.canonical_explore_query` 生成（不含会话 `datasetId`），与 `planCanonical` 并列写入报告 `evidence`；键序无关。示例：`moondata.explore/1|mode=group|group=地区|reducer=sum|value=金额`；无 `value` 的 count → `moondata.explore/1|mode=group|group=地区|reducer=count`（省略 `value=`）；`mode=overview` → `moondata.explore/1|mode=overview`；`distribution` → `…|mode=distribution|value=金额|bins=10`；`scatter`/`line` → `…|mode=scatter|x=数量|y=金额`；`plot` → `…|mode=plot|x=地区|yColumns=[金额]|kind=bar|reducer=sum`；多序列时 **yColumns 数组次序保留**（`[金额,数量]` ≠ `[数量,金额]`），顶层 JSON 键序仍无关。

MoonBit 计算均值、总体标准差 `stddev`（分母 N）、样本标准差 `sample_stddev`（分母 N−1；少于两点时为 null）和缩放 RMS。均值/方差采用 Welford 算法。若运算溢出，返回不可用提示或错误，不制造零或输出 NaN。采用浮点运算，金额不保证十进制定点精度。界面与报告须区分两种标准差，不得把总体标准差说成样本标准差。

分位数将有效值升序排列，在 `(N-1)*p` 位置线性插值；Q1、median、Q3 分别对应 p=.25/.5/.75。直方图 1..50 个等宽箱，左闭右开，最后包含最大值；常数列只有一个箱。

分组最多 1000 个不同值。空白分组归入独立空白组，不与普通文本混合。count 统计全部行；sum/mean/min/max 使用该组有效数值，全无效时结果 null。sum 使用组均值乘有效数，浮点误差需按数据用途评估。

散点采用成对完整的有效数值；Pearson 使用中心化协方差和平方差累计量，两列任一常数时结果 null。少于两对拒绝。**相关关系不证明因果，也不是显著性检验。**

折线保留原始行顺序，不排序，不要求时间递增。横轴等间距展示顺序并标注源值，即使该源值是日期也不是按真实时间间隔绘制。缺失对被排除，可能跨缺口连接。

## 绘图、报告与导出

分组图按聚合值降序最多显示 50 组，报告表保留最多 1000 组；散点/折线最多等距抽取 1500 点，显示原始行号。统计仍使用全部有效数值或配对。报告点表与显示点相同，完整记录请下载数据集。

报告只接受查询参数，从服务端会话中的数据重新计算，不信任客户端附加的 statistics 等结果。附查询、来源指纹、合成标识、排除行数与方法局限。界面参数/数据改变立即禁用旧报告和图表下载；旧助手回复保留为对话，不覆盖新参数下的视图。

CSV 不为公式文本插入前缀，以保留值；将不可信 CSV 导入电子表格时须按文本处理。Markdown 以纯文本转义单元格，模型/文件文本不会作为 HTML 执行。

历史专业算法见 [MOTOR_V0_METHODS](archive/MOTOR_V0_METHODS.md)，不作为通用分析前提。

## v0.3 自由画图 mode=plot

该模式与历史单列line模式分开。X为一个现有字段，Y为最多8个不同的数值字段。自动推荐：类别X用柱状汇总，日期X用折线，数值X用散点；没有Y时按类别计数。自动推荐只是确定性字段规则。

新折线/散点使用实际有限数值或UTC日期毫秒坐标；类别折线按原始行序号等间距。折线仍按原始行顺序连接，不自动排序。缺失X排除；各Y分别匹配有效X并排除缺失Y，不要求所有序列同时完整。每条序列各自最多显示1500点，统计使用该序列全部有效配对。

新柱状图按X分组，多个Y分别聚合，默认mean；可选sum/min/max。Y为空使用count。所有Y共享前50个首次出现的X分组，避免不同序列的柱对错类别；结果表保留全部分组。多Y共用纵轴，不能自动视为同量纲。

报告包含规范化查询、每序列有效数与排除数、统计以及显示点/全部聚合组。页面只预览前200条结果表行，报告仍完整保留该结果表。CSV/JSON/JSONL下载始终提供全部原始记录。

本地模型提出配置后由同一套字段与计算验证执行。仅换图型的请求合并为配置补丁，保留用户X/Y/聚合；不存在的显式X拒绝。模型reason只为方案意见，不是已计算的结论。工具须经 MoonBit `validate_tool_call`：非白名单 → `Tool not allowlisted: <name>`；`plan_chart` / `plot_dataset` / `explore_dataset` 空 `datasetId` → `<tool> requires non-empty datasetId`；`explore_dataset` 带 `mode` 时同步跑 `canonical_explore_query`（非法 mode → `Unsupported explore mode`；缺 bins → `Missing integer field bins`）。成功调用在 `trace.contract` / `evidence.toolsValidated` 留下校验证据（非模型自述）。`propose_generation` 只规范化并返回 `plan` + `planCanonical`，`storeMutated=false`，**不写入** DatasetStore；真正落库仅在用户确认后的生成路径。同一方案随后 `generateDataset` 的 `provenance.planCanonical` 必须与提议指纹一致。非法方案在校验阶段失败且不写库：空 `columns` 或 `columns.length>32` → `Plan requires 1..32 columns`；`rows`/`seed` 越界（含 `seed=0`、`seed=2147483647`、`rows=10001`）→ `Plan rows/seed out of generation contract range`；合法上限 `seed=2147483646`、`rows=10000`、`columns=32` 可通过且不写库。

## v0.5 导入与工作区

XLSX：仅解析第一个工作表的扁平单元格值；共享字符串与数值写入与 CSV 相同的会话链路后，统计仍由 MoonBit 完成。不执行公式重算，不展开合并单元格语义，不读取宏。多工作表、图表页或受保护簿若不提供可用首表则拒绝。

UTF-8：文本 CSV/JSON/JSONL 须为有效 UTF-8（可用 BOM）。无效字节拒绝并提示另存 UTF-8 或改用 XLSX；不做静默 GBK 猜测。

工作区包契约 `moondata.workspace/1`：包含各数据集 records（或 csv）、合成标识与可选 view.query。默认导入时替换当前会话数据；视图中的 datasetId 按包内顺序重映射。工作区包不是真实性证明，也不跨机器同步密钥或模型配置。

多序列绘图：某一纵轴无有效配对时跳过该序列并警告，其他序列仍可绘制；全部无效则失败。界面主路径的折线/散点使用 `mode=plot`；历史 `mode=line|scatter` 仅兼容 API/报告，等间距折线不是真实时间轴。
