import Dexie from 'dexie'

export const db = new Dexie('book-reader')

// 每个 version 的定义都要保留（Dexie 靠它们推导升级路径），不要删旧版本
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

// v3：books 加 fileHash（内容指纹）索引。
// 备份恢复后书 id 会变，只有靠指纹才能把笔记/进度重新对回书上；
// 顺带让「重新导入同一个 PDF」能接回原有笔记，而不是变成两本书。
db.version(3).stores({
  books: '++id, format, addedAt, lastReadAt, fileHash',
  blobs: 'id',
  progress: 'bookId',
  bookmarks: '++id, bookId, page',
  highlights: '++id, bookId, page, createdAt',
  textIndex: 'bookId',
})

/** 高亮可选颜色。顺序即 UI 中色块的排列顺序 */
export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink']

export async function putBook({
  title,
  author = '',
  format,
  pageCount,
  cover,
  blob,
  fileHash = null,
  fileName = null,
}) {
  const now = Date.now()
  const id = await db.books.add({
    title,
    // 只有 EPUB 有作者信息（来自 OPF 的 dc:creator），PDF / TXT 留空
    author,
    format,
    pageCount: pageCount ?? 0,
    cover: cover ?? null,
    fileHash,
    fileName,
    // 原文件丢失（如从备份恢复到一台还没重新导入文件的设备）时置 true
    missingFile: false,
    addedAt: now,
    lastReadAt: now,
  })
  await db.blobs.put({ id, blob })
  // started:false 表示「还没真正读过」的占位进度。
  // 备份恢复时要靠它区分：别让刚导入书的 page=1 顶掉备份里真正读到的位置。
  await db.progress.put({
    bookId: id,
    page: 1,
    scaleMode: 'fit',
    zoom: 1,
    mode: 'scroll',
    started: false,
    updatedAt: now,
  })
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
  // started:true —— 从这里写进来的都是真实阅读位置
  await db.progress.put({
    ...prev,
    ...patch,
    started: true,
    bookId: Number(bookId),
    updatedAt: Date.now(),
  })
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

/* ---------- 指纹相关 ---------- */

export async function findBookByHash(hash) {
  if (!hash) return null
  return (await db.books.where('fileHash').equals(hash).first()) ?? null
}

/** 给一本书补上原文件（重新导入时把文件接回已有记录） */
export async function attachBlob(bookId, blob, patch = {}) {
  const n = Number(bookId)
  await db.blobs.put({ id: n, blob })
  await db.books.update(n, { missingFile: false, ...patch })
}

/* ---------- 高亮 ---------- */

/**
 * 一条高亮的位置用「文本项下标 + 项内字符偏移」表示：
 *   { page, start: { item, offset }, end: { item, offset } }
 * 同一 PDF 文件解析出的文本项顺序是稳定的，所以本地持久化够用。
 * text 冗余存一份，供笔记列表展示与导出。
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

/* ---------- 书签 ---------- */

/**
 * 书签复用高亮那一套位置模型：
 *   { page, charOffset }
 * PDF 的 page 是**页序号（0 基）**、charOffset 恒为 0；TXT / EPUB 的 page 是章序号、
 * charOffset 是章内字符偏移（与进度锚点同源，所以换字号 / 旋屏后依然指得准）。
 * 形状统一之后，跳转、备份、恢复都不用为格式开分支。
 *
 * label / snippet 是**冗余的可读信息**（章标题、目标位置的文字开头），
 * 只为书签列表好看，不参与定位 —— 定位永远只看 page + charOffset。
 */
export async function listBookmarks(bookId) {
  const rows = await db.bookmarks.where('bookId').equals(Number(bookId)).toArray()
  return rows.sort((a, b) => a.page - b.page || (a.charOffset ?? 0) - (b.charOffset ?? 0))
}

export async function addBookmark(row) {
  return db.bookmarks.add({
    charOffset: 0,
    label: '',
    snippet: '',
    ...row,
    bookId: Number(row.bookId),
    createdAt: Date.now(),
  })
}

export async function deleteBookmark(id) {
  await db.bookmarks.delete(Number(id))
}

/* ---------- 全文搜索的文本索引 ---------- */

export async function getTextIndex(bookId) {
  const row = await db.textIndex.get(Number(bookId))
  return Array.isArray(row?.pages) ? row.pages : null
}

export async function putTextIndex(bookId, pages) {
  await db.textIndex.put({ bookId: Number(bookId), pages, updatedAt: Date.now() })
}
