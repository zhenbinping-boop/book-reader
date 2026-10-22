# book-reader 当前交接说明

更新于 2026-10-22。当前功能以 README.md 和实际代码为准；设计规范以 DESIGN.md 为准；本轮审查与后续建议见 CODE_REVIEW.md。

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
