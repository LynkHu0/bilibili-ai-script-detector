# Stop the Slop for Browser

B站字幕文案检测插件，使用自己的 ChatGPT 登录或 DeepSeek API。

当前版本 **1.5.10**。轻量包不内置 Node.js，用户先从 [Node.js 官网](https://nodejs.org/) 安装 22 或更新版本。

| 平台 | 源码与教程 | 下载后启动 |
| --- | --- | --- |
| macOS（Apple 芯片 / Intel 共用） | [mac/](mac/) | `启动检测.command` |
| Windows | [win/](win/) | `启动检测-Windows.bat` |

[下载最新版本](https://github.com/LynkHu0/stop-the-slop-for-brower/releases/latest)：附件以 `-mac.zip`、`-win.zip` 区分。

安装流程：安装 Node.js → 完整解压 → 启动本机程序 → 在 Chrome / Edge 手动加载 `extension` → 连接自己的 ChatGPT 或填写 DeepSeek Key。插件自动连接本机服务，无需复制连接码。保持启动窗口运行。

发布包已合并服务代码依赖，无需自行执行 npm install。个人配置不会放入分发包；结果不能证明创作来源。详情见各平台 PRIVACY.md，上游来源及许可边界见各平台 UPSTREAM.md。
