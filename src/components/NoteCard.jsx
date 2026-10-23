import { useState } from 'react'
import { CornerUpLeft, PencilLine, Save, Trash2 } from 'lucide-react'
import { updateHighlight } from '../db'
import { normalizeNote } from '../lib/library'

export default function NoteCard({ highlight: h, label, bookTitle, onJump, onDelete, onSaved, autoEdit = false }) {
  const [editing, setEditing] = useState(autoEdit)
  const [text, setText] = useState(h.note || '')
  const [tags, setTags] = useState((h.tags || []).join('，'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async e => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const patch = normalizeNote(text, tags)
      if (!await updateHighlight(h.id, patch)) throw new Error('这条摘录已被删除')
      onSaved?.({ ...h, ...patch }); setEditing(false)
    } catch (e) { setError(e.message || '保存失败，请重试') } finally { setBusy(false) }
  }
  const edit = () => { setText(h.note || ''); setTags((h.tags || []).join('，')); setEditing(true) }
  return <article className="note-item ink-note-card" data-note={h.id} data-color={h.color || 'yellow'}>
    <button className="note-main" onClick={() => onJump(h)}>
      <span className="note-text" data-color={h.color}>{h.text}</span>
    </button>
    {editing ? <form className="note-editor" onSubmit={save}>
      <label>我的想法<textarea autoFocus maxLength={10000} value={text} onChange={e => setText(e.target.value)} placeholder="写下此刻的感想…" /></label>
      <label className="note-tags-label">标签<input value={tags} onChange={e => setTags(e.target.value)} placeholder="用逗号分隔，如：生活、读书" /></label>
      {error && <p className="modal-error" role="alert">{error}</p>}
      <div className="note-edit-actions"><button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>取消</button><button className="btn btn-sm btn-primary" disabled={busy}><Save size={13} />{busy ? '保存中…' : '保存'}</button></div>
    </form> : <>
      {h.note && <p className="note-thought">{h.note}</p>}
      {h.tags?.length > 0 && <div className="note-tags">{h.tags.map(t => <span key={t}>{t}</span>)}</div>}
    </>}
    <footer><button className="note-source" onClick={() => onJump(h)}><span>{bookTitle && `${bookTitle} · `}<span className="note-pg">{label}</span></span><CornerUpLeft size={14} /></button>
      <div className="note-actions"><button onClick={edit} aria-label="编辑笔记" title="编辑笔记"><PencilLine size={15} /></button><button className="note-del" onClick={() => onDelete(h.id)} aria-label="删除这条高亮" title="删除这条高亮"><Trash2 size={14} /></button></div>
    </footer>
  </article>
}
