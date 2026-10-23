# book-reader

浏览器端电子书阅读器。**纯前端、无后端、无账号** —— 书籍解析与存储全部在浏览器内完成，文件不出本机，可直接部署为静态站点，支持装到手机主屏当 App 使用。

支持 **PDF / TXT / EPUB** 三种格式。

## 功能

**阅读**

- 三种格式统一体验：PDF 固定版式；TXT / EPUB 走同一套流式排版
- 两种翻页方式，三种格式都有：**翻页**（一次一屏）与**滚动**（竖向连续滑动），
  底部一键切换、按设备记住；来回切版式不会丢位置
- PDF 按页懒渲染 + 虚拟窗口（长文档只渲染视口附近的页，避免移动端内存崩溃）
- 目录跳转（EPUB 支持 EPUB3 nav 与 EPUB2 NCX 两套目录，含嵌套层级）
- 缩放（PDF 改渲染倍率；TXT / EPUB 改字号并吸附档位）、点击屏幕开关工具栏（任何状态都不翻页），翻页靠滑动 / 键盘 / 底栏「‹ ›」按钮
- 每本书独立记住「位置 + 模式 + 缩放」，断点续读
- 四套阅读主题：`paper` 暖纸 / `sepia` 护眼 / `night` 暗纸 / `oled` 纯黑
  —— 阅读区主题独立于系统界面配色
- 排版四项可调：字号 / 行距 / 段距 / 页边距

**古风书房**

- 宣纸底色、水墨山景、朱砂印章与四款线装书封；美术及宋体均为本地资源
- 手机底部导航、桌面侧边导航：书架 / 笔记 / 设置
- 继续阅读卡片；按书名、作者、分组搜索；在读 / 待读 / 已读筛选
- 整理藏书：编辑书名、作者、分组、阅读状态与书封样式
- Motion 书卡和面板动效，遵循系统「减少动态效果」设置

**标注与检索**

- PDF 文本层，文字可拖选；TXT / EPUB 直接划选
- 划词高亮，四色可选，可改色 / 删除，笔记列表按书聚合
- 摘录支持编辑个人感想与标签；全局笔记中心可搜索、按图书 / 标签筛选、跳回原文及导出 Markdown
- **书签**：一键把当前位置记下来（顶栏书签图标，或侧栏「书签」页），可跳回、可删除
  —— 记的是「这一页最上面那段文字」而非页码，所以换字号 / 旋屏之后依然指得准
- 书内全文搜索：按页 / 按章建立文本索引并持久化，结果可跳转并标出命中位置
- 位置后退栈（`↩` / `Alt+←`）：记录目录、笔记、搜索引起的跳转，翻页不入栈

**手机端**

- 阅读器内双指缩放、全屏沉浸、屏幕常亮（Screen Wake Lock）
- 手势与单指长按划词共存；全屏与沉浸分开实现（iPhone Safari 不支持元素全屏）

**导入与存储**

- 书架上的「＋ 添加图书」栏平时只占一行，点开才列出 PDF / TXT / EPUB 三种格式
- 拖拽或选择文件导入，自动提取封面（EPUB 读 OPF 里的封面图并压成缩略图）
- 按**文件内容指纹**（SHA-256）查重：重复导入同一文件不会多出一本
- 元数据、文件二进制、进度、高亮、书签、文本索引全部存 IndexedDB
- 外观偏好存 localStorage（设备级偏好，不参与将来的云同步）

**备份**

- 整库导出为 JSON（可选是否带上原文件），从头恢复
- 恢复时以内容指纹认书 —— 书 id 变了也能把笔记 / 书签 / 进度接回去
- 单本书的笔记导出为 Markdown（高亮 + 书签分两节，保留感想和标签）

## 技术栈

| 环节 | 方案 |
|---|---|
| 构建 | Vite 7 + React 19（纯静态，未用 SSR 框架） |
| PDF | `pdfjs-dist` 6.x |
| TXT | 自研编码探测与分章 |
| EPUB | **自研零依赖** ZIP（`DecompressionStream('deflate-raw')`）+ OPF / nav / NCX 解析 |
| 存储 | `Dexie`（IndexedDB） |
| PWA | `vite-plugin-pwa` |
| 样式 | 原生 CSS + 分层 design token（见 `DESIGN.md`） |
| 动效 / 图标 | Motion / Lucide React |

无 UI 组件库、无状态管理库、无 CSS 框架、无 JSZip。

## 本地运行

需要 **Node.js 22.13.0 或更新版本**。运行应用不需要 Python；浏览器回归工具需要 Python 3。

```bash
npm ci
npm run dev
```

启动和构建会自动把 pdf.js 的中文 CMap 与标准字体复制到 `public/`，无需手工准备。
本轮古风改版、素材授权及验收记录见 [UI_REDESIGN.md](UI_REDESIGN.md)；此前代码检查记录见 [CODE_REVIEW.md](CODE_REVIEW.md)。

