/**
 * TXT 阅读器的 DOM ↔ 字符偏移换算，以及分栏排版的几何换算。
 *
 * 与 lib/pdfText.js（纯函数）分开的理由同 lib/selection.js：
 * 这些函数必须读真实 DOM（Range / getBoundingClientRect），无法在纯逻辑里测。
 *
 * 排版约定（TxtReader 里也是这套，两边必须一致）：
 *   .txt-columns 用 CSS 多栏把一章文字排成 N 栏，每栏宽 colW、间距 gap，
 *   第 p 栏就显示在 scrollLeft = p * (colW + gap) 的位置。
 *   所以「第几栏」= 「第几页」，元素 x 坐标 → 栏序号的换算在 columnAt() 里。
 */

/** 段落元素上挂着 data-seg（序号）与 data-start（全文绝对偏移），定位全靠它 */
const SEG_SELECTOR = '[data-seg]'

/**
 * 算出某个元素落在第几栏（0 起）。
 *
 * 关键点：`el.getBoundingClientRect().left - geo.left + scrollLeft` 得到的是
 * 该元素在「未滚动坐标系」里的 x —— 借滚动量把视口位移抵消掉，所以随时可测。
 *
 * @param {Element} el
 * @param {{ left:number, scrollLeft:number, colW:number, gap:number }} geo
 */
export function columnAt(el, geo) {
  if (!el || !geo?.colW) return -1
  const r = el.getBoundingClientRect()
  const x = r.left - geo.left + geo.scrollLeft
  return Math.max(0, Math.floor((x + 1) / (geo.colW + geo.gap)))
}

/**
 * 找出「从第 page 栏开始」的那个段落元素。
 *
 * 跨栏的长段落会让某一栏没有段落**起头**（上一段从这栏中间就开始了），
 * 这时返回最近的上一个段落并标记 exact:false —— 调用方用它当锚点时
 * 误差上界是「往前一页」，比拿不到锚点强。
 *
 * @returns {{ el: Element, exact: boolean } | null}
 */
export function firstSegOnPage(columnsEl, page, geo) {
  const kids = columnsEl?.children
  if (!kids?.length) return null
  let last = null
  for (const el of kids) {
    const c = columnAt(el, geo)
    if (c === page) return { el, exact: true }
    if (c > page) break
    last = el
  }
  return last ? { el: last, exact: false } : { el: kids[0], exact: false }
}

/** 段落序号 → 它落在第几栏 */
export function pageOfSegment(columnsEl, segIndex, geo) {
  const el = columnsEl?.children?.[segIndex]
  return el ? columnAt(el, geo) : -1
}

/** 按文档顺序遍历元素内的文本节点 */
function textNodesOf(root) {
  if (!root) return []
  if (root.nodeType === 3) return [root]
  const out = []
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n = w.nextNode()
  while (n) {
    out.push(n)
    n = w.nextNode()
  }
  return out
}

/**
 * 算出「某段内某个文本节点上的偏移」对应段内第几个字符。
 * 段内可能被 <mark> 切成多个文本节点，所以必须逐个累加长度。
 */
function offsetInside(segEl, node, nodeOffset) {
  if (segEl === node) {
    // Range 落在元素本身（如空段落边界）上，按子节点序号近似
    const kids = [...segEl.childNodes]
    let sum = 0
    for (let i = 0; i < nodeOffset && i < kids.length; i++) sum += kids[i].textContent.length
    return sum
  }
  let sum = 0
  for (const t of textNodesOf(segEl)) {
    if (t === node) return sum + nodeOffset
    sum += t.nodeValue.length
  }
  return sum
}

/**
 * 由 DOM 节点推出「全文绝对字符偏移」。
 * @returns {number | null}
 */
export function absOffsetOf(segEl, node, nodeOffset) {
  if (!segEl) return null
  const start = Number(segEl.dataset.start)
  if (!Number.isFinite(start)) return null
  return start + offsetInside(segEl, node, nodeOffset)
}

function pointNode(x, y) {
  const doc = document
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y)
    if (r) return { node: r.startContainer, offset: r.startOffset }
  }
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y)
    if (p?.offsetNode) return { node: p.offsetNode, offset: p.offset }
  }
  return null
}

/**
 * 视口坐标 → 全文绝对字符偏移。
 * 点可能落在段落之间的空白（换行不在 DOM 里），所以退一步用 elementFromPoint 兜底。
 *
 * @returns {number | null}
 */
export function absOffsetAtPoint(columnsEl, x, y) {
  const hit = pointNode(x, y)
  if (hit?.node) {
    const segEl = (hit.node.nodeType === 3 ? hit.node.parentElement : hit.node)?.closest?.(SEG_SELECTOR)
    if (segEl) return absOffsetOf(segEl, hit.node, hit.offset)
  }
  const el = document.elementFromPoint?.(x, y)?.closest?.(SEG_SELECTOR)
  if (el) {
    const start = Number(el.dataset.start)
    return Number.isFinite(start) ? start : null
  }
  return null
}

/**
 * 当前原生选区 → 全文绝对偏移区间。
 *
 * 跨段选区保持完整（TXT 的高亮是按字符区间存的，天然支持跨段，
 * 这点与 PDF 的「跨页裁剪到起始页」不同）。
 *
 * @returns {{ from:number, to:number, text:string, rect:DOMRect } | null}
 */
