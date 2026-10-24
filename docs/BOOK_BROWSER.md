# 内置寻书与下载入库

更新：2026-10-24。功能分支：`codex/in-app-book-browser`。

## 用户流程

底部「寻书」→ 选择书源或输入 HTTPS 网址 → 在原生内置浏览器里找书、登录、点击下载 → 文件完成后自动校验并加入书架 → 返回显示「立即阅读」。

预置好读、苦瓜书盘、书格，可收藏最多 30 个自定义书源，保留最近 12 个访问页面。预置入口不代表网站在每个国内网络都可用，也不代表所有书籍均可下载。网络请求仅在用户打开书源后发生。

## 架构与数据

- React 页面：`src/components/FindBooks.jsx`，沿用宣纸、青绿、朱砂与宋体风格。
- 原生浏览器：固定 `@capgo/capacitor-inappbrowser@8.26.1`；使用真正的 WebView，不把第三方网站放进 iframe，也不将远程网页载入主 Capacitor WebView。
- 接入层：`src/lib/bookBrowser.js`，先注册事件再打开浏览器。仅处理原生下载事件，不接收远程网页发来的任意读文件指令。
- 传输入库：`src/lib/bookDownloads.js`，收件箱保存下载回执，原生文件通过本地 Capacitor 文件地址读取。只在书籍事务和回执成功写入后清理临时文件。
- 现有 `importFile` 继续负责实际解析、指纹查重、接回缺失文件和保留笔记。下载和本地导入共享串行队列，避免同时查重后插入两份。
- IndexedDB 升为 v4，仅新增 `downloads` 表，继承已有六张书籍与阅读数据表。下载回执是本机传输记录，不进入书籍备份。
- 书源收藏、访问历史放本机 localStorage；Cookie 由原生浏览器管理，不写入阅读数据库或备份。
- HTTPS 网址不接受嵌入账号密码。不开启 TLS 忽略、任意外部应用跳转、网页截图或远程网页控制主界面的接口。

入库前检查空文件、200 MB 上限、支持格式、HTML 登录页及 PDF / ZIP 文件头；EPUB 容器和内容仍由实际解析器验证。单独的下载成功事件不等于入库成功。

每次下载写入独立 UUID 缓存目录，保留自然文件名。这样临时文件清理后，再次下载同名但内容不同的书也不会命中旧下载回执。重复原生回调只处理一次；相同内容的第二次下载交给原有内容指纹查重。

## 原生组件适配工具

`tools/patch_inappbrowser.mjs` 是构建工具的一部分，保留上游源文件及授权头，修改内容以此脚本公开。上游包使用 MPL-2.0，项目按原版本固定引用；修改的是下载交接行为，不替换 Cookie、重定向和 Blob 传输实现。

1. **做什么**：把上游“下载完成先打开外部查看器”改为“通知阅读器自动入库”；增加安卓下载字节事件、iOS 下载开始事件、独立 UUID 目录和大小限制。
2. **什么时候使用**：安装依赖后、原生构建前。`postinstall`、`prebuild`、`prebuild:android`、`prebuild:native` 已接入。更新上游组件版本前必须重新检查对应源代码。
3. **输出含义**：`book download handoff ready` 仅表示指定版本的补丁已就绪；不表示 Android / iOS 编译或真机测试通过。版本不符或替换锚点改变会报错，不静默跳过。重复执行不应再次改写文件。
4. **验证要求**：干净 `npm ci` 能应用补丁，重复执行幂等；未知版本/源结构必须拒绝。原生编译和真机下载还要分别通过，不能用浏览器模拟事件替代。

