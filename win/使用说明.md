# Stop the Slop for Browser 1.5.10 · win 版

本版为轻量包，不内置 Node.js。自动连接本机服务，卡片结果显示百分比或“无文案”。

## 安装与使用

1. 从 [Node.js 官网](https://nodejs.org/) 下载适合自己系统和处理器的安装程序，安装 **Node.js 22 或更新版本**（可选官网符合要求的 LTS 版）。安装完成后重新打开终端或启动文件。
2. 从 [GitHub Release](https://github.com/LynkHu0/stop-the-slop-for-brower/releases/latest) 下载 `-win.zip` 并完整解压。
3. 双击 `启动检测-Windows.bat`，保持窗口运行。发布包已包含服务代码依赖，无需执行 npm install。
4. Chrome / Edge 扩展管理页开启开发人员模式，加载本包 `extension` 文件夹。
5. 打开 `http://127.0.0.1:17653/`，连接自己的 ChatGPT 或填写并保存 DeepSeek Key。插件会自动连接，无需复制连接码。
6. 登录 B站并刷新页面。无可用字幕的视频显示“无文案”，其他结果为模型的疑似判断，不能证明创作来源。

更新时先停止旧服务，再启动新版，并在扩展管理页更新/重新加载扩展。不要同时运行多个服务副本。

用户配置位于 `%LOCALAPPDATA%\BiliSlopData`，请勿分享。安装包不包含账户、Key、Cookie 或本机连接凭据。

## 源码开发

从源码运行需进入 `local-server/` 执行 `npm ci`；启动文件也会在源码依赖缺失时尝试安装。发布包中的服务依赖已经合并进服务文件。
