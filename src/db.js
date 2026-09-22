import Dexie from 'dexie'

export const db = new Dexie('book-reader')

db.version(1).stores({
  // 书籍元数据。cover 是可直接用于 img src 的 dataURL
  books: '++id, format, addedAt, lastReadAt',
  // 原始文件二进制，id 与 books.id 一一对应
  blobs: 'id',
  // 阅读进度，主键是 bookId
  progress: 'bookId',
  // 书签
  bookmarks: '++id, bookId, page',
})

// v2：划词高亮 + 全文搜索的按页文本索引
db.version(2).stores({
  books: '++id, format, addedAt, lastReadAt',
  blobs: 'id',
  progress: 'bookId',
  bookmarks: '++id, bookId, page',
  // 高亮。page 是所在页（0 起），便于按页取用
  highlights: '++id, bookId, page, createdAt',
  // 按页纯文本，用于全文搜索（避免每次重新解析 PDF）
  textIndex: 'bookId',
})

/** 高亮可选颜色。顺序即 UI 中色块的排列顺序 */
export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink']

export async function putBook({ title, format, pageCount, cover, blob }) {
  const now = Date.now()
  const id = await db.books.add({
    title,
    format,
    pageCount: pageCount ?? 0,
    cover: cover ?? null,
    addedAt: now,
    lastReadAt: now,
  })
  await db.blobs.put({ id, blob })
  await db.progress.put({ bookId: id, page: 1, scaleMode: 'fit', zoom: 1, mode: 'scroll', updatedAt: now })
  return id
}

export async function getBook(id) {
  return db.books.get(Number(id))
}

export async function getBlob(id) {
  const row = await db.blobs.get(Number(id))
  return row?.blob ?? null
}

export async function listBooks() {
  const books = await db.books.orderBy('addedAt').reverse().toArray()
  const progress = await db.progress.toArray()
  const byBook = new Map(progress.map((p) => [p.bookId, p]))
  return books.map((b) => ({ ...b, progress: byBook.get(b.id) ?? null }))
}

export async function saveProgress(bookId, patch) {
  const prev = (await db.progress.get(Number(bookId))) ?? {}
  await db.progress.put({ ...prev, ...patch, bookId: Number(bookId), updatedAt: Date.now() })
  await db.books.update(Number(bookId), { lastReadAt: Date.now() })
}

export async function deleteBook(id) {
  const n = Number(id)
  await db.transaction(
    'rw',
    [db.books, db.blobs, db.progress, db.bookmarks, db.highlights, db.textIndex],
    async () => {
      await db.books.delete(n)
      await db.blobs.delete(n)
      await db.progress.delete(n)
      await db.bookmarks.where('bookId').equals(n).delete()
      await db.highlights.where('bookId').equals(n).delete()
      await db.textIndex.delete(n)
    }
  )
}

/* ---------- 高亮 ---------- */

/**
 * 一条高亮的位置用「文本项下标 + 项内字符偏移」表示：
 *   { page, start: { item, offset }, end: { item, offset } }
 * 同一 PDF 文件解析出的文本项顺序是稳定的，所以本地持久化够用。
 * text 冗余存一份，供笔记列表展示与将来导出。
 */
export async function listHighlights(bookId) {
  return db.highlights.where('bookId').equals(Number(bookId)).toArray()
}

export async function addHighlight(row) {
  return db.highlights.add({
    color: 'yellow',
    note: '',
    ...row,
    bookId: Number(row.bookId),
    createdAt: Date.now(),
  })
}

export async function updateHighlight(id, patch) {
  await db.highlights.update(Number(id), patch)
}

export async function deleteHighlight(id) {
  await db.highlights.delete(Number(id))
}

/* ---------- 全文搜索的文本索引 ---------- */

export async function getTextIndex(bookId) {
  const row = await db.textIndex.get(Number(bookId))
  return Array.isArray(row?.pages) ? row.pages : null
}

export async function putTextIndex(bookId, pages) {
  await db.textIndex.put({ bookId: Number(bookId), pages, updatedAt: Date.now() })
}
