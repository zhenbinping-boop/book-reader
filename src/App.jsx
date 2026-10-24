import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import Shelf from './components/Shelf'
import BackupPanel from './components/BackupPanel'
import { listBooks, deleteBook, getBook } from './db'
import { enqueueBookImport, setupBookBrowser } from './lib/bookBrowser'
import { backfillHashes } from './lib/backup'
import { useHashRoute, goShelf } from './hooks/useHashRoute'
import useBackClose from './hooks/useBackClose'
import { applyThemeColor } from './lib/prefs'
import { MotionConfig } from 'motion/react'

const PdfReader = lazy(() => import('./components/PdfReader'))
const TxtReader = lazy(() => import('./components/TxtReader'))
const EpubReader = lazy(() => import('./components/EpubReader'))

function ReaderApp() {
  const route = useHashRoute()
  const [books, setBooks] = useState([])
  const [busy, setBusy] = useState(0)
  const [book, setBook] = useState(undefined)
  const [backupOpen, setBackupOpen] = useState(false)
  const [notice, setNotice] = useState('')

  useBackClose(backupOpen, () => setBackupOpen(false), 'backup')

  useEffect(() => {
    if (route.name !== 'read') {
      applyThemeColor('shelf')
    }
  }, [route.name])

  const refresh = useCallback(() => {
    listBooks().then(setBooks)
  }, [])

  useEffect(() => {
    const imported = ({ detail }) => {
      refresh()
      setNotice(detail.resultStatus === 'duplicate' ? `《${detail.title}》已在书架，没有重复添加` : `《${detail.title}》已加入书架`)
    }
    const failed = ({ detail }) => setNotice(detail)
    window.addEventListener('reader:book-imported', imported)
    window.addEventListener('reader:browser-error', failed)
    setupBookBrowser().catch(error => setNotice(error?.message || '寻书功能初始化失败'))
    return () => {
      window.removeEventListener('reader:book-imported', imported)
      window.removeEventListener('reader:browser-error', failed)
    }
  }, [refresh])

  useEffect(() => {
    if (route.name !== 'read') refresh()
  }, [refresh, route.name])

  // v2 之前导入的书还没有内容指纹，这里补算一次（只读本地 blob，不联网）。
  // 补上之后，备份恢复和「重新导入同一个文件」才能把笔记对回书上。
  useEffect(() => {
    let alive = true
    backfillHashes()
      .then((n) => {
        if (alive && n > 0) refresh()
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [refresh])

  useEffect(() => {
    if (route.name !== 'read') return
    let alive = true
    setBook(undefined)
    getBook(route.id).then((b) => alive && setBook(b ?? null))
    return () => {
      alive = false
    }
  }, [route.name, route.id])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 6000)
    return () => clearTimeout(t)
  }, [notice])

  const handleImport = async (files) => {
    setBusy(files.length)
    const notes = []
    for (const file of files) {
      try {
        const r = await enqueueBookImport(file)
        if (r.status === 'linked') {
          notes.push(`《${r.title}》的文件已接回，原有笔记和进度都还在`)
        } else if (r.status === 'duplicate') {
          notes.push(`《${r.title}》已经在书架里了，没有重复导入`)
        } else if (r.format === 'epub' && r.chapters) {
          notes.push(`《${r.title}》已导入：${r.chapters} 节${r.author ? ` · ${r.author}` : ''}`)
        } else if (r.format === 'txt' && r.chapters) {
          notes.push(`《${r.title}》已导入：${r.chapters} 章，编码识别为 ${r.encoding}`)
        }
      } catch (err) {
        window.alert(`导入失败：${file.name}\n${err?.message || '无法解析这个文件'}`)
      }
      setBusy((n) => n - 1)
    }
    refresh()
    if (notes.length) setNotice(notes.join('\n'))
  }

  const handleDelete = async (target) => {
    if (!window.confirm(`删除《${target.title}》？此操作不可撤销。`)) return
    await deleteBook(target.id)
    refresh()
  }

  if (route.name === 'read') {
    if (book === undefined || (book && book.id !== route.id)) return <div className="center-msg">正在载入…</div>
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
    // 笔记还在，但这台设备上没有原文件（典型情况：从备份恢复到新设备）
    if (book.missingFile) {
      return (
        <div className="center-msg">
          <div className="missing-file">
            <div className="missing-file-title">《{book.title}》的原文件不在本设备上</div>
            <div className="missing-file-note">
              笔记和阅读进度都还留着。回到书架重新导入同一个文件，
              系统会按内容自动识别并接上，笔记不会丢。
            </div>
            <button className="btn btn-primary" onClick={goShelf}>
              返回书架导入
            </button>
          </div>
        </div>
      )
    }
    const Reader = book.format === 'txt' ? TxtReader : book.format === 'epub' ? EpubReader : PdfReader
    return (
      <Suspense fallback={<div className="center-msg">正在载入…</div>}>
        <Reader key={book.id} bookId={book.id} title={book.title} onBack={goShelf} />
      </Suspense>
    )
  }

  return (
    <>
      <Shelf
        books={books}
        onImport={handleImport}
        onDelete={handleDelete}
        onOpenBackup={() => setBackupOpen(true)}
        onBooksChanged={refresh}
        page={route.name}
      />
      {busy > 0 && (
        <div className="center-msg overlay-msg">
          <div>
            <div className="spin" />
            正在导入 {busy} 个文件…
          </div>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
      {backupOpen && (
        <BackupPanel onClose={() => setBackupOpen(false)} onRestored={refresh} />
      )}
    </>
  )
}

export default function App() {
  return <MotionConfig reducedMotion="user"><ReaderApp /></MotionConfig>
}
