import { useRef, useState } from 'react'
import { isPdfFile } from '../lib/importer'
import { goRead } from '../hooks/useHashRoute'

export default function Shelf({ books, onImport, onDelete, onOpenBackup }) {
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)

  const pick = (list) => {
    const files = Array.from(list || []).filter(isPdfFile)
    if (files.length) onImport(files)
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>我的书架</h1>
        <button className="btn" onClick={onOpenBackup}>
          备份
        </button>
        <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
          导入 PDF
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            pick(e.target.files)
            e.target.value = ''
          }}
        />
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
        <div className={`dropzone${over ? ' over' : ''}`}>
          <strong>把 PDF 拖进来</strong>
          或点右上角导入 · 文件只存在这台设备上，记得定期导出备份
        </div>

        {books.length === 0 ? (
          <div className="empty">
            <span>▤</span>
            还没有书，先导入一个 PDF 试试
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
                      <span>
                        {b.missingFile
                          ? '笔记已保留'
                          : pct > 0
                            ? `已读 ${pct}%`
                            : `${b.pageCount} 页`}
                      </span>
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
