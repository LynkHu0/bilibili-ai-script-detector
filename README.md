# Stop the Slop for Browser

一个 B 站视频文案检测插件。读取视频字幕，使用你的 ChatGPT 套餐或 DeepSeek API 分析文案，在视频封面显示疑似评分和颜色光晕。

基于 [Stop the Slop](https://github.com/MauroPello/stop-the-slop) 的非官方 B 站适配。

## 支持平台

- macOS（Apple 芯片和 Intel）
- Windows
- Chrome、Edge 等支持加载扩展的浏览器

## 功能

- 自动检测可见的视频卡片，也可以手动检测
- 在封面显示评分和光晕，可分别关闭
- 使用 ChatGPT 套餐或 DeepSeek API，可选择模型和推理强度
- 调整检测字数、并发数，查看本机用量
- 缓存检测结果，减少重复请求

## 下载和安装

从 [Releases](https://github.com/LynkHu0/stop-the-slop-for-browser/releases/latest) 下载对应系统的压缩包。

1. 安装 [Node.js](https://nodejs.org/) 22 或更新版本。
2. 解压下载的文件，运行安装本机组件程序。
3. 在 Chrome 或 Edge 的扩展管理页开启开发者模式，选择“加载已解压的扩展程序”，加载安装程序提示的 `extension` 文件夹。
4. 打开插件设置，启动检测服务，连接 ChatGPT 或填写 DeepSeek API Key。

详细步骤：[macOS](mac/) · [Windows](win/)

## 常见问题

### 为什么有的视频显示“无文案”？

插件目前读取 B 站返回的字幕。视频有旁白或画面字幕，但没有可读取的字幕时，暂时无法检测。

### 分数代表什么？

这是模型对字幕文案的疑似评分，未经概率校准，不能证明文案是否由 AI 创作。

### 会产生费用吗？

ChatGPT 检测使用已授权账户的套餐用量；DeepSeek 检测使用你自己的 API 余额。自动检测会增加请求次数，检测字数也可以在设置里调整。

### 如何更新？

下载新版本并运行安装本机组件程序，然后在浏览器扩展管理页重新加载插件，刷新 B 站页面。

## 相关项目

- [Shadowrocket 版](https://github.com/LynkHu0/stop-the-slop-for-shadowrocket)
- [问题反馈](https://github.com/LynkHu0/stop-the-slop-for-browser/issues)
- [隐私说明](mac/PRIVACY.md) · [上游与许可说明](mac/UPSTREAM.md)