打开 `http://localhost:5173`，导入 `samples/` 下的样例试用：

| 文件 | 说明 |
|---|---|
| `sample.pdf` | 6 页，带三级目录，含可搜索的英文正文 |
| `sample-utf8.txt` | UTF-8，5 章（前言 + 4 章） |
| `sample-gbk.txt` | 同样内容，GB18030 编码，用来验证编码探测 |
| `sample.epub` | EPUB3，nav + NCX 双目录，带封面图 |
| `sample-ncx.epub` | EPUB2，只有 NCX，封面走 `<meta name="cover">` |

### 构建

```bash
npm run build
```

构建产物是纯静态文件，可直接托管在 GitHub Pages / Cloudflare Pages / 对象存储上。
部署到子路径时用 `npm run build -- --base=/book-reader/`；根路径用默认值即可 —— manifest 与 `start_url` 都写了相对路径，两种都成立。

### 网页自动发布

推送到 `main` 后，GitHub Actions 先运行单元测试、浏览器验收及 `/book-reader/` 子路径生产构建，全部通过后自动部署到 GitHub Pages。
网页部署与 Android 构建分别依赖验收，网页无需等待 APK 编译。PR 和其他分支不会部署正式网页。

### 装到手机

产物上线后，用手机浏览器打开该网址：

- **Android / Chrome**：菜单里选「安装应用」或「添加到主屏幕」
- **iOS / Safari**：分享 → 「添加到主屏幕」

首次联网打开后，等待 Service Worker 完成离线资源缓存，再从主屏图标启动即可离线使用。PDF worker、中文 CMap 和标准字体也包含在离线缓存中。

## 项目结构

```
src/
  App.jsx                    hash 路由：书架 / 阅读器
  db.js                      Dexie schema：books / blobs / progress
                             / bookmarks / highlights / textIndex
  styles.css                 设计 token + 全部样式
  hooks/
    useHashRoute.js          #/ 与 #/read/:id
    useHistoryStack.js       位置后退栈（三种格式共用）
    usePinch.js              双指缩放
    useImmersive.js          全屏 + 沉浸 UI
    useWakeLock.js           屏幕常亮
  lib/
    importer.js              导入文件 → IndexedDB（按格式分派）
    backup.js                整库备份 / 恢复、笔记导 Markdown
    prefs.js                 外观偏好（localStorage），含档位吸附
    pdfText.js               PDF 文本位置模型与搜索归一化（纯函数）
    selection.js             DOM 选区 ↔ 文本位置换算（PDF）
    txtText.js               TXT 解码 / 分章 / 段落切分
    txtSel.js                TXT·EPUB 共用的分栏数学与选区换算（纯函数）
    zip.js                   零依赖 ZIP 读取器
    epub.js                  EPUB 结构解析（container / OPF / spine / 目录）
    epubDom.js               XHTML 展平成可排版段落 + 高亮回填
  pdf/
    pdfWorker.js             pdf.js worker 与 CMap 配置
    pdfService.js            打开 / 封面 / 页尺寸 / 目录 / 页缓存 / 文本提取
  components/
    Shelf.jsx                书架
    PdfReader.jsx            PDF 阅读器
    PdfPage.jsx              单页：canvas + 文本层 + 标注层
    TxtReader.jsx            TXT 阅读器（流式排版引擎）
    EpubReader.jsx           EPUB 阅读器（复用 TXT 的排版引擎）
    SidePanel.jsx            侧栏四标签：目录 / 书签 / 笔记 / 搜索
    BookmarkButton.jsx       顶栏书签开关（三种格式共用）
    SelectionPopover.jsx     划词气泡
    AppearancePanel.jsx      外观面板（主题 / 排版）
    DisplayMenu.jsx          显示设置（常亮 / 沉浸）
    BackupPanel.jsx          备份与恢复
tools/                       图标生成、CMap 复制、样例生成、部署脚本、无头浏览器测试
samples/                     测试用样例文件
dev-*.html                   回归测试页（仅供开发，不参与构建）
```

`DESIGN.md` 是 UI 的唯一事实来源：色彩系统、字体系统、排版节奏、可达性要求、三种格式各自的排版约定，以及**偏离记录**（哪些通用建议没有采纳及原因）。改样式前请先读它。

## 测试

测试不依赖额外框架：纯逻辑用 Node 内置 `node:test`，布局与数据流使用真实浏览器中的断言页面。

```bash
# 逻辑单元测试：手势判定、进度检查点、PDF 页内坐标
npm test

# 移动端核心验收：自动启动隔离测试服务器，执行后关闭
npm run test:mobile

# 全部浏览器回归，包括续读、笔记、备份、搜索、书签等
npm run test:acceptance

# 已有开发服务器时，也能手动单跑任一页
python tools/browser_smoke.py http://localhost:5173/dev-bookmark.html
```

