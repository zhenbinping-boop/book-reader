import { pdfjsLib, pdfOptions } from './pdfWorker'
import { itemsToText } from '../lib/pdfText'

/**
 * 打开 PDF，返回 { doc, destroy }。
 *
 * 两个必须注意的点：
 * 1. 每次都从 blob 重新读取 ArrayBuffer —— pdf.js 会接管（transfer）传入的
 *    buffer，复用同一个 buffer 会导致第二次打开失败。
 * 2. pdf.js v6 起 PDFDocumentProxy 上已经没有 destroy()，释放资源必须通过
 *    getDocument() 返回的 loadingTask。
 */
export async function openPdf(blob) {
  const buf = await blob.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: buf, ...pdfOptions })
  const doc = await loadingTask.promise

  return {
    doc,
    destroy: () => {
      try {
        return Promise.resolve(loadingTask.destroy()).catch(() => {})
      } catch {
        return Promise.resolve()
      }
    },
  }
}

/** 首页渲染成缩略图，作为书架封面 */
export async function renderCover(doc, maxWidth = 320) {
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(maxWidth / base.width, 2)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.floor(viewport.width))
    canvas.height = Math.max(1, Math.floor(viewport.height))
    await page.render({ canvas, viewport }).promise
    page.cleanup?.()
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return null
  }
}

/** 逐页尺寸，用于滚动模式下的精确占位（分批并发，避免一次性卡死主线程） */
export async function getPageSizes(doc, onTick) {  const total = doc.numPages
  const sizes = new Array(total)
  const BATCH = 16
  for (let start = 0; start < total; start += BATCH) {
    const end = Math.min(start + BATCH, total)
    const tasks = []
    for (let i = start; i < end; i++) tasks.push(fetchSize(doc, i, sizes))
    await Promise.all(tasks)
    onTick?.(end / total)
  }
  return sizes
}

async function fetchSize(doc, index, sink) {
  try {
    const page = await doc.getPage(index + 1)
    const v = page.getViewport({ scale: 1 })
    sink[index] = { width: v.width, height: v.height }
    page.cleanup?.()
  } catch {
    sink[index] = { width: 595, height: 842 }
  }
}

const MAX_CACHED_PAGES = 40

/**
 * 取一页的 PDFPageProxy，带缓存与「并发去重」。
 *
 * 缓存放这里而不是组件里，是因为同一页有两处消费者（canvas 与文本层），
 * 两边各调一次 getPage 会各自拿到一个 page 对象，白费一份内存；
 * pending 表保证同一页只会发起一次请求。
 * 淘汰时只是丢掉引用、不调 page.cleanup() —— cleanup 在渲染进行中调用会抛错。
 *
 * @param {{ready: Map, pending: Map}} cache
 */
export async function obtainPage(doc, cache, index) {
  const hit = cache.ready.get(index)
  if (hit) return hit

  let inflight = cache.pending.get(index)
  if (!inflight) {
    inflight = doc
      .getPage(index + 1)
      .then((page) => {
        cache.pending.delete(index)
        cache.ready.set(index, page)
        if (cache.ready.size > MAX_CACHED_PAGES) {
          cache.ready.delete(cache.ready.keys().next().value)
        }
        return page
      })
      .catch((err) => {
        cache.pending.delete(index)
        throw err
      })
    cache.pending.set(index, inflight)
  }
  return inflight
}

/**
 * 整本书按页提取纯文本，供全文搜索使用。
 *
 * 分批并发（与 getPageSizes 同样的理由：一次性发起几百个 getPage
 * 会挤爆 worker 队列），每批结束回调一次进度。
 * 扫描件没有文本层，对应页会得到空串 —— 调用方需据此提示用户。
 *
 * @returns {Promise<string[]>} 长度为 numPages 的数组
 */
export async function extractText(doc, onProgress) {
  const total = doc.numPages
  const pages = new Array(total).fill('')
  const BATCH = 12
  for (let start = 0; start < total; start += BATCH) {
    const end = Math.min(start + BATCH, total)
    const tasks = []
    for (let i = start; i < end; i++) {
      tasks.push(
        doc
          .getPage(i + 1)
          .then((page) => page.getTextContent())
          .then((tc) => {
            pages[i] = itemsToText(tc.items)
          })
          .catch(() => {
            pages[i] = ''
          })
      )
    }
    await Promise.all(tasks)
    onProgress?.(end, total)
  }
  return pages
}

/** outline 的 dest 可能是字符串、数组或引用，统一解析成页码索引（0 起） */
async function destToPageIndex(doc, dest) {
  try {
    let d = dest
    if (typeof d === 'string') d = await doc.getDestination(d)
    if (!Array.isArray(d) || d.length === 0) return null
    const head = d[0]
    if (typeof head === 'number') return head
    if (head && typeof head === 'object') return await doc.getPageIndex(head)
  } catch {
    return null
  }
  return null
}

/**
 * 目录树。父节点即使自身没有页码，只要子节点能跳转就保留。
 * 返回 { title, pageIndex, children }，pageIndex 为 0 起索引或 null。
 */
export async function buildOutline(doc) {
  let outline
  try {
    outline = await doc.getOutline()
  } catch {
    return []
  }
  if (!outline || outline.length === 0) return []

  const walk = async (items, depth, prefix) => {
    if (depth > 6) return []
    const out = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const pageIndex = await destToPageIndex(doc, item.dest)
      const children = item.items?.length ? await walk(item.items, depth + 1, `${prefix}${i}.`) : []
      if (pageIndex !== null || children.length > 0) {
        out.push({
          // 稳定的 key：React 列表渲染需要，同时避免同层同名条目相互串位
          key: `${prefix}${i}`,
          title: (item.title || '无标题').trim(),
          pageIndex: pageIndex !== null ? Math.min(Math.max(pageIndex, 0), doc.numPages - 1) : null,
          children,
        })
      }
    }
    return out
  }

  return walk(outline, 0, 'o')
}
