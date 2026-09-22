import { useCallback, useEffect, useState } from 'react'
import Shelf from './components/Shelf'
import PdfReader from './components/PdfReader'
import { listBooks, deleteBook, getBook } from './db'
import { importPdf } from './lib/importer'
import { useHashRoute, goShelf } from './hooks/useHashRoute'

export default function App() {
  const route = useHashRoute()
  const [books, setBooks] = useState([])
  const [busy, setBusy] = useState(0)
  const [book, setBook] = useState(undefined)

  const refresh = useCallback(() => {
    listBooks().then(setBooks)
  }, [])

  useEffect(refresh, [refresh])

  useEffect(() => {
    if (route.name !== 'read') return
    let alive = true
    getBook(route.id).then((b) => alive && setBook(b ?? null))
    return () => {
      alive = false
    }
  }, [route])

  const handleImport = async (files) => {
    setBusy(files.length)
    for (const file of files) {
      try {
        await importPdf(file)
      } catch (err) {
        window.alert(`导入失败：${file.name}\n${err?.message || '无法解析这个 PDF'}`)
      }
      setBusy((n) => n - 1)
    }
    refresh()
  }

  const handleDelete = async (target) => {
    if (!window.confirm(`删除《${target.title}》？此操作不可撤销。`)) return
    await deleteBook(target.id)
    refresh()
  }

  if (route.name === 'read') {
    if (book === undefined) return <div className="center-msg">正在载入…</div>
    if (book === null) {
      return (
        <div className="center-msg">
          <div>
            <div style={{ marginBottom: 14 }}>这本书不存在</div>
            <button className="btn" onClick={goShelf}>
              返回书架
            </button>
          </div>
        </div>
      )
    }
    return <PdfReader key={book.id} bookId={book.id} title={book.title} onBack={goShelf} />
  }

  return (
    <>
      <Shelf books={books} onImport={handleImport} onDelete={handleDelete} />
      {busy > 0 && (
        <div className="center-msg overlay-msg">
          <div>
            <div className="spin" />
            正在导入 {busy} 个文件…
          </div>
        </div>
      )}
    </>
  )
}
