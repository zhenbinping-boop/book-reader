/**
 * TXT 的解码、分章与字符定位。**全部是纯函数**（不碰 DOM），便于在测试页直接断言。
 *
 * 与 PDF 的根本差别：PDF 有稳定的「页」，TXT 没有 —— 分页完全取决于
 * 屏幕尺寸 / 字号 / 行高，换个字号页数就变了。所以 TXT 的位置模型**不能以页为单位**，
 * 而要用「章 + 章内字符偏移」这种与排版无关的锚点：
 *   progress = { chapterIndex, charOffset }
 * 排版参数怎么变都能定位回同一段文字。见 db.js 的 progress 表与 TxtReader。
 */

/* ---------------- 解码 ---------------- */

/** 统一换行符，保证「字符偏移」在解码后是稳定的（CRLF 与 CR 都算一个字符） */
export function normalizeNewlines(s) {
  return String(s ?? '').replace(/\r\n?/g, '\n')
}

/**
 * 把文件字节解成文本。
 *
 * 顺序：BOM → 无 BOM 的 UTF-16（靠 NUL 分布判断）→ 严格 UTF-8 校验 → gb18030 兜底。
 * 为什么不用 jschardet：这里要覆盖的实际只有「UTF-8 系」和「简体中文老编码」两类，
 * 严格解码能过就是 UTF-8（UTF-8 的字节结构很严，中文乱码几乎不可能通过 fatal 校验），
 * 过不了基本就是 GBK/GB18030。省一个依赖，行为也完全可预测。
 *
 * @returns {{ text: string, encoding: string }}
 */
export function decodeBytes(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input)
  const n = u8.length

  if (n >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return { text: normalizeNewlines(new TextDecoder('utf-8').decode(u8.subarray(3))), encoding: 'utf-8-bom' }
  }
  if (n >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    return { text: normalizeNewlines(new TextDecoder('utf-16le').decode(u8.subarray(2))), encoding: 'utf-16le' }
  }
  if (n >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    return { text: normalizeNewlines(new TextDecoder('utf-16be').decode(u8.subarray(2))), encoding: 'utf-16be' }
  }

  // 没有 BOM 的 UTF-16：ASCII 文本里每隔一个字节就是 0x00，按奇偶位置数一下
  const probe = Math.min(n, 4096)
  if (probe > 16) {
    let evenNul = 0
    let oddNul = 0
    for (let i = 0; i < probe; i++) {
      if (u8[i] === 0) {
        if (i % 2 === 0) evenNul++
        else oddNul++
      }
    }
    if (oddNul / probe > 0.3) return { text: normalizeNewlines(new TextDecoder('utf-16le').decode(u8)), encoding: 'utf-16le' }
    if (evenNul / probe > 0.3) return { text: normalizeNewlines(new TextDecoder('utf-16be').decode(u8)), encoding: 'utf-16be' }
  }

  try {
    // fatal:true —— 遇到非法序列直接抛，不静默替换成 U+FFFD
    const text = new TextDecoder('utf-8', { fatal: true }).decode(u8)
    return { text: normalizeNewlines(text), encoding: 'utf-8' }
  } catch {
    /* 不是合法 UTF-8，按简体中文老编码处理 */
  }

  try {
    // gb18030 是 GBK / GB2312 的超集，能一并覆盖
    return { text: normalizeNewlines(new TextDecoder('gb18030').decode(u8)), encoding: 'gb18030' }
  } catch {
    // 极端情况（浏览器不支持该编码）：有损解码，至少能看
    return { text: normalizeNewlines(new TextDecoder('utf-8').decode(u8)), encoding: 'utf-8-lossy' }
  }
}

/* ---------------- 分章 ---------------- */

/** 「第X章 / 卷X / Chapter N / 12. 标题」这类行首标识 */
const HEAD_RE =
  /^(?:第\s*[0-9０-９〇零一二三四五六七八九十百千两]{1,8}\s*[章节節回卷篇部集]|(?:Chapter|CHAPTER|Part|PART|Section|SECTION)\s+[0-9IVXLCivxlc]{1,6}|卷\s*[0-9一二三四五六七八九十百]{1,4}|[0-9]{1,4}\s*[.、·]\s*\S)/

/**
 * 判断一行是不是章节标题。
 * 中文小说的正文里常出现「第一，……」这种叙述，所以额外排除以句末标点收尾、
 * 或含多个逗号冒号的长行 —— 标题通常短、且不以标点结尾。
 */
export function isChapterTitle(line) {
  const s = String(line ?? '').trim()
  if (!s || s.length > 30) return false
  if (/[。！？!?…；;]$/.test(s)) return false
  if (!HEAD_RE.test(s)) return false
  if ((s.match(/[，,：:]/g) || []).length > 3) return false
  return true
}

/** 章节太少时的兜底：按固定字数切，尽量落在空行上，别把一段话劈开 */
function chunkByLength(src, size) {
  const out = []
  let i = 0
  let n = 1
  while (i < src.length) {
    let end = Math.min(src.length, i + size)
    if (end < src.length) {
      const nl = src.lastIndexOf('\n\n', end)
      if (nl > i + size * 0.5) end = nl + 1
    }
    out.push({ title: `第 ${n} 节`, start: i, end })
    i = end
    n++
  }
  return out.length ? out : [{ title: '正文', start: 0, end: src.length }]
}

/**
 * 把全文切成章节。
 *
 * @param {string} text 解码后的全文
 * @param {{ minChapters?: number, chunkSize?: number }} opts
 * @returns {Array<{ title: string, start: number, end: number }>}
 *   start / end 是**全文绝对字符偏移**，左闭右开，与 text 的下标一一对应。
 *
 * 至少要认出 2 个标题才认为「这本书有章节」，否则退回按字数切 ——
 * 只认出一个标题，多半是把正文里的某一行误判了。
 */
