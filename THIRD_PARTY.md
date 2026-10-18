# 来源与第三方说明

## 原创实现

本项目的 MoonBit 解析/分析核心、Node.js 服务、Agent 调度、中文界面、SVG 绘图与测试为本仓库的独立实现。没有复制 Data Formulator、MoonFrame、MoonCharts 或 robust_stats 的源码，不将这些项目的功能或成熟度归为本项目已有成果。

许可证是标准 Apache-2.0 文本，见 LICENSE。`NOTICE` 记录本项目版权。

## 学习和选题参考

- [Microsoft Data Formulator](https://github.com/microsoft/data-formulator)：自然语言、数据处理和可视化交互的应用参考。
- [MoonFrame](https://github.com/ihb2032/MoonFrame)：MoonBit 表格处理生态参考。
- [MoonCharts](https://github.com/pxgt/mooncharts)：MoonBit 图表库生态参考。
- [MoonBit 官方 Agent 教程](https://www.moonbitlang.com/blog/moonbit-async-code-agent)：模型与工具循环的通用结构参考。
- [MoonBit FFI 文档](https://docs.moonbitlang.com/en/latest/language/ffi.html)：JSON / JavaScript 交互和编译目标参考。

这里列出参考资料不表示采用其代码、兼容其 API、拥有其授权背书或移植其完整产品。

## 运行与开发依赖

v0.3可选本地依赖：Qwen官方Qwen3-0.6B-GGUF Q8_0预训练模型（Apache-2.0）与llama.cpp b11718（MIT）Windows CPU便携发行版。setup只下载到忽略的.local目录，固定来源/摘要见docs/LOCAL_MODEL.md；源码包不捆绑权重或运行器。这是应用集成，不能宣称模型由本项目训练或推理引擎由MoonBit实现。

- MoonBit 工具链和标准库用于编译运行，按其自身许可证分发；本仓库不捆绑工具链。
- Node.js 运行时按其自身许可证分发；本仓库不捆绑 Node.js。
- Playwright 1.62.1（Apache-2.0）仅用于开发验收，锁定版本与完整性见 pnpm-lock.yaml。其浏览器发行版遵循各自许可证。
- SVG 图标与图表为本项目代码生成，无远程字体、图库或图片资源依赖。

## 数据来源

通用版 `sales/inventory/survey/experiment-synthetic.csv/json` 由本仓库 MoonBit generator 和四种字段方案生成；不含个人、真实业务或真实实验数据。JSON 包含规范化方案与随机种子。算法使用经典 Park–Miller 16807 / Schrage 约简，源码独立实现；属于模拟取样，不承诺隐私保护或真实世界拟合。

`examples/motor-a.csv` 和 `motor-b.csv` 由 `scripts/generate-examples.mjs` 使用标准二阶阶跃响应公式确定性生成，不含真实实验、个人或第三方数据。名称 a/b 只是两组不同阻尼/固有频率的合成响应，不声称对应某个实物电机或控制器。