浏览器验收需要 Python 3，以及 Chrome / Chromium / Edge。工具自动发现浏览器；找不到时用 `CHROME_BIN` 指定可执行文件。
每页使用独立临时 profile，不接触日常书库。出现断言失败、页面异常或未跑完时返回非零退出码。
`npm run test:acceptance -- --timeout 180` 可调整单页超时。
`dev-android.html` 是手动 CDP 调试页，不包含在自动套件中。

`.github/workflows/verify.yml` 已配置单元测试 → 浏览器验收 → 生产构建；推送后才会实际执行远端检查。
本轮移动问题修复与真机验收清单见 [MOBILE_FIXES.md](MOBILE_FIXES.md)。

| 页面 | 覆盖面 |
|---|---|
| `dev-mobile.html` | 双指缩放 / 沉浸 / 常亮（合成触摸事件） |
| `dev-mobile-acceptance.html` | 三格式续读、长段跨栏、页内位置、滑动取消 / 长按 / 双指、选区与高亮保存 |
| `dev-txt.html` | TXT 解码、分章、分栏、划词、排版面板 |
| `dev-epub.html` | ZIP / EPUB 结构 / XHTML 展平（解析层） |
| `dev-epub-reader.html` | EPUB 阅读器集成（分页、深链、图片重排、进度恢复） |
| `dev-bookmark.html` | 书签：数据层 / 备份去重 / 侧栏 / 三种格式阅读器 |
| `dev-flow.html` | 翻页 ↔ 竖向滚动两种版式、点击语义、实时百分比（TXT + EPUB） |
| `dev-progress.html` | 进度落盘 / 恢复（滚动模式、翻页模式、图片章、换章退出） |
| `dev-app.html` | App 级端到端（导入 → 书架 → 路由 → 阅读器 → 进度写回） |
| `dev-history.html` | 位置后退栈 |
| `dev-backup.html` | 备份导出 / 恢复 |
| `dev-text.html` | 文本索引与搜索归一化 |
| `dev-tokens.html` | 设计 token 与对比度 |
| `dev-smoke.html` | 冒烟 |
| `dev-storage.html` | 事务回滚、并发进度、备份校验 / 去重、作者恢复、路由与书架刷新 |
| `dev-backclose.html` | 快速关闭重开浮层、切换浮层、浏览器返回历史清理 |

## 已知限制

- **扫描版 PDF 没有文本层**，搜索与高亮不可用
- PDF 划词高亮的位置模型以**页**为单位，跨页拖选会被裁剪到起始页
- 全文搜索为单关键词精确匹配（去空白归一化），无正则、无模糊、无跨页短语
- 书架的拖拽导入仅在桌面端有效（移动端用文件选择）
- PDF 的**连续滚动模式**下方向键翻页无效，需切到单页模式
- 高亮矩形会接收指针事件，无法从高亮内部起拖（需要分层命中判定）
- EPUB 只支持 stored / deflate 压缩，不支持加密与 ZIP64
- 浏览器可能因存储压力或站点存储策略清理 IndexedDB；持久化存储申请不能替代备份，请定期导出重要笔记和书籍

## 明确不做

- 账号系统与社交功能
- 在线书城
- DRM 破解、MOBI / AZW3 格式
- 阅读数据上报（既然承诺「文件不上传」，连埋点也不做）


## Android Alpha 安装包

原生工程使用 Capacitor 8，应用 ID 为 `io.github.zhenbinpingboop.bookreader`。APK 内置网页、PDF worker、字体和 CMaps，无需联网即可导入和阅读。Android 10+，系统 WebView 140+；旧 WebView 会显示更新提示。

```bash
npm ci
npm run android:apk
```

本地构建需要 JDK 21、Android SDK 36 和 Build Tools 36.0.0，输出 `android/app/build/outputs/apk/debug/app-debug.apk`。也可在 GitHub Actions 的 **Verify reader** 工作流下载 `book-reader-android-alpha` 构建产物：只有单元测试、浏览器验收和网页构建通过后才会构建 APK，并检查签名和离线资源。

CI 使用仓库 Secret `ANDROID_DEBUG_KEYSTORE_BASE64` 中固定的 Alpha 测试签名，后续测试版保持同一签名并递增 `versionCode`，可覆盖安装。请保留该 Secret；本机自动生成的 debug 签名不一定相同。Alpha 不是商店正式签名版本，正式发布前需规划长期签名。APK 更新需要下载安装新包，网页部署不会自动替换已安装 APK 的代码。

首次安装 APK 时，浏览器/PWA 的本地书库不会自动迁入；先在原版导出包含书籍的完整备份，再到 APK 的备份面板恢复。APK 中的备份与 Markdown 导出通过系统分享面板保存或发送。卸载前请备份。
