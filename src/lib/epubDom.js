/**
 * EPUB 正文（XHTML）→ 可渲染的段落数组 + 高亮区间回填。
 *
 * 核心目标只有一个：**让 EPUB 复用 TXT 的位置模型**。
 * TXT 那边把一章切成若干「段」，段上挂 `data-seg`（序号）与 `data-start`
 * （章内字符偏移），于是 `lib/txtSel.js` 里的划词换算、翻页定位、锚点记录全都能直接用。
 * EPUB 要做的就是把 XHTML 拍成同样的形状，并且保证一条铁律：
 *
 *   **段落的 textContent 必须与「算偏移时用的那段文本」逐字相同。**
 *
 * 偏移是 `data-start + 段内前面所有文本节点的长度和`，所以只要渲染的 DOM 就是我量过的
 * 那棵子树，两边永远一致；反过来说，**任何「显示出来但不算字符」的修饰都不能是文本**
 * （列表符号用 CSS ::before 画，就是为了这个）。
 *
 * 其余约定：
 *   - 空白先归一（连续空白压成一个空格、去掉段首尾空白），再量长度 —— 顺序不能反；
 *   - 段与段之间那个换行是**虚拟**的（不进 DOM），但偏移里要计 1 个字符，与 TXT 一致；
 *   - 只保留内联标签，块级元素一律拆成独立的段，避免把 `<div>` 渲染进 `<p>` 里
 *     （浏览器会把不合法的块级子元素「抬」出去，DOM 一变偏移就全错）。
 */

import { parseXml } from './epub'
import { resolveZipPath } from './zip'

/** 连内容一起丢掉：脚本 / 样式 / 外链 / 表单 / 多媒体 / 会带来外网请求的东西 */
const DROP = new Set([
  'script', 'style', 'link', 'meta', 'base', 'title', 'head', 'iframe', 'frame', 'frameset',
  'object', 'embed', 'applet', 'param', 'form', 'input', 'button', 'select', 'textarea', 'label',
  'audio', 'video', 'canvas', 'noscript', 'svg', 'math', 'map', 'area', 'template', 'dialog',
  'source', 'track', 'picture',
])

/** 认识的标签。不认识的解包（保留子节点、丢掉标签本身），比整段删掉安全 */
const KNOWN = new Set([
  // 块级
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'blockquote', 'pre',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'caption', 'figure', 'figcaption', 'section', 'article', 'aside', 'header', 'footer',
  'main', 'nav', 'address', 'center', 'img',
  // 内联
  'a', 'span', 'em', 'strong', 'b', 'i', 'u', 's', 'strike', 'small', 'big', 'sub', 'sup',
  'mark', 'code', 'kbd', 'samp', 'var', 'abbr', 'acronym', 'cite', 'q', 'dfn', 'time',
  'ruby', 'rt', 'rp', 'wbr', 'font', 'tt',
])

/** 块级：不能出现在 <p> 里，必须单独成段（br 例外 —— 它是内联的换行） */
const BLOCK = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'blockquote', 'pre',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'caption', 'figure', 'figcaption', 'section', 'article', 'aside', 'header', 'footer',
  'main', 'nav', 'address', 'center',
])

/** 这些标签只影响外观，渲染时由外层 class 承担，段里不留元素本身 */
const KIND_OF = {
  h1: 'h', h2: 'h', h3: 'h', h4: 'h', h5: 'h', h6: 'h',
  blockquote: 'quote',
  pre: 'pre',
  li: 'li',
  dd: 'quote',
  caption: 'caption',
  figcaption: 'caption',
  p: 'p', div: 'p', center: 'p',
}

/** 段里含这些标签时，即使一个字都没有也要渲染（图片 / 分隔线） */
const MEDIA_SEL = 'img, hr'

const localName = (el) => {
  const n = (el.localName || el.tagName || '').toLowerCase()
  const i = n.indexOf(':')
  return i < 0 ? n : n.slice(i + 1)
}

const isBlock = (el) => el?.nodeType === 1 && BLOCK.has(localName(el))

function hasBlockChild(el) {
  for (const c of el.children ?? []) if (isBlock(c)) return true
  return false
}

function normalizeWs(el) {
  // <pre> 里的空白是有意义的，别动
  if (localName(el) === 'pre' || el.querySelector?.('pre')) return
  const nodes = []
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n)
  for (const n of nodes) {
    // 全角空格 U+3000 不动 —— 中文排版里它是有意义的缩进；其余连续空白压成一个
    const v = n.nodeValue
    const nv = v.replace(/[ \t\r\n\f\v]+/g, ' ')
    if (nv !== v) n.nodeValue = nv
  }
  if (nodes.length) {
    nodes[0].nodeValue = nodes[0].nodeValue.replace(/^[ \t\r\n\f\v]+/, '')
    const last = nodes[nodes.length - 1]
    last.nodeValue = last.nodeValue.replace(/[ \t\r\n\f\v]+$/, '')
  }
}

