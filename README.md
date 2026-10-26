# Stop the Slop for Browser

当前版本 **1.5.11**：插件显示检测服务运行状态，并提供启动 / 停止按钮。服务在电脑后台运行，不必保留终端窗口。使用自己的 ChatGPT 或 DeepSeek API。

| 平台 | 安装教程 | 一次性组件安装入口 |
| --- | --- | --- |
| macOS（Apple 芯片 / Intel 共用） | [mac/](mac/) | 安装本机组件.command |
| Windows | [win/](win/) | 安装本机组件.bat |

[下载最新轻量包](https://github.com/LynkHu0/stop-the-slop-for-brower/releases/latest)。包内不含 Node.js，请先从 [官网](https://nodejs.org/) 安装 Node.js 22 或更新版本。

安装流程：安装 Node.js → 解压 → 关闭旧版终端并运行一次组件安装 → 移除旧扩展并加载安装程序打开的新版 extension → 插件里点击启动服务 → 配置 ChatGPT 或 DeepSeek。此后直接在插件里开关，自动连接，无需连接码。

停止时取消未开始的任务，等待已提交请求完成后退出；没有设置开机自启动。旧扩展缓存不会自动迁移，服务账号配置保留在本机。发布包不包含个人账号、Key 或 Cookie。

已检查隔离本机启动停止及原生通信协议，未调用 AI；Windows 实机和浏览器按钮完整实测仍待验证。来源、隐私与许可边界见各平台的 PRIVACY.md、UPSTREAM.md。
