import { useEffect, useMemo, useState } from 'react'
import { Download, NotebookPen, Search } from 'lucide-react'
import { db, deleteHighlight } from '../db'
import { downloadBlob, notesToMarkdown } from '../lib/backup'
import NoteCard from './NoteCard'

export default function LibraryNotes({ books }) {
  const [notes, setNotes] = useState([])
  const [query, setQuery] = useState('')
  const [bookId, setBookId] = useState('')
  const [tag, setTag] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { let alive = true; db.highlights.orderBy('createdAt').reverse().toArray().then(r => { if (alive) setNotes(r) }).catch(e => { if (alive) setError(e.message) }); return () => { alive = false } }, [])
  const byBook = useMemo(() => new Map(books.map(b => [b.id, b])), [books])
  const tags = [...new Set(notes.flatMap(n => n.tags || []))]
  const visible = notes.filter(n => byBook.has(n.bookId) && (!bookId || n.bookId === Number(bookId)) && (!tag || n.tags?.includes(tag)) &&
    (!query.trim() || [n.text, n.note, ...(n.tags || []), byBook.get(n.bookId)?.title].some(v => String(v || '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))))
  const update = n => setNotes(rows => rows.map(h => h.id === n.id ? n : h))
  const remove = async id => { try { await deleteHighlight(id); setNotes(rows => rows.filter(n => n.id !== id)) } catch (e) { setError(e.message) } }
  const jump = n => { window.location.hash = `#/read/${n.bookId}?note=${n.id}` }
  const exportAll = async () => {
    try {
      const grouped = [...new Set(visible.map(n => n.bookId))]
      const md = grouped.map(id => notesToMarkdown(byBook.get(id), visible.filter(n => n.bookId === id), { unit: byBook.get(id)?.format === 'pdf' ? '页' : '章' })).join('\n\n---\n\n')
      await downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), '我的读书笔记.md')
    } catch (e) { setError(e.message || '导出失败') }
  }
  return <section className="library-notes">
    <div className="notes-intro"><span className="eyebrow">字里行间，皆有所思</span><h2>留住读过的风景</h2><p>{notes.length ? `共 ${notes.length} 条摘录，散落在你的书卷之间。` : '在书中划下一段话，也为自己留下一点思考。'}</p></div>
    <div className="library-search"><Search size={18} /><input type="search" aria-label="搜索全部笔记" placeholder="搜索摘录、感想或标签…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="notes-bar"><select aria-label="按图书筛选笔记" value={bookId} onChange={e => setBookId(e.target.value)}><option value="">全部笔记</option>{books.filter(b => notes.some(n => n.bookId === b.id)).map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select><button className="btn btn-sm export-notes" onClick={exportAll} disabled={!visible.length}><Download size={14} />导出 Markdown</button></div>
    {tags.length > 0 && <div className="tag-filters"><button className={!tag ? 'selected' : ''} onClick={() => setTag('')}>全部标签</button>{tags.map(t => <button className={tag === t ? 'selected' : ''} key={t} onClick={() => setTag(tag === t ? '' : t)}>{t}</button>)}</div>}
    {error && <p className="modal-error" role="alert">{error}</p>}
    {visible.length ? <div className="global-notes-grid">{visible.map(n => <NoteCard key={n.id} highlight={n} label={`第 ${n.page + 1} ${byBook.get(n.bookId)?.format === 'pdf' ? '页' : byBook.get(n.bookId)?.format === 'epub' ? '节' : '章'}`} bookTitle={byBook.get(n.bookId)?.title} onJump={jump} onDelete={remove} onSaved={update} />)}</div> : <div className="ink-empty"><NotebookPen size={38} strokeWidth={1} /><h2>{query || bookId || tag ? '未寻得相应笔记' : '读过的好句，值得珍藏'}</h2><p>{query || bookId || tag ? '试试其他关键词或筛选条件。' : '打开一本书，长按划选文字，即可留下第一条摘录。'}</p></div>}
  </section>
}
