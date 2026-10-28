# book-reader 当前交接说明

## 芸窗阅读更新（2026-10-28）

本版更名「芸窗」，版本为 0.3.0-alpha.3 / 30003；保留应用 ID、数据库、备份格式及 Android 固定签名约定。TXT、EPUB、PDF 增加回读窗，可从当前位置、目录、书签、笔记和搜索结果回看；关闭时不改变正文进度，选择「读这里」才跳转。TXT / EPUB 竖屏滚动在已到章末后再次上滑可进入下一章。新增两幅阅读背景和四款古风书皮，旧书原有封面不自动改变。生成图及提示词见 `docs/READER_ART.md`。

本地已通过 65 项单元测试、回读窗专项、移动验收、网页及原生网页资源构建和两端 Capacitor 同步；完整浏览器回归和 GitHub Android 构建结果以实际运行记录为准。合成触摸及资源同步不能替代 Android / iOS 真机验收。

以下旧记录按发生时间保留，其中版本、品牌与发布状态可能已过时。

更新于 2026-10-26。当前功能以 README.md 和实际代码为准；设计规范以 DESIGN.md 为准；本轮审查与后续建议见 CODE_REVIEW.md。

## 栖读品牌与移动图标（2026-10-26）

用户要求修复文字印章、重新命名并用图像生成工具制作手机图标；明确否定通用立体书本方案。当前采用「栖读」，图标是暖宣纸上的朱砂藏书印，线装书与屋檐合形。源图、提示词、生成器与规格见 `docs/BRAND.md`。

已更新网页名称、PWA 图标、Apple touch、安卓五档密度/自适应/主题图标、iOS AppIcon 与启动画面；文字印章改为独立字符上下排版，修复溢出。版本 `0.3.0-alpha.2` / `30002`，应用 ID、数据库、备份格式和固定签名约定不变。

本地验证：65/65 单元测试、`dev-ink.html` 原有流程验收、10 组屏宽/明暗布局检查、网页与原生网页资源构建、两端 Capacitor 同步通过。验证了 iOS 图标 1024px RGB、1x/2x/3x 启动图尺寸和安卓前景安全圆；本轮没有生成新 APK/IPA，没有将同步视为原生编译。网页当前可预览，手机桌面图标需安装后续更新包生效。两个用户原有的 `github-tutorial*.html` 未修改。

图标重新制作使用 `npm run icons`，或旧入口 `python tools/make_icons.py`；开发依赖 sharp 固定到 `0.35.5`，只用于制作资源，不进入 App 运行时。旧图标生成算法已替换，避免再次覆盖品牌资源。

## 内置寻书扩展（2026-10-24）

用户明确要求在手机安装版内浏览书源并下载入库，新增 `#/discover` 和本地下载回执；这项授权扩展了下方旧的“不做在线书城”范围。原有书籍解析、备份、笔记与进度保持本地处理。

实现、依赖补丁、iOS 原生工程、构建与验收边界见 `docs/BOOK_BROWSER.md`。原生组件固定到 `@capgo/capacitor-inappbrowser@8.26.1`，每次安装/构建自动应用可重复补丁。下载回执模拟验收已覆盖真实三格式解析和入库，但不能替代 Android / iPhone 原生网络与真机测试。

本地最终验证：65 / 65 项单元测试、18 / 18 个浏览器验收页、网页构建、原生网页资源构建与两端 Capacitor 同步通过。GitHub 连接异常，尚未推送或创建 PR；没有新的手机安装包，原生编译和真机下载仍待验证。继续时先恢复仓库连接，再在功能分支构建与验收，不要将资源同步成功当成 APK / iOS 编译成功。

以下保留此前交接记录；其版本号和历史测试数量不代表本次扩展的最终验收结果。

## 当前状态

纯前端 React + Vite + IndexedDB + PWA 阅读器，已支持 PDF / TXT / EPUB。
三种格式都有阅读模式切换、续读、书签、划词高亮、目录与搜索；支持整库备份 / 恢复与 Markdown 笔记导出。
本轮从 `a8b40b4` 拉取，在本地 `codex/review-and-reliability` 分支完成修复；随后接入 Android Alpha，提交和构建结果以仓库为准。

## 运行与验证

```bash
# Node >= 22.13.0
npm ci
npm run dev
npm run build

# 先保持开发服务器运行；需要 Python 3 和 Chrome / Chromium / Edge
npm test
npm run test:acceptance
```

启动 / 构建会自动准备中文 PDF 资源，浏览器自动回归不再依赖 D 盘路径。
当前验证：27 / 27 项逻辑单元测试、16 / 16 个自动回归页通过，生产构建断网首次导入并阅读三种格式通过；依赖审计为 0 项已知漏洞。
合成触摸测试不能替代 Android / iOS 真机验证，大型真实书库尚未做完整压力测试。

## 本轮重要修复

- PDF `popover` 声明前访问导致白屏。
- App 路由对象依赖造成反复查库，返回书架不刷新数据。
- 浮层关闭后快速重开，被迟到的 history.back 事件误关。
- EPUB 图片段丢失导致搜索索引偏移与正文不同。
- 导入 / 进度 / 接回文件 / 备份恢复的事务一致性；备份作者和占位进度合并。
- Windows 专用依赖破坏跨平台安装；启动 / 构建自动复制资源。
- 阅读器按需加载；PWA 预缓存 PDF worker、CMap、字体。

## 保留的架构约束

- 默认本地处理，无账号、无后端；不做在线书城、社交或阅读数据上报。
- 核心格式为 PDF / TXT / EPUB；不做 DRM 破解或 MOBI / AZW3。
- 设备外观偏好放 localStorage，书目与可迁移阅读数据放 IndexedDB。
- UI 跟随系统外观，阅读区主题由用户显式选择。
- PDF 资源释放继续通过 loadingTask.destroy()，保持当前 worker / TextLayer 接口。
- 正文、书签、笔记、搜索必须使用一致的位置模型，避免只因重排就更改持久化坐标。

## 建议下一步

1. 完成 Android / iPhone 真机发布检查，并把现有回归接入 CI。
2. 书架搜索、最近阅读与阅读状态。
3. 笔记批注编辑与跨书检索。
4. 逐步抽出 TXT / EPUB 共用的进度和布局机制；补 ZIP 边界 / 解压预算与大文件测试。

具体取舍、验证局限与路线图见 CODE_REVIEW.md。

## 移动专项修复（同日后续）

- 三格式共用 `useReaderGesture`，滚动不再手势自动跨章。
- 三格式共用 `useProgressCheckpoint`；TXT / EPUB 保存段内 / 跨栏字符，PDF 保存页内比例。
- 触屏选区使用底部操作栏，无全屏遮罩；创建高亮时读取最终选区。
- 新增 `npm test`（逻辑单测）、`npm run test:mobile`（专项）、`npm run test:acceptance`（自动起服务器全套）。
- 已配置 `.github/workflows/verify.yml`；新增 Android APK 构建、lint、签名校验和离线资源检查，远端执行结果以 Actions 为准。
- 已接入 Capacitor Android 工程和 CI 构建；真实 Android 系统选区和菜单仍需在测试包验收。
- 当前完整记录与真机清单见 MOBILE_FIXES.md。


### Android Alpha 交接

详见 README 的 Android Alpha 安装包章节。`versionName=0.2.0-alpha.1`，`versionCode=20001`；后续 APK 应递增 versionCode，并沿用 Actions Secret 内的固定测试签名。不要把 token、keystore、本地 SDK 路径或构建目录提交进仓库。原生适配新增 6 项验收，单元测试总数为 33。