上游：[源码](https://github.com/Cap-go/capacitor-inappbrowser)、[组件文档](https://capgo.app/docs/plugins/inappbrowser/)。

## 构建

```bash
npm ci
npm run android:sync
# JDK 21 + Android SDK 36
cd android
./gradlew assembleDebug lintDebug
```

Android 应用 ID 和固定 Alpha 签名约定保持不变，版本为 `0.3.0-alpha.1` / `30001`。本机生成的 debug APK 不一定能覆盖已发布签名，安装测试包前应确认签名或使用现有 CI 的固定签名产物。

iOS 新增原生工程，使用 SPM：

```bash
npm ci
npm run ios:sync
# 以下在安装了相应 iOS SDK 的 Mac / Xcode 上执行
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

iPhone 安装需使用自己的 Apple 签名与设备配置。已有“添加到主屏幕”的 PWA 不会通过网页更新变成原生 App，需要在旧版导出备份，再在原生版恢复。Windows 环境不能验证 Xcode 编译。

CI 保留网页验收和安卓构建，并添加 iOS 模拟器无签名编译。分支推送不会部署 GitHub Pages 或发布正式版本；只有 main 上的既有发布流程会做这些事。

## 验证

```bash
npm test
npm run test:book-browser
npm run test:acceptance
npm run build -- --base=/book-reader/
npm run build:native
```

`dev-book-browser.html` 用模拟的原生下载回执与文件读取适配器，接入真实 EPUB/PDF/TXT 解析器、IndexedDB 与 React 界面，检查查重、失败重试、文件清理顺序、书源持久化和手机布局。它没有伪装成真实的 WebView 网络测试。

此次验收同时修复旧测试页的日志上传 Promise 未捕获问题；它会把日志网络失败错误地记成应用的 unhandled rejection。仅捕获日志发送失败，应用本身的错误和拒绝处理器仍保留。

### 本轮执行记录（2026-10-24）

| 检查 | 结果 |
|---|---|
| 干净 `npm ci` 与原生组件补丁 | 通过；补丁可重复执行 |
| Node 单元测试 | 65 / 65 通过 |
| 完整浏览器验收 | 18 / 18 页通过 |
| v3 → v4 书库升级 | 实际 IndexedDB 验证，文件、进度、批注保留 |
| 三格式下载回执 → 实际解析入库 | 通过；原生传输使用模拟适配器 |
| `/book-reader/` 子路径生产构建 | 通过 |
| 原生网页资源构建、Android / iOS Capacitor 同步 | 通过；不等同于原生编译 |
| 390px 浅色 / 深色界面检查 | 通过 |
| Android APK 编译、Xcode 编译、真机下载 | 尚未执行成功，不能据此宣称手机端已验收 |

GitHub 连接通道报错，命令行也未配置可用的 GitHub 凭据，因此本轮没有完成推送、创建 PR 或生成云端安装包。代码保存在本地功能分支；不需要向聊天发送访问令牌。

本地测试记录保留在 `.tmp/unit-final.log`、`.tmp/acceptance-current.log`、`.tmp/build-web.log` 和 `.tmp/build-native-final.log`。此前失败的验收日志也保留，未将旧失败记录改写成成功。

真机验收需要单独记录系统、WebView 版本、网络与结果：

- Android / iPhone：打开书源、前进后退、关闭返回、登录后重开仍保留会话。
- 普通 EPUB 下载，以及有跳转、临时链接和附件文件名的下载。
- 下载同名不同内容文件；下载同一文件两次，确认书架无重复。
- 入库后立即阅读三种格式，检查封面、目录、笔记和续读。
- 下载登录页、空文件、未知格式、超大文件、网络中断，确认不出现虚假入库成功。
- 强制结束进程后再打开：传输未完成显示中断；已有完整缓存可重新入库；缓存被系统清理时明确要求重下。
- 安装包断网打开：原书库和阅读功能继续可用。

## 第一版边界

- 网页 / PWA 显示明确的原生安装版提示，不提供假的跨站内置浏览器。
- 主要覆盖网页触发的附件下载和组件支持的 Blob 下载。直接在线预览的 PDF / TXT、依赖专用 POST 请求的下载、网盘客户端跳转，仍需按网站适配。
- Android 提供已接收字节数；iOS 先显示不定进度，完成后进入入库状态，不伪造下载百分比。
- 下载时保持找书窗口打开。此版没有前台服务或 iOS 后台 URLSession，不承诺锁屏、关闭窗口或强制退出后继续传输，也不承诺任意网站的断点续传。
- 200 MB 是入库限制；安卓普通 HTTP 下载也限制传输大小，iOS 已知长度会提前拒绝，未知长度和 Blob 路径在完成后还会检查。失败入库保留缓存供重试，操作系统仍可能回收临时文件。
- 没有服务器代下载、自动绕过登录/验证、代理服务、DRM 处理或 MOBI/AZW3 转换。
