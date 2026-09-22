# book-reader

浏览器端电子书阅读器。**纯前端、无后端、无账号** —— 书籍解析与存储全部在浏览器内完成，文件不出本机，可直接部署为静态站点，支持装到手机主屏当 App 使用。

当前版本聚焦 **PDF**，TXT / EPUB 尚未实现。

## 功能

**阅读**

- 连续滚动 / 单页 双模式
- 按页懒渲染 + 虚拟窗口（长文档只渲染视口附近的页，避免移动端内存崩溃）
- 目录三级跳转、缩放、点击中央唤出工具栏
- 每本书独立记住「页码 + 模式 + 缩放」，断点续读
- 四套阅读主题：`paper` 暖纸 / `sepia` 护眼 / `night` 暗纸 / `oled` 纯黑
  —— 正文对比度均达 WCAG AAA

**标注与检索**

- PDF 文本层，文字可拖选
- 划词高亮，四色可选，可改色 / 删除，笔记列表按书聚合
- 书内全文搜索：按页建立文本索引并持久化，结果可跳页并在页面上标出命中位置

**导入与存储**

- 拖拽或选择文件导入，自动提取首页作为封面
- 元数据、文件二进制、进度、高亮、文本索引全部存 IndexedDB
- 外观偏好存 localStorage（设备级偏好，不参与将来的云同步）

## 技术栈

| 环节 | 方案 |
|---|---|
| 构建 | Vite 7 + React 19（纯静态，未用 SSR 框架） |
| PDF | `pdfjs-dist` 6.x |
| 存储 | `Dexie`（IndexedDB） |
| PWA | `vite-plugin-pwa` |
| 样式 | 原生 CSS + 分层 design token（见 `DESIGN.md`） |

无 UI 组件库、无状态管理库、无 CSS 框架。

## 本地运行

```bash
npm install

# 从 node_modules 复制 pdf.js 的中文 CMap 与标准字体到 public/
# 这些文件未纳入版本控制，首次 clone 后必须执行，否则中文 PDF 会缺字
python tools/copy_pdf_assets.py

npm run dev
```

打开 `http://localhost:5173`，导入 `samples/sample.pdf` 试用（6 页，带三级目录，含可搜索的英文正文）。

### 构建

```bash
npm run build
```

> 若构建报「删除 dist 失败」，先手动删除 `dist/` 目录再执行。
> 清空 `dist/` 时其中 170+ 个 CMap 文件可能触发部分环境的安全删除守卫。

构建产物是纯静态文件，可直接托管在 GitHub Pages / Cloudflare Pages / 对象存储上。

## 项目结构

```
src/
  App.jsx                    hash 路由：书架 / 阅读器
  db.js                      Dexie schema（v2）：books / blobs / progress
                             / bookmarks / highlights / textIndex
  styles.css                 设计 token + 全部样式
  lib/
    importer.js              导入文件 → IndexedDB
    prefs.js                 外观偏好（localStorage）
    pdfText.js               文本位置模型与搜索归一化（纯函数）
    selection.js             DOM 选区 ↔ 文本位置换算
  pdf/
    pdfWorker.js             pdf.js worker 与 CMap 配置
    pdfService.js            打开 / 封面 / 页尺寸 / 目录 / 页缓存 / 文本提取
  components/
    Shelf.jsx                书架
    PdfReader.jsx            阅读器外壳（进度、缩放、划词、搜索的编排）
    PdfPage.jsx              单页：canvas + 文本层 + 标注层
    SidePanel.jsx            侧栏三标签：目录 / 笔记 / 搜索
    SelectionPopover.jsx     划词气泡
tools/                       图标生成、CMap 复制、示例 PDF、验证脚本
samples/sample.pdf           测试用 PDF
dev-*.html                   回归测试页（仅供开发，不参与构建）
```

`DESIGN.md` 是 UI 的唯一事实来源：色彩系统、字体系统、排版节奏、可达性要求，以及**偏离记录**（哪些通用建议没有采纳及原因）。改样式前请先读它。

## 已知限制

- **扫描版 PDF 没有文本层**，搜索与高亮不可用
- 划词高亮的位置模型以**页**为单位，跨页拖选会被裁剪到起始页
- 全文搜索为单关键词精确匹配（去空白归一化），无正则、无模糊、无跨页短语
- 书架的拖拽导入仅在桌面端有效，移动端使用文件选择
- **iOS Safari 会清理长期未访问的 IndexedDB**（约 7 天无交互），目前尚未提供导出备份

## 明确不做

- 账号系统与社交功能
- 在线书城
- DRM 破解、MOBI / AZW3 格式
- 阅读数据上报（既然承诺「文件不上传」，连埋点也不做）