/**
 * 清洗一棵（已脱离文档的）子树。
 * 只留白名单标签与极少属性，并把图片 / 内链登记出来交给调用方处理。
 */
function sanitize(root, jobs) {
  for (const el of [...root.querySelectorAll('*')]) {
    if (!root.contains(el)) continue // 父节点被删掉了（比如 script 里的 fffffont）
    const tag = localName(el)

    if (DROP.has(tag)) {
      el.remove()
      continue
    }

    const isImg = tag === 'img'
    const isLink = tag === 'a'
    const href = isLink ? el.getAttribute('href') : null
    const src = isImg ? el.getAttribute('src') : null
    const alt = isImg ? el.getAttribute('alt') : null
    const w = isImg ? el.getAttribute('width') : null
    const h = isImg ? el.getAttribute('height') : null

    // 属性一律清掉（书里的 class/style 会带进出版商排版，和我们的主题打架）
    for (const a of [...el.attributes]) {
      if (a.name.toLowerCase() !== 'id') el.removeAttribute(a.name)
    }

    if (!KNOWN.has(tag)) {
      el.replaceWith(...el.childNodes)
      continue
    }

    if (isImg) {
      el.setAttribute('loading', 'lazy')
      if (alt) el.setAttribute('alt', alt)
      if (w && /^\d+$/.test(w)) el.setAttribute('width', w)
      if (h && /^\d+$/.test(h)) el.setAttribute('height', h)
      if (src && !/^data:/i.test(src)) {
        el.removeAttribute('src')
        jobs.images.push({ el, href: src })
      }
      continue
    }

    if (isLink && href) {
      // 内链改造成 <span data-frag="包内路径#锚点">：直接留 <a href="#x"> 会改动
      // location.hash，而本应用正是用 hash 做路由的 —— 点一下脚注就会被踢出阅读器。
      el.tagName === 'A' ? el.replaceWith(el) : null
      const span = el.ownerDocument.createElement('span')
      span.setAttribute('data-frag', href)
      while (el.firstChild) span.appendChild(el.firstChild)
      el.replaceWith(span)
    }
  }
}

/**
 * 把一章 XHTML 拍成段落数组。
 *
 * @param {object} opts
 * @param {string} opts.html 章节 XHTML 源文本
 * @param {string} opts.chapterPath 该章在压缩包内的路径（解析相对链接用）
 * @param {(absPath:string)=>Promise<string|null>} [opts.getResource]
 *        给相对路径返回可直接塞进 src 的 URL（通常是 objectURL）。不传则丢弃图片。
 * @returns {Promise<{ segs:Array, ids:Map<string,number>, text:string }>}
 *   segs: [{ start, kind, level, bullet, html, text }]，start 是**章内**字符偏移
 *   ids:  锚点 id → 段序号（目录里 'ch1.xhtml#part2' 这种深链靠它落到具体位置）
 */