export function splitChapters(text, opts = {}) {
  const src = String(text ?? '')
  const minChapters = opts.minChapters ?? 2
  const chunkSize = opts.chunkSize ?? 3000

  const marks = []
  let pos = 0
  for (const line of src.split('\n')) {
    if (isChapterTitle(line)) marks.push({ title: line.trim(), start: pos })
    pos += line.length + 1
  }

  if (marks.length < minChapters) return chunkByLength(src, chunkSize)

  const chapters = []
  // 第一个标题之前的内容（前言 / 版权页）也留一章，否则那部分文字读不到
  if (marks[0].start > 0) chapters.push({ title: '开始', start: 0, end: marks[0].start })
  marks.forEach((m, i) => {
    chapters.push({
      title: m.title,
      start: m.start,
      end: i + 1 < marks.length ? marks[i + 1].start : src.length,
    })
  })
  return chapters
}

/* ---------------- 渲染分段 ---------------- */

/**
 * 把一章切成「段落」用于渲染，并记下每段在全文中的起始偏移。
 *
 * 只去掉行尾空白（行首缩进原样保留，否则偏移对不上）。
 * 纯空白行不产生段落，但它的长度照样计入偏移 —— 段落之间的换行是「虚拟」的，
 * 不进 DOM，所以 seg.start 必须按原始文本算。
 *
 * @returns {Array<{ start: number, text: string }>}
 */
export function paragraphsOf(text, from, to) {
  const src = String(text ?? '')
  const lo = Math.max(0, Math.min(from, src.length))
  const hi = Math.max(lo, Math.min(to, src.length))
  const body = src.slice(lo, hi)
  const out = []
  let pos = 0
  for (const line of body.split('\n')) {
    const t = line.replace(/\s+$/, '')
    if (t.trim()) out.push({ start: lo + pos, text: t })
    pos += line.length + 1
  }
  return out
}

/** 找出 offset 落在第几个段落（二分）。offset 在段落之间的换行上时归到前一段。 */
export function segmentAt(segs, offset) {
  if (!segs || !segs.length) return -1
  let lo = 0
  let hi = segs.length - 1
  let ans = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segs[mid].start <= offset) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

/** 章节序号 → 用于列表展示的短标签 */
export function chapterLabel(i) {
  return `第${(Number(i) || 0) + 1}章`
}

/**
 * 读到第几章算百分之几（书架进度条用）。
 * 章内位置不计入 —— 书架只需要一个粗略的直观感受。
 */
export function chapterPercent(chapterIndex, chapterCount) {
  if (!chapterCount) return 0
  return Math.round(((Math.min(chapterIndex, chapterCount - 1) + 1) / chapterCount) * 100)
}

/* ---------------- 搜索 ---------------- */

const isWs = (ch) => /\s/.test(ch)

/** 归一化查询串：去掉全部空白 + 转小写（与 PDF 侧同规则，理由见 lib/pdfText.js） */
export function normalizeQuery(q) {
  return String(q || '')
    .toLowerCase()
    .split('')
    .filter((ch) => !isWs(ch))
    .join('')
}

function snippetOf(src, start, end, pad = 26) {
  const a = Math.max(0, start - pad)
  const b = Math.min(src.length, end + pad)
  return (a > 0 ? '…' : '') + src.slice(a, b).replace(/\s+/g, ' ').trim() + (b < src.length ? '…' : '')
}

/**
 * 在章节文本里搜索。
 *
 * TXT 不需要像 PDF 那样先建持久化索引 —— 全文本来就是一个字符串，切片即得，
 * 每次搜索直接扫一遍即可（几百万字也就几十毫秒）。
 *
 * @param {string} text 全文
 * @param {Array<{start:number,end:number}>} chapters 分章结果
 * @param {string} rawQuery
 * @returns {Array<{ page:number, from:number, to:number, snippet:string }>}
 *   page = 章序号；from / to = **章内**原始字符偏移（跳转直接用）。
 */
export function searchChapters(text, chapters, rawQuery, opts = {}) {
  const needle = normalizeQuery(rawQuery)
  if (!needle || !Array.isArray(chapters)) return []
  const perChapter = opts.perChapter ?? 3
  const max = opts.max ?? 200
  const hits = []

  for (let c = 0; c < chapters.length; c++) {
    const { start, end } = chapters[c]
    const src = text.slice(start, end)
    if (!src) continue

    // 紧致化：去空白小写，并记下每个紧致字符来自章内第几个原始字符
    const chars = []
    const offs = []
    for (let i = 0; i < src.length; i++) {
      const ch = src[i]
      if (isWs(ch)) continue
      chars.push(ch.toLowerCase())
      offs.push(i)
    }
    const tight = chars.join('')
    if (!tight) continue

    let count = 0
    let at = tight.indexOf(needle)
    while (at >= 0 && count < perChapter) {
      const last = at + needle.length - 1
      hits.push({
        page: c,
        from: offs[at],
        to: offs[last] + 1,
        snippet: snippetOf(src, offs[at], offs[last] + 1),
      })
      count++
      if (hits.length >= max) return hits
      at = tight.indexOf(needle, at + needle.length)
    }
  }
  return hits
}

/**
 * 章内偏移 + 长度 → 横跨若干段的「高亮区间」。
 * 返回的是相对于该章段落数组的原始偏移，渲染时直接按段切开。
 */
export function clampRange(chapterTextLength, from, to) {
  const a = Math.max(0, Math.min(from, chapterTextLength))
  const b = Math.max(a, Math.min(to, chapterTextLength))
  return { from: a, to: b }
}
