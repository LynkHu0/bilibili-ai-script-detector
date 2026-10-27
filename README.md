# Stop the Slop for Browser

当前版本 **1.5.15**：服务和账号设置全部集成到浏览器插件，封面三色光晕正式加入；百分比与光晕可独立开关。无需本地 WebUI。

| 平台 | 安装教程 | 更新入口 |
| --- | --- | --- |
| macOS（Apple 芯片 / Intel 共用） | [mac/](mac/) | 安装本机组件.command |
| Windows | [win/](win/) | 安装本机组件.bat |

[下载最新轻量包](https://github.com/LynkHu0/stop-the-slop-for-brower/releases/latest)。先从 [Node.js 官网](https://nodejs.org/) 安装 22 或更新版本；包内不含 Node.js，服务依赖已合并。

安装组件后加载永久位置的 extension。在插件内启动/停止服务、选择模型与推理强度、设置并发、添加/切换/退出 ChatGPT 账户或保存 DeepSeek Key，并查看用量。ChatGPT 登录自然会打开 OpenAI 官方授权页，完成后返回插件。所有操作仅在插件弹窗完成，不提供独立设置标签页。

已使用1.5.11或光晕测试版时无需删除扩展，更新本机组件后重新加载即可。账号配置与缓存保留。百分比和光晕默认开启，只改变显示，不增加检测调用；分数不能证明创作来源。

“浏览器插件自动连接”“检查当前检测服务”两块旧界面已删除。详情见各平台 README、PRIVACY、UPSTREAM。

1.5.15：默认仅显示简洁检测窗口。齿轮设置按用量→百分比→光晕→自动检测→服务开关→服务配置排列，删除独立标签页按钮与自动检测长描述。
