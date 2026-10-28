import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowRight, BookOpen, FolderOpen, MoreVertical, Plus, Search, X } from 'lucide-react'
import { isSupportedFile } from '../lib/importer'
import { goRead } from '../hooks/useHashRoute'
import { filterLibrary, progressPercent, readingState } from '../lib/library'
import { AppNavigation, IconButton, Seal } from './InkUI'
import BookCover from './BookCover'
import BookDetailsDialog from './BookDetailsDialog'
import LibraryNotes from './LibraryNotes'
import LibrarySettings from './LibrarySettings'
import FindBooks from './FindBooks'
import useBackClose from '../hooks/useBackClose'

export const FORMATS = [
  { key: 'pdf', label: 'PDF', tip: '固定版式', accept: '.pdf,application/pdf' },
  { key: 'txt', label: 'TXT', tip: '纯文本', accept: '.txt,.text,text/plain,application/octet-stream' },
  { key: 'epub', label: 'EPUB', tip: '电子书', accept: '.epub,application/epub+zip,application/octet-stream' },
]
const ALL_ACCEPT = FORMATS.map(f => f.accept).join(',')

export default function Shelf({ books, onImport, onDelete, onOpenBackup, onBooksChanged, page = 'shelf' }) {
  const [over, setOver] = useState(false)
  const [adding, setAdding] = useState(false)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [collection, setCollection] = useState('')
  const [editing, setEditing] = useState(null)
  const inputRef = useRef(null)
  useBackClose(adding, () => setAdding(false), 'import')
  useBackClose(!!editing, () => setEditing(null), 'book-details')

  const pick = list => {
    const files = Array.from(list || []).filter(isSupportedFile)
    if (files.length) { onImport(files); closeAdd() }
  }
  const closeAdd = () => { setAdding(false); if (inputRef.current) inputRef.current.accept = ALL_ACCEPT }
  const openPicker = accept => { inputRef.current.accept = accept || ALL_ACCEPT; inputRef.current.click() }
  const visible = filterLibrary(books, { query, status, collection })
  const groups = [...new Set(books.map(b => b.collection).filter(Boolean))].sort()
  const recent = [...books].filter(b => !b.missingFile && b.progress?.started === true && readingState(b) !== 'finished')
    .sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0))[0]
  const titles = { shelf: '我的书架', discover: '寻书', notes: '读书笔记', settings: '设置' }

  return <div className={`app ink-shell page-${page}`}>
    <div className="ink-page-backdrop" aria-hidden="true" />
    <header className="topbar ink-topbar">
      <a className="desktop-wordmark" href="#/" aria-label="芸窗首页">芸窗<Seal /></a>
      <div className="page-heading"><h1>{titles[page] || titles.shelf}</h1><Seal /></div>
      <div className="header-actions">
        {page === 'shelf' && <IconButton label="搜索书架" onClick={() => setSearching(v => !v)}><Search size={23} strokeWidth={1.6} /></IconButton>}
        <div className="add-bar">
          <button className="add-toggle icon-button" aria-label="添加图书" aria-expanded={adding} data-open={adding ? '1' : '0'} onClick={() => adding ? closeAdd() : setAdding(true)}>
            <Plus size={26} strokeWidth={1.5} /><span className="sr-only">＋添加图书▾</span>
          </button>
          {adding && <div className="add-formats ink-import-menu">
            <h2>添一卷新书</h2>
            <button className="btn online-import-entry" onClick={() => { closeAdd(); location.hash = '#/discover' }}><b>寻书</b><span>在书源网站找书</span><ArrowRight size={15} /></button>
            {FORMATS.map(f => <button className="fmt-btn" key={f.key} data-fmt={f.key} onClick={() => openPicker(f.accept)}><b>{f.label}</b><span>{f.tip}</span><ArrowRight size={15} /></button>)}
            <div className="add-hint">也可以把文件直接拖进书架</div>
          </div>}
        </div>
      </div>
    </header>
    {adding && <button className="import-dismiss" aria-label="关闭导入菜单" onClick={closeAdd} />}
    <input ref={inputRef} type="file" accept={ALL_ACCEPT} multiple hidden onChange={e => { pick(e.target.files); e.target.value = '' }} />
    <main className="ink-main" id="main-content">
      {page === 'settings' ? <LibrarySettings onPickFile={format => openPicker(FORMATS.find(f => f.key === format)?.accept)} onOpenBackup={onOpenBackup} /> :
        page === 'notes' ? <LibraryNotes books={books} /> :
        page === 'discover' ? <FindBooks /> :
        <div className="shelf" onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer?.files) }}>
          <AnimatePresence initial={false}>{searching && <motion.div className="library-search" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <Search size={19} /><input autoFocus type="search" aria-label="搜索书名、作者或分组" placeholder="寻一卷好书…" value={query} onChange={e => setQuery(e.target.value)} /><IconButton label="关闭搜索" onClick={() => { setSearching(false); setQuery('') }}><X size={17} /></IconButton>
          </motion.div>}</AnimatePresence>
          {!query && !collection && status === 'all' && <motion.section className={`continue-reading ${recent ? '' : 'welcome-reading'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {recent ? <>
              <button className="continue-cover" aria-label={`继续阅读《${recent.title}》`} onClick={() => goRead(recent.id)}><BookCover book={recent} /></button>
              <div className="continue-content"><span className="eyebrow">继续阅读</span><h2>{recent.title}</h2><p className="continue-author">{recent.author || '我的私人藏书'}</p><p className="continue-progress">已读 {progressPercent(recent)}%<span> · {recent.format?.toUpperCase()}</span></p><button className="btn btn-primary continue-button" onClick={() => goRead(recent.id)}>继续阅读<ArrowRight size={16} /></button></div>
            </> : <div className="welcome-copy"><span className="eyebrow">一卷在手，心有所栖</span><h2>{books.length ? '好书，值得慢慢读。' : '把日子，读成诗。'}</h2><p>{books.length ? `案上已有 ${books.length} 卷，择一卷启读。` : '将喜欢的书，收进自己的书房。'}</p><button className="btn btn-primary" onClick={() => openPicker()}><Plus size={16} />{books.length ? '添一卷新书' : '导入第一本书'}</button></div>}
          </motion.section>}
          <div className="library-filters" aria-label="按阅读状态筛选">
            {[['all', '全部'], ['reading', '在读'], ['unread', '待读'], ['finished', '已读']].map(([id, label]) => <button key={id} aria-pressed={status === id} className={status === id ? 'selected' : ''} onClick={() => setStatus(id)}>{label}</button>)}
          </div>
          {groups.length > 0 && <div className="collection-filter"><FolderOpen size={15} /><select aria-label="选择书籍分组" value={collection} onChange={e => setCollection(e.target.value)}><option value="">全部分组</option>{groups.map(g => <option key={g}>{g}</option>)}</select><span>{visible.length} 卷藏书</span></div>}
          {over && <div className="dropzone over"><BookOpen /><strong>松手就导入</strong>PDF、TXT、EPUB 都行</div>}
          {visible.length === 0 ? <div className="empty ink-empty"><BookOpen size={36} strokeWidth={1} /><h2>{books.length ? '此处，尚无书卷' : '书房待启，静候佳作'}</h2><p>{books.length ? '换个筛选条件，或将喜欢的书移入这个分组。' : '还没有书，导入 PDF、TXT 或 EPUB，开启第一段阅读。'}</p>{!books.length && <button className="btn" onClick={() => openPicker()}>添加图书</button>}</div> :
            <div className="grid ink-book-grid">{visible.map((b, i) => <motion.article className="card ink-book-card" key={b.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28, delay: Math.min(i, 7) * .035 }}>
              <button className="cover" aria-label={`阅读《${b.title}》`} onClick={() => goRead(b.id)}><BookCover book={b} />{b.missingFile && <span className="cover-flag">需重新导入</span>}</button>
              <div className="card-body"><div className="book-title-row"><button className="card-title" onClick={() => goRead(b.id)}>{b.title}</button><span className={`format-badge badge-${b.format}`}>{b.format?.toUpperCase() || 'PDF'}</span><button className="book-menu" aria-label={`整理《${b.title}》`} title="整理藏书" onClick={() => setEditing(b)}><MoreVertical size={17} /></button></div>
                <div className="card-meta"><span>{b.missingFile ? '笔记已保留' : `${b.format === 'pdf' ? `${b.pageCount} 页` : `${b.pageCount} ${b.format === 'epub' ? '节' : '章'}`}${b.author ? ` · ${b.author}` : ''}${b.progress?.started ? `｜已读 ${progressPercent(b)}%` : ''}`}</span></div>
                {b.progress?.started && <div className="bar" aria-label={`已读 ${progressPercent(b)}%`}><i style={{ width: `${progressPercent(b)}%` }} /></div>}
              </div>
            </motion.article>)}</div>}
          {books.length > 0 && <p className="library-endmark"><span />书香自有来处<span /></p>}
        </div>}
    </main>
    <AppNavigation page={page} />
    {editing && <BookDetailsDialog book={editing} onClose={() => setEditing(null)} onSaved={onBooksChanged} onDelete={onDelete} />}
  </div>
}