export function selectionOffsets(columnsEl) {
  const sel = window.getSelection?.()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!columnsEl?.contains(range.commonAncestorContainer)) return null

  const a = absOffsetOf(
    (range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer)?.closest?.(SEG_SELECTOR),
    range.startContainer,
    range.startOffset
  )
  const b = absOffsetOf(
    (range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer)?.closest?.(SEG_SELECTOR),
    range.endContainer,
    range.endOffset
  )
  if (a == null || b == null || b <= a) return null

  return { from: Math.min(a, b), to: Math.max(a, b), text: String(sel.toString() || ''), rect: range.getBoundingClientRect() }
}

/**
 * 滚动模式的「字符级锚点」：视口顶线压在 segEl 文本的第几个字符上（段内偏移）。
 *
 * 段级锚点（dataset.start）在「一章一大块」的 EPUB 里粒度退化成整章 —— 转换件
 * 常用 <br> 换行而不是 <p>，整章就是一段，退出再进来永远回到章首。
 * 这里用 Range 逐字符量出「第一个底边越过视口顶线的字符」，把锚点细化到字符级。
 * 二分查找：每个文本节点最多 O(log n) 次 getBoundingClientRect，无写入不触发重排。
 *
 * @param {Element} segEl 段元素（data-start 的宿主）
 * @param {Element} vp    滚动容器（拿它的顶线做基准）
 * @returns {number} 段内字符偏移；段里没有文本（图片段等）时返回 0
 */
export function intraOffsetAtTop(segEl, vp) {
  if (!segEl || !vp) return 0
  const line = vp.getBoundingClientRect().top + 1
  let acc = 0
  for (const n of textNodesOf(segEl)) {
    const len = n.nodeValue.length
    if (!len) continue
    // 整个节点都在顶线上方 → 跳过
    const lastRect = charRect(n, len - 1)
    if (!lastRect || lastRect.bottom <= line) {
      acc += len
      continue
    }
    // 首字符就越线 → 顶线在这段文字之前，就是节点开头
    const firstRect = charRect(n, 0)
    if (firstRect && firstRect.bottom > line) return acc
    // 跨线的节点：二分第一个底边越线的字符
    let lo = 0
    let hi = len - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      const r = charRect(n, mid)
      if (r && r.bottom > line) hi = mid
      else lo = mid + 1
    }
    return acc + lo
  }
  return acc
}

/** 第 i 个字符的 client rect（i 从 0 起） */
function charRect(node, i) {
  try {
    const r = document.createRange()
    r.setStart(node, i)
    r.setEnd(node, i + 1)
    return r.getBoundingClientRect()
  } catch {
    return null
  }
}

/**
 * 把段内第 intra 个字符滚到视口顶线（字符级恢复用）。
 *
 * 先由调用方把这一段顶到视口顶（scrollToSeg），再按「目标字符的 rect 与视口顶的
 * 差值」补一次 scrollTop —— 不猜 offsetParent 链，与 scrollToSeg 同一套几何。
 * 目标字符量不出 rect（空段 / 边界）时不动，落回段首，至少不比以前差。
 *
 * @returns {boolean} 是否真的补滚了
 */
export function scrollSegToChar(segEl, intra, vp) {
  if (!segEl || !vp || !(intra > 0)) return false
  const nodes = textNodesOf(segEl)
  let acc = 0
  let node = null
  let off = 0
  for (const n of nodes) {
    const len = n.nodeValue.length
    if (acc + len > intra) {
      node = n
      off = intra - acc
      break
    }
    acc += len
  }
  if (!node) {
    // intra 落在段尾之后（滚进了 padding 区）：用最后一个字符兜底
    if (!nodes.length) return false
    node = nodes[nodes.length - 1]
    off = Math.max(0, node.nodeValue.length - 1)
  }
  const rect = charRect(node, Math.min(off, node.nodeValue.length - 1))
  if (!rect || (!rect.height && !rect.top && !rect.bottom)) return false
  vp.scrollTop += rect.top - vp.getBoundingClientRect().top
  return true
}

/** 把一段文字按高亮区间切成 [{ text, mark }]，渲染时就知道哪儿要包 <mark> */
export function splitByMarks(text, segStart, ranges) {
  const hits = (ranges || [])
    .map((r) => ({
      from: Math.max(segStart, r.from),
      to: Math.min(segStart + text.length, r.to),
      id: r.id,
      color: r.color,
    }))
    .filter((r) => r.to > r.from)
    .sort((x, y) => x.from - y.from)

  if (!hits.length) return [{ text, mark: null }]

  const out = []
  let at = segStart
  for (const r of hits) {
    if (r.from > at) out.push({ text: text.slice(at - segStart, r.from - segStart), mark: null })
    const s = Math.max(at, r.from)
    out.push({ text: text.slice(s - segStart, r.to - segStart), mark: { id: r.id, color: r.color } })
    at = r.to
  }
  if (at < segStart + text.length) out.push({ text: text.slice(at - segStart), mark: null })
  return out.filter((p) => p.text)
}
