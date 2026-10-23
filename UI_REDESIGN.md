# 古风书房 UI 改版

2026-10-23。基于用户确认的古风四屏概念图，落实为真实 React 页面。
本次改版独立于既有 `v0.2.0-alpha.1` 发布包；旧下载包不包含本次界面更新。

## 页面与功能

| 页面 | 设计与真实功能 |
| --- | --- |
| 书架 | 宣纸、水墨山景、朱砂印章；继续阅读卡片；两列手机书架；桌面侧栏；搜索书名、作者、分组；全部 / 在读 / 待读 / 已读筛选 |
| 整理藏书 | 编辑书名、作者、分组、阅读状态；选择四款线装书封；EPUB 默认保留原封面；删除入口收进整理弹窗 |
| 阅读 | 三格式共用顶栏、进度与底部工具；保留目录、书签、搜索、外观、切换版式、缩放与历史位置返回；正文采用单色纸底 |
| 笔记 | 原文、个人感想、标签、出处；直接从划词工具进入编辑；全局笔记搜索及图书 / 标签筛选；跳回原文；导出 Markdown |
| 设置 | PDF / TXT / EPUB 导入，主题、字号、行距、段距、边距、阅读方式，常亮、沉浸及备份恢复入口 |

空书架没有预置演示藏书。预览截图中的图书为隔离浏览器里的测试数据。
书名、作者、正文与笔记全部为可交互的 HTML 文本。

## 设计实现

- `src/ink.css` 提供新主题，旧 CSS 保留在 `@layer legacy`，减少对三种格式排版的侵入。
- `ReaderChrome` 统一 PDF / TXT / EPUB 工具栏；阅读正文不播放装饰动画。
- Motion 提供书卡渐入、搜索展开、抽屉进入；尊重 `prefers-reduced-motion`。
- 弹窗与阅读侧栏限制键盘焦点，Escape 关闭后恢复原焦点；安卓返回逻辑覆盖笔记与设置。
- `prepareReaderFonts` 先请求本地宋体再等待字体就绪，避免首次排版在字体切换后偏移。
- 系统界面暗色和用户阅读主题独立；暖纸、护眼、夜间、纯黑均保留。
- 书籍资料及笔记扩展字段随完整备份迁移；同位置笔记按更新时间合并，旧备份不覆盖新感想。

## 素材与许可证

| 资源 | 来源与授权 |
| --- | --- |
| `public/art/ink-landscape.webp` | 本次 UI 任务生成的水墨山景；离线内置 |
| `public/art/bound-covers.webp` | 本次 UI 任务生成的四款线装书封底图；真实书名叠加显示 |
| `public/fonts/reader-song.woff2` | Noto Serif CJK SC Regular 子集，SIL Open Font License 1.1；许可全文见 `public/fonts/OFL.txt`，上游 [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) |
| Motion | MIT；[motiondivision/motion](https://github.com/motiondivision/motion)，许可位于依赖包 `LICENSE.md` |
| Lucide React | ISC；[lucide-icons/lucide](https://github.com/lucide-icons/lucide)，许可位于依赖包 `LICENSE` |

美术约 720KB，宋体约 3.1MB。生产 PWA 预缓存美术、字体和 PDF 资源；Android 构建直接内置，不依赖字体 CDN 或远程图片。
`tools/subset_reader_font.py` 可从上游原字体重新生成子集；常规构建不需要下载字体。

## 验收

本轮结果：**45/45 单元测试、17/17 浏览器验收页通过**。根路径与 `/book-reader/` 子路径的生产离线阅读通过；Android 资源同步完成。

```bash
npm run test:unit
npm run test:acceptance
npm run build
npm run android:sync
```

- 45 项逻辑单元测试覆盖手势、位置检查点、PDF 页内恢复、原生返回 / 导出、书架整理、标签与备份笔记合并、首次字体加载顺序及失败回退。
- `dev-ink.html` 覆盖真实批量导入、书籍资料编辑、弹窗历史清理、筛选、离线字体、划词添加感想、标签去重、全局笔记检索 / 编辑 / 原文跳转、设置持久化及完整备份恢复。
- 其余回归页继续覆盖三格式目录、全文搜索、书签、续读、选区与误翻页防护。版式切换测试以实际可见字符为准，允许同一长段跨多栏。
- 本地视觉检查覆盖 390px 手机、1440px 桌面、320px 窄屏、暗色 / 减少动态效果及 500px 高度弹窗滚动。
- 生产离线实测：断网刷新、首次导入并打开 PDF / TXT / EPUB；预缓存包含山景、书封与宋体。
- Android 安装包由 CI 构建并发布为 `v0.2.0-alpha.2`；使用独立应用 ID `.ink` 和固定的古风版签名，可与旧版共存；校验实际版本号、启动入口及签名。旧版签名密钥未能找回，首次迁移通过完整备份完成。安卓系统选词菜单、真实选区手柄、软键盘与安装仍需真机验收。

## 网页发布

`Verify reader` 工作流在验收通过后上传已测试的站点构建，由独立 `pages` job 自动发布。仓库 Pages 使用 GitHub Actions 来源；`github-pages` 环境允许 `main` 部署。网页不会再依赖手工更新 `gh-pages` 分支，也不必等待 Android 编译。

## 实际界面

[手机书架](docs/ui/shelf-mobile.png) · [阅读页](docs/ui/reader-mobile.png) · [笔记面板](docs/ui/notes-mobile.png) · [设置页](docs/ui/settings-mobile.png)
