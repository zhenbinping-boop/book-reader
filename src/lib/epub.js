/**
 * EPUB 结构解析：container.xml → OPF → manifest / spine / 目录 / 封面。
 *
 * 纯结构层，**不碰渲染**（渲染在 epubDom.js，阅读器在 EpubReader.jsx）。
 * 只用 DOMParser 和 zip.js，不引第三方 EPUB 库 —— 要解析的实际上只有两个 XML
 * 加上一份 XHTML，比引一个库再跟它的兼容性差异打交道更划算。
 *
 * 目录有两套并存：EPUB3 的 `nav` 文档（XHTML）与 EPUB2 的 NCX。优先 nav，
 * 回退 NCX，最后回退「按 spine 顺序 + 正文里的第一个标题」。
 */

import { openZip, resolveZipPath, dirOf } from './zip'

/** Dublin Core 命名空间 */
const DC = 'http://purl.org/dc/elements/1.1/'

/**
 * 解析 XML。EPUB 里的 XHTML/OPF/NCX 按规范都是良构 XML，优先按 XML 解
 * （保留命名空间，`dc:title` 能按 localName 认出来）；解不动时退回 HTML
 * 解析器 —— 破损的电子书比想象中多，能读总比报错强。
 */
export function parseXml(str) {
  const s = String(str ?? '').replace(/^\uFEFF/, '')
  const parser = new DOMParser()
  try {
    const doc = parser.parseFromString(s, 'application/xhtml+xml')
    if (!doc.getElementsByTagName('parsererror').length) return doc
  } catch {
    /* 落到 HTML 解析 */
  }
  return parser.parseFromString(s, 'text/html')
}

/** 取出所有 localName 匹配的元素（跨命名空间，`dc:title` / `title` 都能命中） */
function localEls(root, local) {
  if (!root) return []
  const want = String(local).toLowerCase()
  const out = []
  for (const el of root.getElementsByTagName('*')) {
    if (localNameOf(el) === want) out.push(el)
  }
  return out
}

function localNameOf(el) {
  const n = (el.localName || el.tagName || '').toLowerCase()
  const i = n.indexOf(':')
  return i < 0 ? n : n.slice(i + 1)
}

/** 直接子元素中 localName 匹配的（NCX 的 navPoint 嵌套必须按直接子节点走） */
function kids(el, local) {
  if (!el?.children) return []
  const want = String(local).toLowerCase()
  return [...el.children].filter((c) => localNameOf(c) === want)
}

/**
 * 读属性。带命名空间前缀的属性（`epub:type`）在 XML 解析下 `getAttribute`
 * 可能取不到，只能按 localName 扫一遍。
 */
