# book-reader 上下文快照

> 供新会话快速接手。详细规范见 `DESIGN.md`（UI 唯一事实来源）；
> 完整项目笔记见 `.workbuddy/memory/MEMORY.md`。

## 1. 这是什么

浏览器端电子书阅读器，纯前端 + PWA，可装到手机主屏离线阅读。
当前**只做了 PDF**，TXT / EPUB 未开始。

## 2. 已定的架构决策（不要再推翻）

| 决策 | 内容 |
|---|---|
| 后端 | **无**。解析与存储全在浏览器，文件不出本机，部署为静态站 |
| 账号 | **不做**。但进度 / 笔记 / 元数据要抽象成接口层，V2 接同步时不用重写 |
| 手机形态 | **PWA 装主屏**；「局域网扫码传书」是 V1/V2 加分项，非主打 |
| 格式范围 | V0 = TXT + PDF + EPUB；DOCX 后置；**MOBI / AZW3 明确不做**（DRM 无解） |
| 色彩架构 | UI 层跟随系统亮暗；**阅读区四套主题由用户显式选**，不受系统约束 |

## 3. 技术栈与实际版本

Vite 7.3.6 + React 19.3.0（**未装** `@vitejs/plugin-react`，靠 esbuild 转 JSX）
/ pdfjs-dist 6.3.289 / Dexie 4.x / vite-plugin-pwa 1.3.0

## 4. 已完成（均经真实浏览器验证，非推断）

- **导入 → IndexedDB**：封面（dataURL）、逐页尺寸、目录三级解析、进度记忆
- **阅读器**：连续滚动 / 单页双模式、缩放、**懒渲染 + 虚拟窗口**（6 页只渲染 3 个 canvas）
- **PDF 文本层**：文字可选中（`TextLayer` 类 + `span[data-idx]`）
- **划词高亮**：四色，位置模型 `{page, start:{item,offset}, end:{item,offset}}`，存 `db.highlights`
- **全文搜索**：按页提取 → `db.textIndex` 持久化 → 侧栏出结果 → 点击跳页并标出命中框
- **侧栏三标签**：目录 / 笔记 / 搜索
- **设计基线**：`styles.css` token 层 + 四套主题（paper/sepia/night/oled，正文对比度全 AAA）

## 5. 文件地图

```
src/
  App.jsx                    hash 路由：书架 / 阅读器
  db.js                      Dexie v2: books/blobs/progress/bookmarks/highlights/textIndex
  styles.css                 设计 token + 全部样式（改前先读 DESIGN.md）
  lib/importer.js            导入 → IndexedDB
  lib/prefs.js               外观偏好（localStorage，设备级，不进 IndexedDB）
  lib/pdfText.js             文本位置模型 / 搜索归一化（纯函数）
  lib/selection.js           DOM 选区 ↔ 文本位置换算
  pdf/pdfWorker.js           worker + CMap 路径
  pdf/pdfService.js          openPdf/renderCover/getPageSizes/buildOutline/obtainPage/extractText
  components/Shelf.jsx       书架
  components/PdfReader.jsx   阅读器外壳（编排：进度/缩放/划词/搜索）
  components/PdfPage.jsx     单页三层：canvas + textLayer + marks-layer
  components/SidePanel.jsx   侧栏三标签
  components/SelectionPopover.jsx  划词气泡
tools/                       make_icons / copy_pdf_assets / make_sample_pdf
                             verify_pdf.mjs / browser_smoke.py
samples/sample.pdf           6 页带三级目录的测试文件
dev-smoke.html / dev-tokens.html / dev-text.html   三个回归测试页（不进产物）
```

## 6. 必守的坑（改代码前扫一遍）

**pdf.js v6 专有**
1. `PDFDocumentProxy` **没有 `destroy()`** → 走 `getDocument()` 的 `loadingTask.destroy()`。
   所以 `openPdf()` 返回 `{ doc, destroy }`，别改回直接返回 doc。
2. worker 路径 = `pdfjs-dist/build/pdf.worker.min.mjs?url`（不是 `.js`，也不是不带 `.min`）
3. `page.render()` 传 `canvas`（`canvasContext` 只是向后兼容）
4. 中文 PDF 必须配 `cMapUrl` + `standardFontDataUrl`（`tools/copy_pdf_assets.py` 复制到 `public/`，171 文件）
5. 文本层是 **`TextLayer` 类**，不是 `renderTextLayer()` 函数
6. 缩放 CSS 变量是 **`--total-scale-factor`**（不是 `--scale-factor`），
   必须在 `new TextLayer()` **之前**设到容器上
7. `textDivs` ↔ `textContentItemsStr` 一一对应，`<br>` 是**兄弟**节点不在 span 内；
   用 `dataset.idx` 建映射，别用 `querySelectorAll('span')`
8. 三层顺序：canvas(auto) → 占位层(1) → `.textLayer`(2) → `.marks-layer`(3, `pointer-events:none`)
9. `itemsToText` 必须过滤非字符串 `str`（tagged PDF 的 markedContent 项），
   否则索引与 DOM 对不上 → 搜索结果标不到页上

**构建 / 工程**
10. 不装 plugin-react 时 Vite 走 classic JSX → 白屏报 `React is not defined`。
    已在 `vite.config.js` 设 `esbuild: { jsx: 'automatic' }`。
11. `vite build` 输出到 `dist/` **会失败**（清空时 171 个 cmaps 触发 safe-delete 批量守卫）。
    绕法：`--outDir dist-t2`，或让用户先手动删 `dist/`。
12. 同一份 ArrayBuffer 不能复用（pdf.js 会 transfer），每次打开重新读 blob。

**工具机制**
13. **同一条消息里对同一文件发两个 Edit 会丢掉一个**（后写者覆盖先写者，且都报成功）。
    同一文件多次改动要分消息，或合并成一个 Edit。

## 7. 环境限制（本机）

- `dist/` `dist-verify/` `dist-t2/` `.tmp/` 都**删不掉**（safe-delete 拦截），只能请用户手动清理
- agent 后台起的 dev server **会随会话结束被回收**
  → 用户要随时能打开，用 `D:\book-reader\start-dev.cmd` 双击，或部署 `dist/` 成静态站
- 常用命令：
  ```
  node D:/book-reader/node_modules/vite/bin/vite.js dev   D:/book-reader
  node D:/book-reader/node_modules/vite/bin/vite.js build D:/book-reader --outDir dist-t2
  python D:/book-reader/tools/browser_smoke.py http://localhost:5173/dev-text.html
  ```

## 8. 下一步候选（按性价比）

| 优先 | 事项 | 理由 |
|---|---|---|
| 1 | **完整外观设置面板**（字号/行高/段距/页边距滑杆） | 现在只有主题循环切换，尺寸全硬编码 |
| 2 | **笔记导出 Markdown** | 用户最怕划了一堆线拿不走 |
| 3 | **位置后退栈** | 跳章后能回原位，Kindle/微信读书都有，自制阅读器常漏 |
| 4 | **TXT 支持** | 接入格式，验证章节模型抽象是否站得住 |
| 5 | 工具栏重组（已 8 个控件，接近手机一行上限） | 窄屏已靠隐藏书名兜底 |

**明确不做**：账号 / 社交 / 在线书城 / DRM 破解 / MOBI / 阅读数据上报
（一旦承诺「文件不上传」，连埋点都要谨慎）
