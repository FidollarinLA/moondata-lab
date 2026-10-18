# 架构与接口 v0.2

生成：字段方案 → Node 参数验证 → MoonBit generator → 类型化记录 / 合成标识 → 会话数据 → 三种下载。

分析：CSV / JSON / JSONL → 严格 CSV 数值解析 → 会话 → MoonBit analysis / explore → 图表与表格 → 重新计算后的报告。

模型：问题 → 服务端模型接口 → 受限工具 → MoonBit → 精简结果 → 模型解释。propose_generation 返回待检查方案，不写入数据集。实际执行只发生在用户点击生成后。

## 模块职责

- MoonBit csv：Unicode CSV 解析和数值有效性。
- MoonBit generator：确定性随机数、所有生成数值和逐行字段关系。
- MoonBit explore / analysis：统计、聚合、分位数、分布、相关，以及历史阶跃模块。
- Node data：格式转换、模式验证、UTC 日期格式化、元数据、会话访问和报告；不替换核心数学。
- 浏览器：字段编辑器、查询选择、文本显示、SVG 坐标布局和下载。

api 导出 `parse_csv,summarize_json,step_json,generate_json,distribution_json,aggregate_json,correlation_json`。引擎编译至忽略的 web/engine.js，由服务导入，不在静态文件白名单中。

## 通用接口

所有变更请求是 application/json，附 X-Lab-Client:1；会话以 HttpOnly / SameSite=Strict Cookie 区分。

| 路径 | 方法 | 请求 / 返回 |
| --- | --- | --- |
| /api/status | GET | 版本、模型配置模式、数据策略；无凭据 |
| /api/templates | GET | 四种可编辑模板 |
| /api/datasets | GET | 当前会话数据列表 |
| /api/import | POST | `{name,content,format:csv/json/jsonl}` → dataset |
| /api/generate | POST | `{name,rows,seed,columns}` → 合成 dataset |
| /api/profile | POST | `{datasetId}` → profile |
| /api/explore | POST | Query → result |
| /api/data-report | POST | Query → `{result,markdown,json}` |
| /api/download | POST | `{datasetId,format}` → 完整数据文本 |
| /api/workbench-chat | POST | `{datasetId?,message,query?,history?}` → 回答、trace、artifacts |
| /api/datasets/:id | DELETE | 删除当前会话指定数据 |

Query：datasetId 与 mode；group 模式附 group、reducer、可选 value；distribution 附 value、bins；scatter / line 附 x、y。报告重用**实际结果中规范化的 query**。

数据集记录原始内容指纹、导入格式和可选生成 provenance，数值列另存 number/null。JSON 下载有 records 和 provenance；JSONL 逐条记录，每行 `_synthetic` 保留。

## 模型边界

工具名单：profile_dataset、explore_dataset、propose_generation。分析绑定到当前选中 ID，模型自填其他 ID 不能切换数据。仅方案生成工具无需已有数据。工具参数错误反馈模型，不运行任意代码。

模型可见字段结构、摘要和有限分组结果，不可见原始预览、散点/折线采样行、任意导入 provenance 或原始文件。类别名称可能出现在分组结果。问题与历史本身由用户输入，可能包含用户主动给出的数据。

环境配置 LAB_MODEL_URL / LAB_MODEL_NAME / 可选 LAB_MODEL_KEY；无配置则明确离线。仅支持兼容工具调用协议的服务；远程 HTTPS，拒绝 URL 用户凭据、查询参数、片段与重定向。单次最多 6 轮 / 10 次工具 / 512 KB 响应 / 120 秒；单轮 45 秒。取消/断线中止上游。同一会话只允许运行一个助手请求。

## 运行边界

仅监听 loopback，校验 Host 和 Origin，静态白名单，CSP self，不提供公网部署或多人认证。最多 8 会话，空闲 2 小时可回收；每会话 12 数据集 / 100 万单元格 / 20 MiB 文件。请求最大 12 MiB，单文件 10 MiB。

没有持久化。刷新只保留同 Cookie 会话数据，视图默认概览；重启清空。密钥不进入客户端、错误日志和导出。

原 v0.1 `/api/analyze,compare,chat,report,export-csv,demo` 和 CSV 旧接口只保留历史回归兼容，通用页面不调用。旧专业方法和验收另见 archive；不可用旧记录代表 v0.2 通过。
