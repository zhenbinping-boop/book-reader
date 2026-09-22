import { useEffect, useMemo, useRef, useState } from 'react'
import { searchInPages } from '../lib/pdfText'

const TABS = [
  { id: 'outline', label: '目录' },
  { id: 'notes', label: '笔记' },
  { id: 'search', label: '搜索' },
]

/**
 * 阅读器侧栏：目录 / 笔记 / 搜索。
 * 三件事都属于「跳出当前页去做点别的」，共用一个抽屉比堆三个入口清楚。
 */
export default function SidePanel({
  outline,
  current,
  onClose,
  onJumpPage,
  highlights,
  onMarkDelete,
  ensureIndex,
  indexProgress,
  onJumpHit,
  onExportNotes,
  query,
  setQuery,
}) {
  const [tab, setTab] = useState('outline')
  const [hits, setHits] = useState(null)
  const [tip, setTip] = useState('')
  const [busy, setBusy] = useState(false)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // 输入即搜，但压 250ms；索引本身有缓存，重复搜索只是字符串扫描
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      setTip('')
      setBusy(false)
      return
    }
    let alive = true
    setBusy(true)
    const t = setTimeout(async () => {
      const pages = await ensureIndex()
      if (!alive) return
      if (!pages) {
        setBusy(false)
        setTip('文本索引不可用')
        return
      }
      const found = searchInPages(pages, q)
      if (!alive) return
      setHits(found)
      setBusy(false)
      if (found.length) setTip('')
      else if (pages.every((p) => !p)) setTip('这本书没有可搜索的文本层，可能是扫描件')
      else setTip('没有找到匹配')
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query, ensureIndex])

  const sortedNotes = useMemo(
    () =>
      [...(highlights || [])].sort(
        (a, b) => a.page - b.page || a.start.item - b.start.item || a.start.offset - b.start.offset
      ),
    [highlights]
  )

  const pct = indexProgress
    ? Math.round((indexProgress.done / Math.max(1, indexProgress.total)) * 100)
    : 0

  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="阅读面板">
        <div className="drawer-head">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`tab${tab === t.id ? ' on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'notes' && sortedNotes.length > 0 && (
                  <span className="tab-badge">{sortedNotes.length}</span>
                )}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={onClose}>
            关闭
          </button>
        </div>

        {indexProgress && (
          <div className="index-progress">
            <div className="bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <span>
              正在提取文本 {indexProgress.done}/{indexProgress.total}
            </span>
          </div>
        )}

        {tab === 'outline' && (
          <div className="panel-body">
            {outline.length === 0 ? (
              <div className="outline-empty">这本书没有目录信息</div>
            ) : (
              outline.map((node) => <OutlineNode key={node.key} node={node} current={current} onJump={onJumpPage} />)
            )}
          </div>
        )}

        {tab === 'notes' && (
          <>
            <div className="notes-bar">
              <span className="notes-count">
                {sortedNotes.length ? `共 ${sortedNotes.length} 条` : '暂无笔记'}
              </span>
              <button
                className="btn btn-sm"
                onClick={onExportNotes}
                disabled={!onExportNotes}
                title="导出为 Markdown 文件，可按页分享或存档"
              >
                导出 Markdown
              </button>
            </div>
            <div className="panel-body">
              {sortedNotes.length === 0 ? (
                <div className="outline-empty">还没有笔记。在正文里按住划选一段文字即可高亮。</div>
              ) : (
                sortedNotes.map((h) => (
                  <div key={h.id} className="note-item">
                    <button className="note-main" onClick={() => onJumpPage(h.page + 1)}>
                      <span className="note-pg">p{h.page + 1}</span>
                      <span className="note-text" data-color={h.color}>
                        {h.text}
                      </span>
                    </button>
                    <button
                      className="note-del"
                      title="删除这条高亮"
                      aria-label="删除这条高亮"
                      onClick={() => onMarkDelete(h)}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'search' && (
          <>
            <div className="search-bar">
              <input
                className="search-input"
                type="search"
                placeholder="搜索全书内容"
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="panel-body">
              {busy && <div className="outline-empty">搜索中…</div>}
              {!busy && tip && <div className="outline-empty">{tip}</div>}
              {!busy &&
                hits?.map((h, i) => (
                  <button
                    key={`${h.page}-${h.from}-${i}`}
                    className="hit-item"
                    onClick={() => onJumpHit(h)}
                  >
                    <span className="hit-pg">p{h.page + 1}</span>
                    <span className="hit-text">{h.snippet}</span>
                  </button>
                ))}
              {!busy && hits && hits.length >= 200 && (
                <div className="outline-empty">结果较多，仅显示前 200 条</div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  )
}

function OutlineNode({ node, current, onJump, depth = 0 }) {
  const key = node.key ?? `${depth}-${node.title}`
  return (
    <div>
      <button
        className={`outline-item${node.pageIndex === current - 1 ? ' active' : ''}`}
        style={{ paddingLeft: 16 + depth * 14 }}
        title={node.title}
        onClick={() => node.pageIndex != null && onJump(node.pageIndex + 1)}
      >
        {node.pageIndex != null && <span className="pg">{node.pageIndex + 1}</span>}
        {node.title}
      </button>
      {node.children?.map((c) => (
        <OutlineNode key={c.key} node={c} current={current} onJump={onJump} depth={depth + 1} />
      ))}
    </div>
  )
}
