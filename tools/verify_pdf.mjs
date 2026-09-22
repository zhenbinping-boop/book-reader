/** 在 Node 里验证 pdf.js v6 的解析链路与生成的示例 PDF 是否有效。
 *  用法：node tools/verify_pdf.mjs
 */

import fs from 'node:fs'

const URL = 'D:/book-reader/samples/sample.pdf'

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => import('pdfjs-dist'))

const data = new Uint8Array(fs.readFileSync(URL))
const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false })
const pdf = await loadingTask.promise

console.log('numPages:', pdf.numPages)

console.log('--- API surface ---')
console.log('pdf.destroy:', typeof pdf.destroy)
console.log('loadingTask.destroy:', typeof loadingTask.destroy)
console.log('pdf.cleanup:', typeof pdf.cleanup)
console.log('pdf.getPageIndex:', typeof pdf.getPageIndex)

async function destToPageIndex(dest) {
  let d = dest
  if (typeof d === 'string') d = await pdf.getDestination(d)
  if (!Array.isArray(d) || d.length === 0) return null
  const head = d[0]
  if (typeof head === 'number') return head
  if (head && typeof head === 'object') return await pdf.getPageIndex(head)
  return null
}

const outline = await pdf.getOutline()
console.log('outline roots:', outline?.length ?? 0)

async function walk(items, depth) {
  for (const item of items) {
    const idx = await destToPageIndex(item.dest)
    console.log('  '.repeat(depth) + `- ${item.title}  => page ${idx === null ? '?' : idx + 1}`)
    if (item.items?.length) await walk(item.items, depth + 1)
  }
}
if (outline?.length) await walk(outline, 0)

const page = await pdf.getPage(1)
const vp = page.getViewport({ scale: 1 })
console.log('page1 size:', Math.round(vp.width), 'x', Math.round(vp.height))

const text = await page.getTextContent()
console.log('page1 text sample:', text.items.slice(0, 3).map((i) => i.str).join(' | '))

const meta = await pdf.getMetadata()
console.log('embedded title:', JSON.stringify(meta?.info?.Title ?? null))

// 验证「同一 buffer 不能复用」这个坑：第二次解析必须用新的 buffer
const task2 = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(URL)) })
const again = await task2.promise
console.log('reopen ok, pages:', again.numPages)

await task2.destroy()
await loadingTask.destroy()
console.log('\nALL CHECKS PASSED')
