# Stop the Slop for Browser

B站字幕文案检测浏览器插件，使用自己的 ChatGPT 登录或 DeepSeek API。

| 平台 | 源码 | Release 附件 | 使用方式 |
| --- | --- | --- | --- |
| macOS · Apple 芯片 | [mac/](mac/) | `stop-the-slop-for-brower-1.5.8-mac-arm64.zip` | 内置 Node.js，解压后打开 `启动检测.command` |
| macOS · Intel | [mac/](mac/) | `stop-the-slop-for-brower-1.5.8-mac-x64.zip` | 内置 Node.js，解压后打开 `启动检测.command` |
| Windows x64 | [win/](win/) | `stop-the-slop-for-brower-1.5.8-win.zip` | 内置 Node.js，解压后运行 `Install.cmd` |

[下载最新版本](https://github.com/LynkHu0/stop-the-slop-for-brower/releases/latest)。两个平台独立维护源码、启动方式与说明。

macOS 操作说明见 [mac/使用说明.md](mac/使用说明.md)。Windows 安装说明见发布包内 `先看安装说明.txt`；源码启动方式见 [win/使用说明.md](win/使用说明.md)。

在 Chrome / Edge 扩展管理页开启开发人员模式，加载对应平台的 `extension` 文件夹。Windows 安装程序会打开安装后的扩展位置。随后配置自己的模型服务和本机连接码。

评分是模型对字幕文案的判断，不是作者身份或 AI 来源的证明。请阅读对应平台的 `PRIVACY.md`。发布包不含账户、Key、Cookie、连接码或用量记录。

本项目为非官方社区适配。上游来源及授权边界见 [mac/UPSTREAM.md](mac/UPSTREAM.md)。
