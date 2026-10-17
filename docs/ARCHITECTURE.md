# 架构与接口

## 执行链路

浏览器 CSV → 本机 HTTP → MoonBit CSV 解析 → 会话数据 → MoonBit 分析 → 结果 JSON → SVG / 报告。

模型模式：自然语言 → 服务端模型接口 → 已注册工具 → MoonBit → 精简工具结果 → 模型解释。原始 CSV 不进入模型上下文。

## MoonBit 核心

`csv`、`analysis` 是可独立复用的包。`api` 为 JS 导出 `parse_csv`、`summarize_json`、`step_json`。构建生成的 `web/engine.js` 同时由本机服务调用，但不会作为静态文件对外提供。浏览器不负责数学计算。

现阶段选择独立的小型专用核心，而不承诺完整 DataFrame 能力；未来可以在接口明确后评估接入 MoonFrame。没有复制候选项目的实现代码。

## 本机 API

| 方法与路径 | 请求 | 返回 |
| --- | --- | --- |
| GET `/api/status` | 无 | 版本、引擎、模型模式与数据策略，不含凭据 |
| GET `/api/datasets` | 无 | 当前浏览器会话的数据描述 |
| POST `/api/datasets` | `{name,csv}` | 数据描述、列质量和内容指纹 |
| POST `/api/demo` | `{}` | 两份已标注的合成数据 |
| DELETE `/api/datasets/:id` | 无 | 删除当前会话数据 |
| POST `/api/analyze` | Selection | 单份分析与绘图点 |
| POST `/api/compare` | `{selections:[a,b]}` | 两份分析与可比性提示 |
| POST `/api/chat` | `{message,selections,history}` | 回答、工具调用记录、计算结果 |
| POST `/api/report` | `{selections}` | Markdown 与 JSON 报告 |
| POST `/api/export-csv` | Selection | 统一到秒的完整所选信号 CSV |

`Selection` 包含 `datasetId,timeColumn,valueColumn,timeUnit,valueUnit,target,initial,stepTime,bandPercent,tailPercent,rangeStart,rangeEnd`。区间可为 null。服务端从会话取得数据，客户端不能提交自称已计算的指标来伪造报告。

## 状态与限制

- 服务仅监听 `127.0.0.1`，校验 Host、跨站 Origin 与自定义请求头；不提供公开托管或多人服务。
- 随机会话 Cookie 为 HttpOnly / SameSite=Strict，数据不跨会话共享。
- 最多 8 个会话，空闲两小时后可回收；每会话最多 12 份数据、100 万单元格和 20 MiB 文件内容。
- 单文件 10 MiB；请求体 12 MiB；CSV 最多 10 万行、128 列。
- 同一会话只允许一个模型分析请求，取消/断线会中止上游请求。
- 模型地址只来自进程环境；禁止带 URL 用户凭据、查询参数和片段，禁止非本机明文 HTTP；拒绝重定向。
- 密钥不进入状态、报告、浏览器与模型工具结果；模型原始错误内容不回传。
- 浏览器以文本显示文件名、列名、问题、模型回复与工具记录，不执行生成 HTML。
- 不持久化实验数据或模型配置。刷新页面后分析参数不保留，默认参数需要重新确认。

这是一个单机科研工具的边界，不是生产级多租户部署方案。需要公共部署时，应另行设计身份认证、持久化、权限与资源隔离。
