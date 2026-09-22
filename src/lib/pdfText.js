/**
 * PDF 文本的位置模型与搜索归一化。
 *
 * 位置模型：PDF 没有稳定的字符坐标，pdf.js 给出的是「文本项数组」，
 * 每项是一段被排版在一起的文字。所以我们用
 *   { page, start: { item, offset }, end: { item, offset } }
 * 定位一段选中文字。item 是文本项下标，offset 是项内字符偏移。
 *
 * 归一化为什么是「去掉全部空白」而不是「空白折叠成一个空格」：
 * PDF 里一个单词经常被排成多个文本项（甚至跨行断开），
 * "read" + "ing" 折行后折叠空白会得到 "read ing"，
 * 搜 "reading" 就搜不到。去空白后两边都变成 "reading"，行断安全。
 *
 * 代价是可能出现跨词边界的误匹配（如搜 "he re" 命中 "here"）。
 * 对以中文为主的阅读场景，这个取舍是划算的；纯英文书如需精确，
 * 后续可加一层词边界校验。
 */

/** 是否是空白字符 */
const isWs = (ch) =>
  ch === ' ' ||
  ch === '\n' ||
  ch === '\t' ||
  ch === '\r' ||
  ch === '\f' ||
  ch === '\v' ||
  /\s/.test(ch)

/**
 * 把若干文本段拼成「去空白 + 小写」的紧致串，并记录每个输出字符的来源。
 *
 * @param {Array<{ key: number, text: string }>} segments
 * @returns {{ text: string, keys: number[], offs: number[] }}
 *   text[i] 来自第 keys[i] 段的第 offs[i] 个原始字符。
 */
export function buildTight(segments) {
  const chars = []
  const keys = []
  const offs = []
  for (let s = 0; s < segments.length; s++) {
    const text = segments[s].text
    const key = segments[s].key
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (isWs(ch)) continue
      chars.push(ch.toLowerCase())
      keys.push(key)
      offs.push(i)
    }
  }
  return { text: chars.join(''), keys, offs }
}

/** 对单个字符串做紧致化（搜索索引持久化用） */
export function tight(text) {
  return buildTight([{ key: 0, text: text || '' }])
}

/** 查询串归一化：去空白 + 小写 */
export function normalizeQuery(q) {
  return String(q || '')
    .toLowerCase()
    .split('')
    .filter((ch) => !isWs(ch))
    .join('')
}

/**
 * pdf.js 的 textContent.items → 该页纯文本。
 * 非文本项（tagged PDF 的 beginMarkedContent 等）的 str 不是字符串，跳过
 * —— 这与 TextLayer 内部 textContentItemsStr 的取法一致，两边必须对齐。
 */
export function itemsToText(items) {
  let out = ''
  for (const it of items || []) {
    if (typeof it?.str === 'string') out += it.str
    if (it?.hasEOL) out += '\n'
  }
  return out
}

/** 命中处的上下文片段，用于搜索结果列表 */
function snippetOf(src, start, end, pad = 26) {
  const a = Math.max(0, start - pad)
  const b = Math.min(src.length, end + pad)
  const head = a > 0 ? '…' : ''
  const tail = b < src.length ? '…' : ''
  return head + src.slice(a, b).replace(/\s+/g, ' ').trim() + tail
}

/**
 * 在整本书的按页文本里搜索。
 *
 * @param {string[]} pages 每页纯文本
 * @param {string} rawQuery 用户输入
 * @param {{ perPage?: number, max?: number }} opts
 * @returns {Array<{ page, from, to, snippet }>}
 *   from/to 是「紧致串」下标，用于在当前页 DOM 上再定位。
 */
export function searchInPages(pages, rawQuery, opts = {}) {
  const needle = normalizeQuery(rawQuery)
  if (!needle || !Array.isArray(pages)) return []

  const perPage = opts.perPage ?? 3
  const max = opts.max ?? 200
  const hits = []

  for (let p = 0; p < pages.length; p++) {
    const src = pages[p]
    if (!src) continue
    const idx = tight(src)
    if (!idx.text) continue

    let count = 0
    let at = idx.text.indexOf(needle)
    while (at >= 0 && count < perPage) {
      const last = at + needle.length - 1
      hits.push({
        page: p,
        from: at,
        to: at + needle.length,
        snippet: snippetOf(src, idx.offs[at], idx.offs[last] + 1),
      })
      count++
      if (hits.length >= max) return hits
      at = idx.text.indexOf(needle, at + needle.length)
    }
  }
  return hits
}

/**
 * 由当前页已渲染的文本层，建立「紧致串下标 → 文本项位置」的映射。
 * 用的规则与 tight() 完全一致，所以搜索命中给出的 from/to 可以直接用。
 *
 * @param {Array<{ item: number, text: string }>} segs
 */
export function buildItemMap(segs) {
  return buildTight(segs.map((s) => ({ key: s.item, text: s.text })))
}

/**
 * 在当前页 DOM 上定位命中的文本项区间。
 * @returns {{ start: {item,offset}, end: {item,offset} } | null}
 */
export function hitToRange(map, from, to) {
  if (!map || from < 0 || to <= from || to > map.text.length) return null
  return {
    start: { item: map.keys[from], offset: map.offs[from] },
    // end 是开区间，最后命中的字符是 to-1，其结束位置 +1
    end: { item: map.keys[to - 1], offset: map.offs[to - 1] + 1 },
  }
}
