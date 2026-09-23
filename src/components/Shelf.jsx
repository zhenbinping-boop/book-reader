import { useRef, useState } from 'react'
import { isSupportedFile } from '../lib/importer'
import { goRead } from '../hooks/useHashRoute'

/**
 * 书卡片上那行小字。三种格式的「是什么」不同（页 / 章 / 节），
 * 而且只有 EPUB 带作者，所以统一在这里拼。
 */
function metaText(b, pct) {
  if (b.missingFile) return '笔记已保留'
  if (b.format === 'pdf') return pct > 0 ? `已读 ${pct}%` : `${b.pageCount} 页`
  const unit = b.format === 'txt' ? '章' : '节'
  const size = b.author ? `${b.pageCount} ${unit} · ${b.author}` : `${b.pageCount} ${unit}`
  return pct > 0 ? `已读 ${pct}% · ${size}` : size
}

/**
 * 「添加图书」栏展开后的三种格式。
 *
 * accept 要分两份用：栏收起时用 ALL_ACCEPT（三种都收），
 * 展开后点某个格式按钮才把 accept 收窄到那一种 —— 手机上的文件选择器会照着
 * accept 过滤，收窄之后选 PDF 时就不会再冒出一堆 .txt。
 */
const FORMATS = [
  { key: 'pdf', label: 'PDF', tip: '固定版式', accept: '.pdf,application/pdf' },
  { key: 'txt', label: 'TXT', tip: '纯文本', accept: '.txt,.text,text/plain' },
  { key: 'epub', label: 'EPUB', tip: '电子书', accept: '.epub,application/epub+zip' },
]

const ALL_ACCEPT = FORMATS.map((f) => f.accept).join(',')

/**
 * 书架。
 *
 * 导入入口平时只是一行「＋ 添加图书」—— 三种格式平铺在首屏既占地方、
 * 又逼着人先读一遍「我们支持什么」。点开才列出格式，选完即收。
 * 桌面端拖拽仍然整块书架都能接（松手时才浮出提示条）。
 */
export default function Shelf({ books, onImport, onDelete, onOpenBackup }) {
  const [over, setOver] = useState(false)
  const [adding, setAdding] = useState(false)
  const inputRef = useRef(null)

  const pick = (list) => {
    const files = Array.from(list || []).filter(isSupportedFile)
    if (files.length) onImport(files)
  }

  /**
   * 打开文件选择器前才把 accept 收窄。
   *
   * 直接改 DOM 属性而不是走 state：`accept` 这个 prop 前后两次渲染是同一个值，
   * React 不会覆写它，所以收窄能一直留到收起添加栏为止；而收起时又必须还原，
   * 否则下次点开默认还是上一次那种格式（选不出别的格式来）。
   */
  const closeAdd = () => {
    setAdding(false)
    if (inputRef.current) inputRef.current.accept = ALL_ACCEPT
  }

  const openPicker = (accept) => {
    const el = inputRef.current
    if (!el) return
    el.accept = accept
    el.click()
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>我的书架</h1>
        <button className="btn" onClick={onOpenBackup}>
          备份
        </button>
      </div>

      <div
        className="shelf"
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          pick(e.dataTransfer?.files)
        }}
      >
        <div className={`add-bar${adding ? ' open' : ''}`}>
          <button
            className="add-toggle"
            data-open={adding ? '1' : '0'}
            aria-expanded={adding}
            onClick={() => (adding ? closeAdd() : setAdding(true))}
          >
            <span className="add-plus" aria-hidden="true">
              ＋
            </span>
            添加图书
            <span className="add-caret" aria-hidden="true">
              ▾
            </span>
          </button>

          {adding && (
            <div className="add-formats">
              {FORMATS.map((f) => (
                <button
                  key={f.key}
                  className="fmt-btn"
                  data-fmt={f.key}
                  onClick={() => openPicker(f.accept)}
                >
                  <b>{f.label}</b>
                  <span>{f.tip}</span>
                </button>
              ))}
              <div className="add-hint">也可以把文件直接拖进书架</div>
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ALL_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            pick(e.target.files)
            e.target.value = ''
          }}
        />

        {over && (
          <div className="dropzone over">
            <strong>松手就导入</strong>
            PDF、TXT、EPUB 都行
          </div>
        )}

        {books.length === 0 ? (
          <div className="empty">
            <span>▤</span>
            还没有书，点上面的「添加图书」导入 PDF、TXT 或 EPUB
          </div>
        ) : (
          <div className="grid">
            {books.map((b) => {
              const p = b.progress
              const pct =
                p && b.pageCount && !b.missingFile
                  ? Math.round((p.page / b.pageCount) * 100)
                  : 0
              return (
                <div className="card" key={b.id}>
                  <button className="cover" onClick={() => goRead(b.id)}>
                    {b.cover ? (
                      <img src={b.cover} alt="" />
                    ) : (
                      <span className="cover-empty">{b.title.slice(0, 1)}</span>
                    )}
                    {b.missingFile && <span className="cover-flag">需重新导入</span>}
                  </button>
                  <div className="card-body">
                    <button
                      className="card-title"
                      style={{ textAlign: 'left' }}
                      onClick={() => goRead(b.id)}
                    >
                      {b.title}
                    </button>
                    <div className="card-meta">
                      <span>{metaText(b, pct)}</span>
                      <button className="card-del" onClick={() => onDelete(b)}>
                        删除
                      </button>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
