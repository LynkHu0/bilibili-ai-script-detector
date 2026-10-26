# Stop the Slop for Browser

> **AI Script Detector for Bilibili**：读取 B站视频字幕，用你自己的 ChatGPT 账户或 DeepSeek API，为视频文案提供 AI 疑似评分。

[![Download](https://img.shields.io/badge/Download-GitHub_Releases-0f172a?style=flat-square)](https://github.com/LynkHu0/stop-the-slop-for-brower/releases/latest)
[![Browsers](https://img.shields.io/badge/Browser-Chrome_%2F_Edge-4285F4?style=flat-square)](#installation)
[![Privacy](https://img.shields.io/badge/Privacy-Policy-15803d?style=flat-square)](PRIVACY.md)
[![Upstream](https://img.shields.io/badge/Upstream-Stop_the_Slop-555?style=flat-square)](https://github.com/MauroPello/stop-the-slop)

基于 **[MauroPello/stop-the-slop](https://github.com/MauroPello/stop-the-slop)** 的非官方 B站适配，保留上游 YouTube 代码，新增 B站字幕读取、本地服务和检测界面。非上游官方版本，与 B站及模型服务商无隶属或背书关系。

---

## 下载与相关项目

- **安装包：** [下载最新版本](https://github.com/LynkHu0/stop-the-slop-for-brower/releases/latest)，按处理器选择 `-mac-arm64.zip`（Apple 芯片）或 `-mac-x64.zip`（Intel），内置 Node.js，无需另行安装。当前发布版本为 **1.5.7**。
- **问题反馈：** [GitHub Issues](https://github.com/LynkHu0/stop-the-slop-for-brower/issues)。反馈前请移除 Key、Cookie、连接码和账户信息。
- **上游项目：** [Stop the Slop — YouTube AI Script Detector](https://github.com/MauroPello/stop-the-slop)。

本适配版通过 GitHub 分发，尚未上架浏览器扩展商店；上游的商店入口不安装本适配版。

---

## 功能

- **封面评分标记：** 在支持的 B站首页、搜索、UP空间等列表卡片上显示疑似评分，观看前即可参考。
- **可见卡片自动检测：** 卡片进入可视区域及约200px预加载区后排队检测，也可手动点击。自动检测默认开启，可在插件齿轮设置关闭。
- **视频页仪表盘：** 打开扩展查看当前视频的评分和简短等级，不提供模型解释或逐句证据。
- **两种检测服务：** 选择自己的 ChatGPT 账户或 DeepSeek API Key；两者不会自动切换。ChatGPT 可用性以账户权限和服务支持范围为准。
- **本机评分缓存：** 按视频分P、账户/Key、模型、推理设置和提示词版本隔离；已有有效结果尽量复用，减少重复调用。
- **并发与用量：** 本地服务支持1–100并发，默认10，多标签页共用限制；展示本工具记录的 token 用量和 DeepSeek 费用估计，可手动同步官方账单摘要。
- **明暗主题：** 支持跟随系统及手动切换。

**分数不是来源证明。** 它是模型的启发式估计，未经概率校准，不等于 AI 实际创作字数比例。不要据此指控作者、判断违规或作出处罚。

---

## 仓库结构

```text
├── extension/                 # Chrome / Edge 扩展（Manifest V3）
│   ├── bili/                  # B站字幕、卡片及仪表盘
│   ├── billing/               # 用户触发的 DeepSeek 账单同步
│   ├── popup/                 # 保留的上游 YouTube 弹窗
│   └── manifest.json
├── local-server/              # 本机登录、模型调用、队列与用量
├── tests/                     # 浏览器逻辑模拟检查
├── worker/                    # 历史 Cloudflare 后端源码
├── 启动检测.command            # macOS 启动入口
├── PRIVACY.md                 # 数据去向、保存及清除
└── UPSTREAM.md                # 上游来源与许可说明
```

B站检测使用 `local-server`，不需要部署 `worker`。不能用上游的 YouTube 后端代替本地 B站服务。

---

<a id="installation"></a>
## 安装（开发者模式）

### 1. 启动本地服务

1. 安装 [Node.js](https://nodejs.org/) **22或更新版本**。
2. [下载安装 ZIP](https://github.com/LynkHu0/stop-the-slop-for-brower/releases/latest) 并完整解压。
3. macOS 双击 `启动检测.command`。发布包内置 Node.js 和所需依赖，无需安装 Node.js 或 npm；保持窗口运行。若系统阻止打开，先核验源码与来源，再按自己的系统策略处理。
4. 打开 `http://127.0.0.1:17653`，选择服务并配置自己的 ChatGPT 账户或 DeepSeek Key，保存后测试。测试也会消耗用量。

### 2. 加载 Chrome / Edge 扩展

1. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`。
2. 开启 **开发者模式**，点击 **加载已解压的扩展程序**，选择 `extension` 文件夹。
3. 打开扩展的齿轮设置，粘贴本地设置页的 **本机连接码**，保存并连接。
4. 阅读 [隐私说明](PRIVACY.md)，按需关闭自动检测，然后登录 B站并刷新页面。

连接码会保存在本机，正常重启通常沿用；删除连接文件或更改连接码后需要重新配对。滚动浏览可能自动调用模型并产生用量；关闭开关不保证取消已经发出的请求。

---

## 适用范围与限制

- 面向电脑 Chrome / Edge 的 B站网页，不适用于 B站手机 App；其他浏览器未作兼容性承诺。
- 仅分析可获取的官方字幕前15000字符，至少需要50字符。无字幕、太短、登录失败和接口错误不生成有效评分，不自动转录音频。
- 高并发和长字幕可能增加耗时、费用或限流，不保证“即时检测”。B站页面和接口变化也可能导致功能失效。
- ChatGPT 的套餐、模型、地区及工作区权限以服务商当前支持为准。DeepSeek 使用自己的 API 余额。
- 当前版本通过 **60项模拟自动检查**，不代表所有设备、真实账户或来源识别准确率已验收。

---

## 隐私与权限

B站字幕先进入本机服务，再发送至你选择的 **OpenAI 或 DeepSeek**；B站 Cookie 不作为模型请求字段发送。保留的 YouTube 功能会查询上游 Cloudflare 服务，检测时还会向它提交视频 ID 和字幕。

DeepSeek 用量页同步需要用户先点击按钮，只向本机同步可见的账单摘要与筛选标签。OAuth令牌、Key及连接码保存在本机数据文件中，**没有应用层加密**；配置后的文件及备份不要分享。

域名权限、保存期限、自动检测及完整清除步骤见 **[PRIVACY.md](PRIVACY.md)**。下载包不包含个人凭据，不能把配置后的运行目录当作干净安装包分享。

---

## 开发与检查

```sh
git clone https://github.com/LynkHu0/stop-the-slop-for-brower.git
cd stop-the-slop-for-brower/mac/local-server
npm ci
cd ..
node --test local-server/test.mjs local-server/*.test.mjs tests/*.test.cjs
```

---

## 上游与许可证

感谢 **MauroPello** 的 [Stop the Slop](https://github.com/MauroPello/stop-the-slop)。本适配参考 commit `dec988b03ff63224aa6d6c796b5963eb3ccac95e`。

上游 README 声明 MIT，但当前尚未补齐所需的完整许可文件及版权声明。本仓库没有将“已公开源码”等同于已完善开源授权，也未擅自添加 MIT 标识。复用与再分发前请查看 **[UPSTREAM.md](UPSTREAM.md)** 中的待确认事项。

## macOS 发布打包

发布包内置 Node.js，分为 arm64 和 x64。开发源码通过 `npm ci --prefix local-server` 安装依赖后，可使用 esbuild 将 `local-server/server.mjs` 打包为 ESM（platform=node、target=node22）；将该文件传给 `package-release.py --server-bundle`。

`package-release.py` 还需要 `--arch`、`--node-archive`、`--node-checksums`、`--output` 参数。Node 归档及 SHASUMS256.txt 从同一官方版本目录下载；脚本会校验 SHA256，仅提取对应架构的 Node 二进制和许可证，排除私人运行数据。
