import { useState } from 'react'
import { db } from '../db'
import { BOOK_STATES, normalizeBookDetails, readingState, coverVariant } from '../lib/library'
import { InkDialog } from './InkUI'

export default function BookDetailsDialog({ book, onClose, onSaved, onDelete }) {
  const [draft, setDraft] = useState({ title: book.title, author: book.author || '',
    collection: book.collection || '', readingStatus: readingState(book), artCover: !!book.artCover, coverStyle: coverVariant(book) })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const field = (key, value) => setDraft(d => ({ ...d, [key]: value }))
  const save = async e => {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const patch = normalizeBookDetails(draft)
      await db.transaction('rw', db.books, async () => {
        if (!await db.books.get(book.id)) throw new Error('这本书已被删除')
        await db.books.update(book.id, patch)
      })
      onSaved?.(); onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <InkDialog title="整理藏书" onClose={onClose}>
    <form className="ink-form" onSubmit={save}>
      <label>书名<input required maxLength={160} value={draft.title} onChange={e => field('title', e.target.value)} /></label>
      <label>作者<input maxLength={100} value={draft.author} onChange={e => field('author', e.target.value)} placeholder="添加作者" /></label>
      <label>分组<input maxLength={30} value={draft.collection} onChange={e => field('collection', e.target.value)} placeholder="如：文学、专业书、待读书单" /></label>
      <label>阅读状态<select value={draft.readingStatus} onChange={e => field('readingStatus', e.target.value)}>
        {Object.entries(BOOK_STATES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      {book.cover && <label className="check-row"><input type="checkbox" checked={draft.artCover} onChange={e => field('artCover', e.target.checked)} />使用古风书封</label>}
      {(!book.cover || draft.artCover) && <label>书封样式<select value={draft.coverStyle} onChange={e => field('coverStyle', Number(e.target.value))}>{['青缎梅影', '竹影素笺', '远山淡墨', '碧落疏花'].map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label>}
      {error && <p className="modal-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="text-danger" onClick={() => { onClose(); onDelete(book) }}>删除图书</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? '保存中…' : '保存修改'}</button></div>
    </form>
  </InkDialog>
}
