import { openPdf, renderCover } from '../pdf/pdfService'
import { putBook } from '../db'

/**
 * 导入一个 PDF 文件。元数据优先用 PDF 内嵌标题，回退到文件名。
 * 文件本体直接存进 IndexedDB，不经过任何网络。
 */
export async function importPdf(file) {
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
    return await putBook({
      title,
      format: 'pdf',
      pageCount: doc.numPages,
      cover,
      blob: file,
    })
  } finally {
    destroy()
  }
}

export function isPdfFile(file) {
  if (!file) return false
  if (file.type === 'application/pdf') return true
  return /\.pdf$/i.test(file.name || '')
}
