# Windows：可核对的项目内工具链

```powershell
node scripts/setup-windows-toolchain.mjs
node scripts/check.mjs
./start.ps1
```

准备脚本需要联网和Windows x64，使用系统自带tar与.NET Framework C#编译器。源码运行没有新增第三方JavaScript包。所有下载、标准库编译和路径适配器均位于忽略的.local，系统MoonBit、用户PATH和账号设置保持不变。

工具链固定为0.10.16+b1a0e846e。档案来自MoonBit官方[下载页](https://www.moonbitlang.com/download)，配套标准库来源对应官方安装脚本。脚本在解压前核对固定SHA-256；缓存和新下载执行相同校验。地址含latest但内容**不会自动跟随升级**，内容改变后必须人工审查新版本与校验值。标准库SHA是本项目固定下载指纹，不声称具有独立签名认证。

| 档案 | SHA-256 |
| --- | --- |
| moonbit-windows-x86_64.zip | 653ebf0a3b2683048faa8ad79b7b7d0721bf78726bf1a7e58678e9740b0d430f |
| core-latest.zip | d58caf5ee6e2a95d8785adf7d90fd68dd9366d174df1dfaa36646dd6b47c5663 |

本机发现驱动传入的Windows扩展路径在编译器中报错，且原全局标准库缓存与编译器版本不一致。scripts/windows/moon-path-compat.cs仅规范化编译器参数中的扩展路径前缀，正确引用参数，并转发标准输出、错误与退出码；不修改业务算法，不过滤编译器错误，不在构建失败时偷偷使用旧产物。

两种标准库目标JS/WasmGC都成功编译后，脚本才写.local/windows-toolchain.json。正常的build/check/start通过scripts/toolchain.mjs自动选择它，环境只影响当前命令及其子进程。显式MOON或MOON_HOME优先，避免覆盖使用者指定的工具链；若之前手动设置过它们，请先在当前终端清除再使用项目配置。

源码包不包含.local、模型权重和编译产物，因此解压后仍需执行准备步骤。官方可变地址未来若不再提供本次固定档案，会明确失败，不承诺无限期在线重现；可保留已验证档案用于离线准备。长于Windows普通路径限制的目录仍建议迁到较短位置，路径兼容层不等于完整的长路径支持。
