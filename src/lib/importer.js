import { openPdf, renderCover } from '../pdf/pdfService'
import { putBook, findBookByHash, attachBlob } from '../db'
import { fileFingerprint } from './backup'
import { decodeBytes, splitChapters } from './txtText'
import { openEpub, readResource } from './epub'

/**
 * 导入文件。按内容指纹查重，命中已有记录就不再重复导入：
 * - 命中一条「缺文件」的记录（从备份恢复出来、还没重新导入文件的）→ 把文件接回去，
 *   笔记和进度自动就回来了。
 * - 命中一条已有文件的书 → 直接指向原来那本（否则会多出一本空书架条目，
 *   而原有笔记会挂在新书上变成孤儿）。
 *
 * 统一返回 { id, title, status }，status ∈ 'added' | 'linked' | 'duplicate'
 */

/** 只认格式，不读内容 */
export function detectFormat(file) {
  if (!file) return null
  const name = file.name || ''
  if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  if (file.type === 'text/plain' || /\.(txt|text)$/i.test(name)) return 'txt'
  if (file.type === 'application/epub+zip' || /\.epub$/i.test(name)) return 'epub'
  return null
}

export function isSupportedFile(file) {
  return detectFormat(file) !== null
}

/** 兼容旧调用方（测试页里用过） */
export function isPdfFile(file) {
  return detectFormat(file) === 'pdf'
}

/** 按指纹查重的公共前置步骤，命中就直接返回，不用进各自的解析流程 */
async function reuseIfKnown(file) {
  const fileHash = await fileFingerprint(file)
  const existing = await findBookByHash(fileHash)
  if (!existing) return { fileHash, existing: null }
  if (existing.missingFile) {
    await attachBlob(existing.id, file, { fileName: file.name })
    return { fileHash, existing, status: 'linked' }
  }
  return { fileHash, existing, status: 'duplicate' }
}

export async function importPdf(file, onStep) {
  onStep?.('fingerprint')
  const probe = await reuseIfKnown(file)
  if (probe.existing) {
    return { id: probe.existing.id, title: probe.existing.title, status: probe.status }
  }

  onStep?.('parse')
  const { doc, destroy } = await openPdf(file)

  try {
    let title = file.name.replace(/\.pdf$/i, '').trim()
    try {
      const meta = await doc.getMetadata()
      const embedded = meta?.info?.Title
      if (typeof embedded === 'string' && embedded.trim()) title = embedded.trim()
    } catch {
      /* 元数据损坏就用文件名 */
    }

    const cover = await renderCover(doc)
    const id = await putBook({
      title,
      format: 'pdf',
      pageCount: doc.numPages,
      cover,
      blob: file,
      fileHash: probe.fileHash,
      fileName: file.name,
    })
    return { id, title, status: 'added' }
  } finally {
    destroy()
  }
}

/**
 * 导入 TXT。
 *
 * 不需要任何解析引擎，只要「解码 + 分章」两步。注意 pageCount 这里记的是**章数**
 * —— 书架按 page / pageCount 算百分比，复用同一套逻辑，对 TXT 来说「读到第几章」
 * 正好就是想要的进度感。
 */
export async function importTxt(file, onStep) {
  onStep?.('fingerprint')
  const probe = await reuseIfKnown(file)
  if (probe.existing) {
    return { id: probe.existing.id, title: probe.existing.title, status: probe.status }
  }

  onStep?.('parse')
  const { text, encoding } = decodeBytes(await file.arrayBuffer())
  if (!text.trim()) throw new Error('这个文件里没有可显示的文本')

  const chapters = splitChapters(text)
  const title = file.name.replace(/\.(txt|text)$/i, '').trim() || '未命名'

  const id = await putBook({
    title,
    format: 'txt',
    pageCount: chapters.length,
    cover: null,
    blob: file,
    fileHash: probe.fileHash,
    fileName: file.name,
  })
  return { id, title, status: 'added', chapters: chapters.length, encoding }
}

/* ---------------- EPUB ---------------- */

const COVER_MAX = 320

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => reject(new Error('读取封面失败'))
    fr.readAsDataURL(blob)
  })
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('封面解码失败'))
    img.src = url
  })
}

/**
 * 从压缩包里取封面并缩成缩略图。
 *
 * 书架上的封面是当 `<img src>` 用的，几十 KB 的 dataURL 刚好；直接把原图转成
 * dataURL 会在 IndexedDB 里堆出几 MB 的字符串（PDF 那边是靠渲染到 canvas 解决的，
 * 这里同样缩一遍）。失败一律返回 null —— 没有封面只是少张图，不该让导入失败。
 */
async function makeCoverThumb(book) {
  if (!book.coverPath) return null
  let blob = null
  try {
    blob = await readResource(book, book.coverPath)
  } catch {
    return null
  }
  if (!blob) return null

  // SVG 封面靠 canvas 画不出来（依赖它自己声明的尺寸），够小就直接存原样
  if (/svg/.test(book.coverType) || /\.svg$/i.test(book.coverPath)) {
    return blob.size <= 300 * 1024 ? blobToDataURL(blob).catch(() => null) : null
  }

  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const w = img.naturalWidth || COVER_MAX
    const h = img.naturalHeight || COVER_MAX
    const scale = Math.min(1, COVER_MAX / w)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 导入 EPUB。
 *
 * pageCount 记的是**章（spine 项）数** —— 与 TXT 同一个约定，书架按 page / pageCount
 * 算百分比，对 EPUB 来说「读到第几节」正好是想要的进度感。
 */
export async function importEpub(file, onStep) {
  onStep?.('fingerprint')
  const probe = await reuseIfKnown(file)
  if (probe.existing) {
    return { id: probe.existing.id, title: probe.existing.title, status: probe.status }
  }

  onStep?.('parse')
  const book = await openEpub(await file.arrayBuffer())
  const title = book.title || file.name.replace(/\.epub$/i, '').trim() || '未命名'
  const cover = await makeCoverThumb(book)

  const id = await putBook({
    title,
    author: book.author || '',
    format: 'epub',
    pageCount: book.chapters.length,
    cover,
    blob: file,
    fileHash: probe.fileHash,
    fileName: file.name,
  })
  return { id, title, status: 'added', chapters: book.chapters.length, author: book.author }
}

/** 统一入口：按扩展名 / MIME 分派 */
export async function importFile(file, onStep) {
  const fmt = detectFormat(file)
  if (fmt === 'pdf') return { ...(await importPdf(file, onStep)), format: 'pdf' }
  if (fmt === 'txt') return { ...(await importTxt(file, onStep)), format: 'txt' }
  if (fmt === 'epub') return { ...(await importEpub(file, onStep)), format: 'epub' }
  throw new Error('目前只支持 PDF、TXT 与 EPUB 文件')
}
