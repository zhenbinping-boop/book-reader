export const BOOK_STATES = { unread: '待读', reading: '在读', finished: '已读' }

export function readingState(book) {
  if (Object.hasOwn(BOOK_STATES, book.readingStatus)) return book.readingStatus
  return book.progress?.started === true ? 'reading' : 'unread'
}

export function progressPercent(book) {
  if (readingState(book) === 'finished') return 100
  const p = book.progress
  if (!p || p.started === false || !book.pageCount || book.missingFile) return 0
  return Math.max(0, Math.min(100, Math.round((p.page / book.pageCount) * 100)))
}

export function filterLibrary(books, { query = '', status = 'all', collection = '' } = {}) {
  const q = query.trim().toLocaleLowerCase()
  return books.filter(b => (!q || [b.title, b.author, b.collection, b.fileName]
    .some(v => String(v || '').toLocaleLowerCase().includes(q))) &&
    (status === 'all' || readingState(b) === status) && (!collection || b.collection === collection))
}

export function normalizeBookDetails(patch) {
  const title = String(patch.title ?? '').trim().slice(0, 160)
  if (!title) throw new Error('请填写书名')
  if (!Object.hasOwn(BOOK_STATES, patch.readingStatus)) throw new Error('请选择阅读状态')
  return { title, author: String(patch.author ?? '').trim().slice(0, 100),
    collection: String(patch.collection ?? '').trim().slice(0, 30),
    readingStatus: patch.readingStatus, artCover: !!patch.artCover,
    ...(Number.isInteger(Number(patch.coverStyle)) && Number(patch.coverStyle) >= 0 && Number(patch.coverStyle) <= 3 ? { coverStyle: Number(patch.coverStyle) } : {}) }
}

export function normalizeNote(note, tags) {
  return { note: String(note ?? '').slice(0, 10000),
    tags: [...new Set((Array.isArray(tags) ? tags : String(tags ?? '').split(/[,，\s]+/))
      .map(t => String(t).trim().slice(0, 24)).filter(Boolean))].slice(0, 12) }
}

export function coverVariant(book) {
  if (Number.isInteger(book.coverStyle) && book.coverStyle >= 0 && book.coverStyle <= 3) return book.coverStyle
  // A stable cover survives restoring a backup with different database IDs.
  return [...String(book.fileHash || book.title || book.id)].reduce((n, c) => (n * 31 + c.codePointAt(0)) >>> 0, 0) % 4
}

export function restoredNotePatch(local, incoming) {
  if ((incoming.updatedAt || incoming.createdAt || 0) <= (local.updatedAt || local.createdAt || 0)) return null
  return { note: incoming.note || '', tags: Array.isArray(incoming.tags) ? incoming.tags : [],
    color: incoming.color || local.color || 'yellow', updatedAt: incoming.updatedAt || incoming.createdAt }
}
