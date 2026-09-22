import { openPdf, renderCover } from '../pdf/pdfService'
import { putBook, findBookByHash, attachBlob } from '../db'
import { fileFingerprint } from './backup'

/**
 * 导入一个 PDF 文件。元数据优先用 PDF 内嵌标题，回退到文件名。
 * 文件本体直接存进 IndexedDB，不经过任何网络。
 *
 * 导入前先按内容指纹查重：
 * - 命中一条「缺文件」的记录（从备份恢复出来、还没重新导入文件的）→ 把文件接回去，
 *   笔记和进度自动就回来了。
 * - 命中一条已有文件的书 → 不重复导入，直接指向原来那本（否则会多出一本空书架条目，
 *   而原有笔记会挂在新书上变成孤儿）。
 *
 * 返回 { id, title, status }，status ∈ 'added' | 'linked' | 'duplicate'
 */
export async function importPdf(file, onStep) {
  onStep?.('fingerprint')
  const fileHash = await fileFingerprint(file)
  const existing = await findBookByHash(fileHash)

  if (existing) {
    if (existing.missingFile) {
      await attachBlob(existing.id, file, { fileName: file.name })
      return { id: existing.id, title: existing.title, status: 'linked' }
    }
    return { id: existing.id, title: existing.title, status: 'duplicate' }
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
      fileHash,
      fileName: file.name,
    })
    return { id, title, status: 'added' }
  } finally {
    destroy()
  }
}

export function isPdfFile(file) {
  if (!file) return false
  if (file.type === 'application/pdf') return true
  return /\.pdf$/i.test(file.name || '')
}