function attr(el, name) {
  if (!el?.attributes) return null
  if (el.hasAttribute?.(name)) return el.getAttribute(name)
  const local = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name
  for (const a of el.attributes) {
    if ((a.localName || a.name) === local) return a.value
  }
  return null
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/* ---------------- OPF ---------------- */

function readMetadata(opf, fallbackTitle) {
  const pick = (local) => {
    for (const el of localEls(opf, local)) {
      const t = clean(el.textContent)
      if (t) return t
    }
    return ''
  }
  // 优先带 Dublin Core 命名空间的，其次任何同名元素（HTML 模式解析时命名空间会丢）
  const titled = localEls(opf, 'title').filter((el) => el.namespaceURI === DC)
  const title = clean(titled[0]?.textContent) || pick('title') || fallbackTitle
  const creators = localEls(opf, 'creator').filter((el) => el.namespaceURI === DC)
  const author = clean(creators[0]?.textContent) || pick('creator')
  return { title, author }
}

function pickCoverPath(opf, manifest) {
  // EPUB3：properties 里带 cover-image
  for (const item of manifest.values()) {
    if (/(^|\s)cover-image(\s|$)/.test(item.properties)) return item
  }
  // EPUB2：<meta name="cover" content="封面 item 的 id" />
  for (const el of localEls(opf, 'meta')) {
    if (clean(attr(el, 'name')).toLowerCase() !== 'cover') continue
    const ref = manifest.get(clean(attr(el, 'content')))
    if (ref) return ref
  }
  // 兜底：id 或文件名里带 cover 的图片
  for (const item of manifest.values()) {
    if (!/^image\//.test(item.mediaType)) continue
    if (/cover/i.test(item.id) || /cover\.(jpe?g|png|gif|webp|svg)$/i.test(item.path)) return item
  }
  return null
}

/* ---------------- 目录 ---------------- */

const isList = (el) => localNameOf(el) === 'ol' || localNameOf(el) === 'ul'

/** 把 nav 里的 ol/li 递归拍成 { title, path, fragment, children } */
function navList(listEl, base) {
  const out = []
  for (const li of kids(listEl, 'li')) {
    const link = [...li.children].find((c) => ['a', 'span'].includes(localNameOf(c)))
    const title = clean(link?.textContent)
    const hrefRaw = link ? attr(link, 'href') : null
    const sub = [...li.children].find(isList)
    const resolved = hrefRaw ? resolveZipPath(base, hrefRaw) : null
    const node = {
      title,
      path: resolved?.path ?? null,
      fragment: resolved?.fragment ?? '',
      children: sub ? navList(sub, base) : [],
    }
    if (node.title || node.path || node.children.length) out.push(node)
  }
  return out
}

/** 同一套形状，从 NCX 的 navMap 里读 */
function ncxList(parent, base) {
  const out = []
  for (const np of kids(parent, 'navPoint')) {
    const label = kids(np, 'navLabel')[0]
    const title = clean(kids(label, 'text')[0]?.textContent)
    const src = attr(kids(np, 'content')[0], 'src') || ''
    const resolved = src ? resolveZipPath(base, src) : null
    const node = {
      title,
      path: resolved?.path ?? null,
      fragment: resolved?.fragment ?? '',
      children: ncxList(np, base),
    }
    if (node.title || node.path || node.children.length) out.push(node)
  }
  return out
}

async function readTocNodes(zip, manifest, tocId) {
  // 1) EPUB3 nav
  for (const item of manifest.values()) {
    if (!/(^|\s)nav(\s|$)/.test(item.properties)) continue
    const txt = await zip.text(item.path)
    if (!txt) continue
    const doc = parseXml(txt)
    const navs = localEls(doc, 'nav')
    const nav = navs.find((n) => /toc/.test(clean(attr(n, 'type')).toLowerCase())) || navs[0]
    if (!nav) continue
    const list = isList(nav) ? nav : [...nav.querySelectorAll('*')].find(isList)
    if (!list) continue
    const nodes = navList(list, dirOf(item.path))
    if (nodes.length) return nodes
  }

  // 2) EPUB2 NCX
  const ncx =
    (tocId && manifest.get(tocId)) ||
    [...manifest.values()].find((i) => /dtbncx/.test(i.mediaType))
  if (ncx) {
    const txt = await zip.text(ncx.path)
    if (txt) {
      const doc = parseXml(txt)
      const map = localEls(doc, 'navMap')[0]
      if (map) {
        const nodes = ncxList(map, dirOf(ncx.path))
        if (nodes.length) return nodes
      }
    }
  }
  return []
}

/** 把解析出来的目录树对到章序号上，生成 SidePanel 要的形状 */
function toOutline(nodes, pathToChapter, counter = { n: 0 }) {
  const out = []
  for (const node of nodes) {
    const key = `t${counter.n++}`
    const idx = node.path != null && pathToChapter.has(node.path) ? pathToChapter.get(node.path) : null
    out.push({
      key,
      title: node.title || (idx != null ? `第 ${idx + 1} 节` : ''),
      pageIndex: idx,
      // 目录条目指向文件内部的锚点（'ch1.xhtml#part2'）时带上，阅读器按 id → 偏移解析
      fragment: node.fragment || '',
      children: toOutline(node.children, pathToChapter, counter),
    })
  }
  return out
}

/** 把嵌套的目录树摊平（用于「这一章在目录里叫什么」） */
function flatten(nodes, out = []) {
  for (const n of nodes) {
    out.push(n)
    if (n.children?.length) flatten(n.children, out)
  }
  return out
}

/* ---------------- 入口 ---------------- */

/**
 * 打开一个 EPUB。不读取正文内容（按需按章读，见 readChapter）。
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {Promise<{ zip, title, author, chapters, outline, coverPath, coverType }>}
 *   chapters: [{ index, id, path, title }]
 */
export async function openEpub(buffer) {
  const zip = openZip(buffer)

  const containerText = await zip.text('META-INF/container.xml')
  if (!containerText) throw new Error('这不是 EPUB 文件（缺少 META-INF/container.xml）')
  const container = parseXml(containerText)
  const rootfile = localEls(container, 'rootfile')[0]
  const opfPath = clean(attr(rootfile, 'full-path'))
  if (!opfPath) throw new Error('EPUB 的 container.xml 里没有指向 OPF 的路径')

  const opfText = await zip.text(opfPath)
  if (!opfText) throw new Error(`EPUB 缺少 OPF 文件：${opfPath}`)
  const opf = parseXml(opfText)
  const base = dirOf(opfPath)

  // manifest：id → 条目
  const manifest = new Map()
  for (const el of localEls(opf, 'item')) {
    const id = clean(attr(el, 'id'))
    const href = clean(attr(el, 'href'))
    if (!id || !href) continue
    const { path } = resolveZipPath(base, href)
    manifest.set(id, {
      id,
      href,
      path,
      mediaType: clean(attr(el, 'media-type')).toLowerCase(),
      properties: clean(attr(el, 'properties')),
    })
  }

  // spine：阅读顺序
  const spineEl = localEls(opf, 'spine')[0]
  const spineRefs = localEls(spineEl ?? opf, 'itemref')
    .map((el) => clean(attr(el, 'idref')))
    .filter(Boolean)

  const chapters = []
  for (const idref of spineRefs) {
    const item = manifest.get(idref)
    if (!item) continue
    // 清单里列了但包里没有的条目（制作工具常见疏漏）直接跳过，别让整本书打不开
    if (!zip.has(item.path)) continue
    chapters.push({
      index: chapters.length,
      id: item.id,
      path: item.path,
      mediaType: item.mediaType,
      title: '',
    })
  }
  if (!chapters.length) throw new Error('这个 EPUB 里找不到可阅读的正文')

  const pathToChapter = new Map(chapters.map((c) => [c.path, c.index]))
  const tocNodes = await readTocNodes(zip, manifest, clean(attr(spineEl, 'toc')))
  const outline = toOutline(tocNodes, pathToChapter)

  // 章标题：目录里指向该章的第一条（更贴近读者认知），没命中就留空由正文标题兜底
  for (const node of flatten(outline)) {
    if (node.pageIndex == null || !node.title) continue
    const ch = chapters[node.pageIndex]
    if (ch && !ch.title) ch.title = node.title
  }

  const meta = readMetadata(opf, base.replace(/\.opf$/i, '').replace(/.*\//, ''))
  const cover = pickCoverPath(opf, manifest)

  return {
    zip,
    title: meta.title,
    author: meta.author,
    chapters,
    outline,
    coverPath: cover?.path ?? null,
    coverType: cover?.mediaType ?? '',
  }
}

/** 读一章的 XHTML 源文本 */
export async function readChapter(epub, index) {
  const ch = epub.chapters[index]
  if (!ch) return null
  return epub.zip.text(ch.path)
}

/** 读压缩包里的一个资源，返回 Blob（图片用），找不到返回 null */
export async function readResource(epub, path) {
  const bytes = await epub.zip.read(path)
  if (!bytes || !bytes.length) return null
  return new Blob([bytes])
}
