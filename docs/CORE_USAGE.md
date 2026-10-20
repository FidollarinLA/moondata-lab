# 单独使用 MoonBit 核心

网页、Node会话和模型不是使用解析与计算核心的前提。当前源码可以本地构建，尚未声称发布至mooncakes注册表。

```sh
node scripts/build.mjs
node examples/core-only.mjs
```

示例直接导入生成的web/engine.js，解析四行台账，把空白保留为null，计算三个有效金额的均值20，以及东/西两组总和40/20。对独立预期做断言，不启动服务器，不需要模型或网络。

FFI入口接收和返回JSON字符串，返回含ok，失败含error。不要把错误当数值0。生成产物被Git忽略，需要先构建。

| 包 / 导出 | 工作 |
| --- | --- |
| csv / parse_csv | 严格CSV、原始字符串、数值/null和缺失计数 |
| generator / generate_json | 固定种子、字段类型、逐行关系、合成标识 |
| analysis / summarize_json | 均值、总体标准差、RMS等 |
| explore / aggregate_json | count/sum/mean/min/max分组 |
| explore / distribution_json | 等宽直方图与分位数 |
| explore / correlation_json | 配对数值的Pearson相关 |

各包的pkg.generated.mbti为公开接口；api/moon.pkg展示同模块导入这些包的写法。外部工程应以实际工具链支持的本地模块依赖方式接入，不能假定moon add已有线上版本。@csv.parse返回表头和字符串行；@csv.number返回可选有限数；@explore.aggregate接收分组、数值/null及聚合名。

方法见 [计算契约](METHODS.md)。核心不推断业务单位，不处理任意格式，不运行模型。来源指纹、JSON导入和报告编排属于服务层。JS示例验证JS导出；WasmGC核心测试不等于已交付同样的Wasm宿主接口。
