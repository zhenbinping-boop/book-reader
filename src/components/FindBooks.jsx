import { useEffect, useState, useSyncExternalStore } from 'react'
import { ArrowRight, BookOpen, Check, Compass, Download, Globe, History, Plus, RotateCw, Trash2, X } from 'lucide-react'
import { IconButton, InkDialog, SectionTitle } from './InkUI'
import useBackClose from '../hooks/useBackClose'
import { goRead } from '../hooks/useHashRoute'
import { DEFAULT_BOOK_SOURCES, cleanBookSource, loadBookHistory, loadBookSources, saveBookSources } from '../lib/bookSources'
import { bookBrowserAvailability, bookDownloadInbox, openBookBrowser } from '../lib/bookBrowser'

function statusText(row) {
  if (row.status === 'completed') return row.resultStatus === 'duplicate' ? '已在书架' : row.resultStatus === 'linked' ? '文件已接回' : '已加入书架'
  return { downloading: '正在下载', downloaded: '等待入库', importing: '正在整理书籍', failed: '未能完成', interrupted: '下载已中断' }[row.status] || '等待处理'
}

function byteSize(value) {
  if (!value) return ''
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`
}

export default function FindBooks({ inbox = bookDownloadInbox, availability = bookBrowserAvailability, openBrowser = openBookBrowser } = {}) {
  const [sources, setSources] = useState(loadBookSources)
  const [history, setHistory] = useState(loadBookHistory)
  const [address, setAddress] = useState('')
  const [adding, setAdding] = useState(false)
  const [sourceName, setSourceName] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [opening, setOpening] = useState(false)
  const [message, setMessage] = useState('')
  const rows = useSyncExternalStore(inbox.subscribe, inbox.getSnapshot)
  const available = availability() === 'available'
  useBackClose(adding, () => setAdding(false), 'book-source')
  useEffect(() => {
    const changed = () => setHistory(loadBookHistory())
    window.addEventListener('reader:book-history', changed)
    inbox.initialize().catch(error => setMessage(error.message))
    return () => window.removeEventListener('reader:book-history', changed)
  }, [inbox])

  const visit = async url => {
    setMessage('')
    setOpening(true)
    try { await openBrowser(url) } catch (error) { setMessage(error.message || '网页未能打开，请稍后重试') }
    finally { setOpening(false) }
  }
  const addSource = event => {
    event.preventDefault()
    try {
      if (sources.length >= 30) throw new Error('最多收藏 30 个书源，请先移除不再使用的书源')
      const source = cleanBookSource({ name: sourceName, url: sourceUrl })
      if ([...DEFAULT_BOOK_SOURCES, ...sources].some(row => row.url === source.url)) throw new Error('这个书源已经在列表里了')
      const next = [...sources, source]
      saveBookSources(next)
      setSources(next); setAdding(false); setSourceName(''); setSourceUrl(''); setMessage('书源已收藏')
    } catch (error) { setMessage(error.message || '书源保存失败') }
  }
  const removeSource = id => {
    try { const next = sources.filter(row => row.id !== id); saveBookSources(next); setSources(next) }
    catch { setMessage('书源保存失败，请稍后重试') }
  }
  const action = operation => operation.catch(error => setMessage(error.message || '操作未完成，请重试'))

  return <div className="find-books">
    <section className="find-intro"><span className="eyebrow">循着书香，遇见下一卷</span><h2>天地间，还有许多好书。</h2><p>在书源里慢慢寻，下载后便收进自己的书房。</p></section>
    {!available && <p className="find-platform-note" role="status">{availability() === 'web' ? '内置浏览器和自动收书需要手机原生安装版。此网页仍可使用原有的本地导入。' : '当前安装包尚未包含内置浏览器，请更新到支持寻书的版本。'}</p>}
    <form className="find-address" onSubmit={event => { event.preventDefault(); visit(address) }}>
      <Globe size={19} aria-hidden="true" /><input aria-label="书源网址" placeholder="输入书源网址…" value={address} onChange={event => setAddress(event.target.value)} autoCapitalize="none" autoCorrect="off" inputMode="url" spellCheck={false} />
      <button className="btn btn-primary" type="submit" disabled={!available || opening || !address.trim()}><span>前往</span><ArrowRight size={16} /></button>
    </form>
    <section className="find-section"><SectionTitle aside={<button className="find-add-source" onClick={() => { setMessage(''); setAdding(true) }}><Plus size={16} />收藏书源</button>}>书源</SectionTitle>
      <div className="book-source-grid">{[...DEFAULT_BOOK_SOURCES, ...sources].map(source => <article className="book-source" key={source.id}>
        <button className="book-source-open" disabled={!available || opening} onClick={() => visit(source.url)} aria-label={`在内置浏览器打开${source.name}`}>
          <span className="book-source-mark" aria-hidden="true">{source.mark}</span><span className="book-source-copy"><strong>{source.name}</strong><small>{source.description}</small><span>{new URL(source.url).hostname}</span></span><ArrowRight size={17} />
        </button>
        {sources.some(row => row.id === source.id) && <IconButton label={`移除书源${source.name}`} className="icon-button book-source-remove" onClick={() => removeSource(source.id)}><X size={15} /></IconButton>}
      </article>)}</div>
      <p className="find-help">选择网站后，在网页内搜索书名。支持收取 EPUB、PDF、TXT；网站可达性和书籍格式以实际页面为准。</p>
    </section>
    <section className="find-section"><SectionTitle aside={<span className="find-section-count">{rows.length ? `${rows.length} 条` : ''}</span>}>下载与入库</SectionTitle>
      {rows.length === 0 ? <div className="find-download-empty"><Download size={25} strokeWidth={1.3} /><div><strong>好书，下载后就会来到这里</strong><p>文件下载完成后自动整理入库，并检查是否已经收藏。</p></div></div> : <ul className="book-download-list" aria-label="下载与入库记录">{rows.map(row => {
        const busy = ['downloading', 'downloaded', 'importing'].includes(row.status)
        const done = row.status === 'completed'
        const percent = row.totalBytes > 0 ? Math.min(100, Math.floor((row.receivedBytes || 0) / row.totalBytes * 100)) : undefined
        return <li className={`book-download status-${row.status}`} key={row.id}>
          <span className="book-download-symbol" aria-hidden="true">{done ? <Check size={20} /> : busy ? <Download size={20} /> : <RotateCw size={20} />}</span>
          <div className="book-download-copy"><strong>{row.title || row.fileName}</strong><span className="download-state" role="status">{statusText(row)}{row.receivedBytes > 0 && !done ? ` · ${byteSize(row.receivedBytes)}${row.totalBytes > 0 ? ` / ${byteSize(row.totalBytes)}` : ''}` : ''}</span>
            {row.status === 'downloading' && <progress aria-label={`${row.fileName}下载进度`} max={100} value={percent} />}
            {row.error && <p>{row.error}</p>}
            <div className="book-download-actions">
              {done && <button className="btn btn-sm" onClick={() => goRead(row.bookId)}><BookOpen size={14} />立即阅读</button>}
              {row.status === 'failed' && row.retryable && <button className="btn btn-sm" onClick={() => action(inbox.retry(row.id))}>重试入库</button>}
              {!done && !busy && row.returnUrl && <button className="btn btn-sm" disabled={!available || opening} onClick={() => visit(row.returnUrl)}>重访书源</button>}
            </div>
          </div>
          {!busy && <IconButton label={`移除下载记录${row.title || row.fileName}`} onClick={() => action(inbox.dismiss(row.id))}><Trash2 size={16} /></IconButton>}
        </li>
      })}</ul>}
      <p className="find-help">下载时请保持找书窗口打开。第一版不保证锁屏、关闭窗口或退出应用后继续下载。</p>
    </section>
    {history.length > 0 && <section className="find-section"><SectionTitle aside={<button className="find-add-source" onClick={() => { try { localStorage.removeItem('reader.bookHistory'); setHistory([]) } catch { setMessage('暂时无法清除访问记录') } }}>清空</button>}>最近访问</SectionTitle><ul className="book-history">{history.map(row => <li key={row.url}><button disabled={!available || opening} onClick={() => visit(row.url)}><History size={16} /><span>{new URL(row.url).host}<small>{new URL(row.url).pathname}</small></span><ArrowRight size={15} /></button></li>)}</ul></section>}
    <div className="find-live-message" role="status">{message}</div>
    <p className="library-endmark"><span /><Compass size={14} />好书自有相逢时<span /></p>
    {adding && <InkDialog title="收藏一个书源" onClose={() => setAdding(false)}><form className="ink-form" onSubmit={addSource}>
      <label>书源名称<input autoFocus value={sourceName} maxLength={40} onChange={event => setSourceName(event.target.value)} placeholder="给常去的网站起个名字" required /></label>
      <label>网站地址<input value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://…" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></label>
      {message && <p role="alert" className="find-form-error">{message}</p>}<div className="form-actions"><button className="btn" type="button" onClick={() => setAdding(false)}>取消</button><button className="btn btn-primary" type="submit">收藏书源</button></div>
    </form></InkDialog>}
  </div>
}
