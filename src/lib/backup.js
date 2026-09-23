import { db } from '../db'

/**
 * 备份 / 恢复。
 *
 * 定位：进度、笔记、高亮全在浏览器 IndexedDB 里，而 iOS Safari 对长期不访问的
 * 站点有清理策略 —— 一旦清了不可恢复。所以这里提供「导出成文件」这条唯一的
 * 逃生通道，导出的是**纯本地文件**，不经过任何网络。
 *
 * 恢复的核心难点是「书 id 会变」：备份里的 bookId 是导出那台设备上的主键，
 * 换台设备重新导入同一个 PDF 会拿到新 id，笔记就成了孤儿。
 * 因此用**文件内容指纹 fileHash** 做关联，而不是用 id。
 */

export const BACKUP_APP = 'book-reader'
export const BACKUP_SCHEMA_VERSION = 1

/* ---------------- 工具 ---------------- */

function hex(bytes) {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  const CHUNK = 0x8000
  let s = ''
  for (let i = 0; i < buf.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

function base64ToBlob(b64, type) {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return new Blob([buf], { type: type || 'application/octet-stream' })
}

export function formatBytes(n) {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 立刻 revoke 会让部分浏览器取消下载，留一点余量
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/* ---------------- 文件指纹 ---------------- */

/**
 * 算内容指纹，用来把笔记/进度对回书上。
 *
 * 优先 SHA-256。但**非安全上下文没有 crypto.subtle** —— 用手机的局域网地址
 * （http://192.168.x.x:5173）打开开发服务器就是这种情况，所以必须有回退：
 * 退化成「长度 + 首尾各 1MB 的 FNV-1a」。两种指纹前缀不同，不会互相误匹配。
 */
export async function fileFingerprint(fileOrBlob) {
  const size = fileOrBlob.size || 0
  if (globalThis.crypto?.subtle?.digest) {
    try {
      const buf = await fileOrBlob.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', buf)
      return 'sha256:' + hex(new Uint8Array(digest))
    } catch {
      /* 落到下面的回退实现 */
    }
  }
  const SAMPLE = 1024 * 1024
  const head = new Uint8Array(await fileOrBlob.slice(0, SAMPLE).arrayBuffer())
  const tail = new Uint8Array(
    await fileOrBlob.slice(Math.max(0, size - SAMPLE), size).arrayBuffer()
  )
  let h = 0x811c9dc5
  for (const b of head) {
    h ^= b
    h = Math.imul(h, 0x01000193)
  }
  for (const b of tail) {
    h ^= b
    h = Math.imul(h, 0x01000193)
  }
  return `fnv1a:${size.toString(16)}:${(h >>> 0).toString(16)}`
}

/**
 * 给还没有指纹的书补算（v2 之前导入的书都没有）。
 * 只读本地 blob，不联网。返回补算成功的本数。
 */
export async function backfillHashes(onTick) {
  const books = await db.books.toArray()
  let done = 0
  for (let i = 0; i < books.length; i++) {
    const b = books[i]
    if (!b.fileHash) {
      const row = await db.blobs.get(b.id)
      if (row?.blob) {
        try {
          await db.books.update(b.id, { fileHash: await fileFingerprint(row.blob) })
          done++
        } catch {
          /* 单个文件算不动就跳过，不阻塞其他书 */
        }
      }
    }
    onTick?.(i + 1, books.length)
  }
  return done
}

/* ---------------- 存储状态 ---------------- */

export async function storageInfo() {
  const out = { usage: 0, quota: 0, persisted: null, supported: false }
  if (navigator.storage?.estimate) {
    out.supported = true
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate()
      out.usage = usage
      out.quota = quota
    } catch {
      /* 拿不到就显示 0，不影响导出 */
    }
  }
  if (navigator.storage?.persisted) {
    try {
      out.persisted = await navigator.storage.persisted()
    } catch {
      /* 忽略 */
    }
  }
  return out
}

/**
 * 申请「持久化存储」。批下来后浏览器不会在存储紧张时清掉本站数据，
 * 是比备份更前置的一道保险（Safari 支持有限，仍要配合导出）。
 */
export async function requestPersistent() {
  if (!navigator.storage?.persist) return null
  try {
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

/* ---------------- 导出 ---------------- */

export async function buildBackup({ includeFiles = false } = {}) {
  const books = await db.books.toArray()
  const files = []
  if (includeFiles) {
    for (const b of books) {
      const row = await db.blobs.get(b.id)
      if (!row?.blob) continue
      files.push({
        bookId: b.id,
        name: b.fileName || `${b.title}.pdf`,
        type: row.blob.type || 'application/pdf',
        data: await blobToBase64(row.blob),
      })
    }
  }
  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    includeFiles,
    books: books.map((b) => ({
      id: b.id,
      title: b.title,
      format: b.format,
      pageCount: b.pageCount ?? 0,
      cover: b.cover ?? null,
      fileHash: b.fileHash ?? null,
      fileName: b.fileName ?? null,
      addedAt: b.addedAt ?? null,
      lastReadAt: b.lastReadAt ?? null,
    })),
    progress: await db.progress.toArray(),
    highlights: await db.highlights.toArray(),
    bookmarks: await db.bookmarks.toArray(),
    files,
  }
}

/**
 * 导出并触发下载。返回摘要供 UI 展示。
 * 注意：大文件（几十 MB 的 PDF）转 base64 会明显吃内存，所以 includeFiles 是显式选项。
 */
export async function exportBackup({ includeFiles = false } = {}) {
  await backfillHashes()
  const data = await buildBackup({ includeFiles })
  const text = JSON.stringify(data, null, 2)
  const blob = new Blob([text], { type: 'application/json' })
  const filename = `book-reader-backup-${stamp()}.json`
  downloadBlob(blob, filename)
  return {
    filename,
    bytes: blob.size,
    books: data.books.length,
    highlights: data.highlights.length,
    progress: data.progress.length,
    files: data.files.length,
  }
}

/* ---------------- 单本书的笔记导出 ---------------- */

export function notesToMarkdown(book, highlights, opts = {}) {
  // TXT / EPUB 的高亮是按章存的（page = 章序号），导出时标题也要跟着换单位
  const unit = opts.unit ?? '页'
  const list = [...(highlights || [])].sort(
    (a, b) =>
      a.page - b.page ||
      (a.start?.item ?? 0) - (b.start?.item ?? 0) ||
      (a.start?.offset ?? 0) - (b.start?.offset ?? 0)
  )
  const marks = [...(opts.bookmarks || [])].sort(
    (a, b) => a.page - b.page || (a.charOffset ?? 0) - (b.charOffset ?? 0)
  )
  const lines = [`# ${book?.title ?? '未命名'}`, '', `> 导出时间：${new Date().toLocaleString('zh-CN')}`, '']
  if (!list.length && !marks.length) {
    lines.push('_这本书还没有笔记，也没有书签。_', '')
    return lines.join('\n')
  }
  if (list.length) {
    lines.splice(2, 0, `> 共 ${list.length} 条高亮`)
    let lastPage = -1
    for (const h of list) {
      if (h.page !== lastPage) {
        lines.push('', `## 第 ${h.page + 1} ${unit}`, '')
        lastPage = h.page
      }
      const text = String(h.text ?? '').replace(/\s*\n\s*/g, ' ').trim()
      lines.push(`- ${text}`)
      if (h.note) lines.push(`  - 备注：${h.note}`)
    }
    lines.push('')
  }
  // 书签单独一段：它不是「划出来的笔记」，混在正文条目里会让人以为也是高亮
  if (marks.length) {
    lines.push('', `## 书签（${marks.length} 条）`, '')
    for (const b of marks) {
      const title = b.label ? ` · ${b.label}` : ''
      lines.push(`- 第 ${b.page + 1} ${unit}${title}`)
      const snip = String(b.snippet ?? '').replace(/\s*\n\s*/g, ' ').trim()
      if (snip) lines.push(`  - ${snip}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export function exportNotes(book, highlights, opts = {}) {
  const md = notesToMarkdown(book, highlights, opts)
  const safe = String(book?.title ?? 'notes').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
  const filename = `${safe}-笔记-${stamp()}.md`
  downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), filename)
  return { filename, count: highlights?.length ?? 0, bytes: md.length }
}

/* ---------------- 恢复 ---------------- */

export function parseBackup(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('不是有效的 JSON 文件')
  }
  if (!data || typeof data !== 'object') throw new Error('备份内容为空')
  if (data.app !== BACKUP_APP) throw new Error('这不是阅读器导出的备份文件')
  if (!Array.isArray(data.books)) throw new Error('备份文件缺少 books 字段')
  if (data.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(`备份版本（${data.schemaVersion}）比当前版本新，请先更新应用`)
  }
  return data
}

const markKey = (h) =>
  `${h.bookId}|${h.page}|${h.start?.item}|${h.start?.offset}|${h.end?.item}|${h.end?.offset}`

/**
 * 书签的去重键必须带 charOffset：TXT / EPUB 里同一章可以有好几个书签
 * （章内不同位置），只按 page 去重会让它们互相顶掉，恢复后只剩一个。
 */
const bookmarkKey = (b) => `${b.bookId}|${b.page}|${b.charOffset ?? 0}`

/**
 * 按指纹合并恢复。**不覆盖、不清库**，只做加法：
 * - 指纹命中已有书 → 把笔记/进度并进去
 * - 命中不了（书还没重新导入）→ 建一条「缺文件」记录，等重新导入同一个 PDF 时自动接回
 * - 已存在的高亮按位置去重，不产生重复
 */
export async function restoreBackup(data) {
  const report = {
    addedBooks: 0,
    mergedBooks: 0,
    progress: 0,
    highlights: 0,
    skippedHighlights: 0,
    bookmarks: 0,
    files: 0,
    orphanTitles: [],
  }

  const localBooks = await db.books.toArray()
  const byHash = new Map()
  for (const b of localBooks) if (b.fileHash) byHash.set(b.fileHash, b)

  const fileBookIds = new Set((data.files || []).map((f) => Number(f.bookId)))
  const idMap = new Map()

  for (const b of data.books) {
    let target = b.fileHash ? byHash.get(b.fileHash) : null

    // 老备份（没有指纹）退化成「同 id 且同标题」判定，命中不了就当新书
    if (!target && !b.fileHash) {
      const same = await db.books.get(Number(b.id))
      if (same && same.title === b.title) target = same
    }

    if (target) {
      const patch = {}
      if (b.cover && !target.cover) patch.cover = b.cover
      if (b.fileHash && !target.fileHash) patch.fileHash = b.fileHash
      if (b.fileName && !target.fileName) patch.fileName = b.fileName
      if (b.pageCount && !target.pageCount) patch.pageCount = b.pageCount
      if (Object.keys(patch).length) await db.books.update(target.id, patch)
      report.mergedBooks++
    } else {
      const id = await db.books.add({
        title: b.title || '未命名',
        format: b.format || 'pdf',
        pageCount: b.pageCount ?? 0,
        cover: b.cover ?? null,
        fileHash: b.fileHash ?? null,
        fileName: b.fileName ?? null,
        missingFile: !fileBookIds.has(Number(b.id)),
        addedAt: b.addedAt ?? Date.now(),
        lastReadAt: b.lastReadAt ?? Date.now(),
      })
      target = { id }
      report.addedBooks++
      if (!b.fileHash) report.orphanTitles.push(b.title || '未命名')
    }
    idMap.set(Number(b.id), target.id)
  }

  // 进度：同一本书谁的时间戳新用谁，避免把刚读的位置倒退回去。
  // 例外：刚导入的书会带一条「没读过」的占位进度（started === false），
  // 它的时间戳是最新的，但内容是空的，不能让它顶掉备份里真正读到的位置。
  for (const p of data.progress || []) {
    const bid = idMap.get(Number(p.bookId))
    if (!bid) continue
    const prev = await db.progress.get(bid)
    const prevIsReal = prev && prev.started !== false
    if (prevIsReal && (prev.updatedAt ?? 0) > (p.updatedAt ?? 0)) continue
    await db.progress.put({ ...p, bookId: bid, started: true })
    report.progress++
  }

  // 高亮：按位置去重
  const seen = new Set((await db.highlights.toArray()).map(markKey))
  for (const h of data.highlights || []) {
    const bid = idMap.get(Number(h.bookId))
    if (!bid) continue
    const row = { ...h, bookId: bid }
    delete row.id
    if (seen.has(markKey(row))) {
      report.skippedHighlights++
      continue
    }
    seen.add(markKey(row))
    await db.highlights.add({ color: 'yellow', note: '', ...row })
    report.highlights++
  }

  // 书签：按「章/页 + 章内偏移」去重（同一章可以有多个书签）
  const seenMarks = new Set((await db.bookmarks.toArray()).map(bookmarkKey))
  for (const bm of data.bookmarks || []) {
    const bid = idMap.get(Number(bm.bookId))
    if (!bid) continue
    const row = { ...bm, bookId: bid }
    delete row.id
    if (seenMarks.has(bookmarkKey(row))) continue
    seenMarks.add(bookmarkKey(row))
    await db.bookmarks.add(row)
    report.bookmarks++
  }

  // 原文件（备份里带了才恢复）
  for (const f of data.files || []) {
    const bid = idMap.get(Number(f.bookId))
    if (!bid) continue
    await db.blobs.put({ id: bid, blob: base64ToBlob(f.data, f.type) })
    await db.books.update(bid, { missingFile: false })
    report.files++
  }

  return report
}

export async function readBackupFile(file) {
  const text = await file.text()
  return parseBackup(text)
}