export async function buildChapter({ html, chapterPath = '', getResource } = {}) {
  const doc = parseXml(html)
  const root = doc.body || doc.querySelector?.('body') || doc.documentElement
  if (!root) return { segs: [], ids: new Map(), text: '' }

  const jobs = { images: [] }
  sanitize(root, jobs)

  // 图片：先登记（相对路径按章路径解析），拿到 URL 再写回 src
  if (jobs.images.length) {
    for (const job of jobs.images) {
      const abs = resolveZipPath(chapterPath, job.href).path
      const url = getResource ? await getResource(abs) : null
      if (url) job.el.setAttribute('src', url)
      else job.el.remove()
    }
  }

  const segs = []
  const ids = new Map()
  let offset = 0
  // 容器的 id（<div id="part1"> 包着三段）归给它内部的第一段
  let pendingIds = []

  function push(el, { kind, level = 0, bullet = '', outer = false, wrap = true }) {
    const ownId = el.getAttribute?.('id')

    // 内部锚点登记到这一段，然后把 id 摘掉（避免和页面自身的 id 撞名）
    const anchors = [...(el.querySelectorAll?.('[id]') ?? [])]
    for (const n of anchors) {
      ids.set(n.getAttribute('id'), segs.length)
      n.removeAttribute('id')
    }
    if (ownId) {
      ids.set(ownId, segs.length)
      el.removeAttribute('id')
    }
    for (const id of pendingIds) ids.set(id, segs.length)
    pendingIds = []

    if (!outer) normalizeWs(el)
    const text = el.textContent ?? ''
    const hasImg = !!el.querySelector?.(MEDIA_SEL)
    if (!text && !outer && !hasImg) return

    // 用 HTML 的 <template> 序列化，而不是直接读 el.innerHTML：
    // 这些节点来自按 XML 解析出来的文档，XML 序列化会给每个元素补 xmlns 声明
    // （`<em xmlns="http://www.w3.org/1999/xhtml">`），又长又没用。跨文档 appendChild
    // 会自动 adopt，XHTML 的命名空间恰好就是 HTML 的，落进 template 后就是干净的 HTML。
    const tpl = document.createElement('template')
    if (outer) {
      tpl.content.appendChild(el)
    } else {
      for (const n of [...el.childNodes]) tpl.content.appendChild(n)
    }

    segs.push({
      start: offset,
      kind,
      level,
      bullet,
      wrap,
      img: hasImg,
      html: tpl.innerHTML,
      text,
    })
    offset += text.length + 1
  }

  function handleBlock(el, ctx) {
    const tag = localName(el)
    const ownId = el.getAttribute('id')
    if (ownId) pendingIds.push(ownId)

    if (tag === 'hr') {
      // <hr> 是块级，渲染时不能塞进 <p> 里，wrap=false 让外层换成 <div>
      push(el, { kind: 'hr', outer: true, wrap: false })
      return
    }

    if (hasBlockChild(el)) {
      const prev = {}
      if (tag === 'blockquote') {
        prev.quote = ctx.quote
        ctx.quote++
      }
      if (tag === 'ul' || tag === 'ol') {
        prev.list = ctx.list
        prev.ordered = ctx.ordered
        prev.index = ctx.index
        ctx.list++
        ctx.ordered = tag === 'ol'
        ctx.index = 0
      }
      walk(el, ctx)
      Object.assign(ctx, prev)
      return
    }

    let kind = KIND_OF[tag] ?? 'p'
    // 引用块里的段落按引用排（缩进 + 左边线），否则读者看不出这是引文
    if (kind === 'p' && ctx.quote > 0) kind = 'quote'
    let bullet = ''
    if (tag === 'li') {
      if (ctx.ordered) {
        ctx.index = (ctx.index ?? 0) + 1
        bullet = `${ctx.index}.`
      } else {
        bullet = '•'
      }
    }
    const level = /^h[1-6]$/.test(tag) ? Number(tag[1]) : 0
    push(el, { kind: kind === 'li' ? 'li' : kind, level, bullet })
  }

  function emitRun(nodes) {
    if (!nodes.length) return
    const wrap = doc.createElement('p')
    for (const n of nodes) wrap.appendChild(n)
    if (!wrap.textContent.trim() && !wrap.querySelector(MEDIA_SEL)) return
    push(wrap, { kind: 'p' })
  }

  function walk(node, ctx) {
    let run = []
    const flush = () => {
      if (run.length) {
        emitRun(run)
        run = []
      }
    }
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        run.push(child)
        continue
      }
      if (child.nodeType !== 1) continue
      const tag = localName(child)
      if (tag === 'br' || tag === 'img') {
        run.push(child) // 内联：仍属于当前这一段的文字流
        continue
      }
      if (isBlock(child)) {
        flush()
        handleBlock(child, ctx)
      } else {
        run.push(child)
      }
    }
    flush()
  }

  walk(root, { list: 0, ordered: false, index: 0, quote: 0 })

  return { segs, ids, text: segs.map((s) => s.text).join('\n') }
}

/* ---------------- 高亮回填 ---------------- */

/**
 * 把高亮区间包进段落的 HTML 里。
 *
 * 每个区间单独走一遍文本节点（而不是一次遍历处理全部区间）：`splitText` 会把
 * 一个文本节点拆成三段，先前取好的节点引用当场失效，一次遍历处理多个区间必然错位。
 * 每段里的高亮通常就一两条，多走几遍无所谓。
 *
 * 区间互相重叠时只渲染靠前的那个 —— 两层 <mark> 套在一起既难看也没法点。
 */
export function markedHtml(html, segStart, ranges) {
  if (!html || !ranges?.length) return html
  const tpl = document.createElement('template')
  tpl.innerHTML = html

  const hits = ranges
    .map((r) => ({
      id: r.id,
      color: r.color || 'yellow',
      from: Math.max(segStart, r.from),
      to: r.to,
    }))
    .filter((r) => r.to > r.from)
    .sort((a, b) => a.from - b.from)
  if (!hits.length) return html

  let cursor = segStart
  for (const r of hits) {
    if (r.from < cursor) continue
    if (applyMark(tpl.content, segStart, r)) cursor = r.to
  }
  return tpl.innerHTML
}

function applyMark(root, segStart, range) {
  const nodes = []
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n)

  let offset = segStart
  let touched = false
  for (const node of nodes) {
    const len = node.nodeValue.length
    const start = offset
    const end = start + len
    offset = end
    if (end <= range.from || start >= range.to) continue

    const a = Math.max(0, range.from - start)
    const b = Math.min(len, range.to - start)
    if (b <= a) continue

    const mid = node.splitText(a)
    mid.splitText(b - a)
    const mark = node.ownerDocument.createElement('mark')
    mark.setAttribute('data-hl', String(range.id))
    mark.setAttribute('data-color', range.color)
    mid.parentNode.insertBefore(mark, mid)
    mark.appendChild(mid)
    touched = true
  }
  return touched
}

/** 段落数组 → 章节纯文本（与阅读器里渲染的文本逐字一致，搜索索引必须用它） */
export function chapterTextOf(segs) {
  return (segs ?? []).map((s) => s.text).join('\n')
}
