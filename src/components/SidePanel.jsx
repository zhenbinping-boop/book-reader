import { useEffect, useMemo, useRef, useState } from 'react'
import { searchInPages } from '../lib/pdfText'

const TABS = [
  { id: 'outline', label: '目录' },
  { id: 'bookmarks', label: '书签' },
  { id: 'notes', label: '笔记' },
  { id: 'search', label: '搜索' },
]

/**
 * 阅读器侧栏：目录 / 书签 / 笔记 / 搜索。
 * 四件事都属于「跳出当前页去做点别的」，共用一个抽屉比堆四个入口清楚。
 *
 * PDF / TXT / EPUB 共用这个面板，差别靠几个可选 prop 吸收：
 *   - search：搜索实现。默认按「页」搜（PDF），TXT / EPUB 传按「章」搜的实现；
 *   - pageLabel：把 page 序号渲染成人看的标签（p3 / 第3章 / 第3节）；
 *   - onNoteJump：点笔记的跳转。TXT / EPUB 需要精确跳到章内某处，而不是只翻到某页；
 *   - bookmarks 一族：书签列表 + 当前页是否已有书签 + 跳转 / 删除 / 切换。
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
  search,
  pageLabel,
  onNoteJump,
  bookmarks,
  currentBookmark,
  onBookmarkToggle,
  onJumpBookmark,
  onBookmarkDelete,
}) {
  const [tab, setTab] = useState('outline')
  const [hits, setHits] = useState(null)
  const [tip, setTip] = useState('')
  const [busy, setBusy] = useState(false)

  const label = pageLabel || ((i) => `p${i + 1}`)

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
      const found = search ? search(pages, q) : searchInPages(pages, q)
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

  // 书签按「页/章 + 章内偏移」排 —— 与正文的先后顺序一致，列表读起来才是顺着书的
  const sortedMarks = useMemo(
    () =>
      [...(bookmarks || [])].sort(
        (a, b) => a.page - b.page || (a.charOffset ?? 0) - (b.charOffset ?? 0)
      ),
    [bookmarks]
  )

  const badges = { bookmarks: sortedMarks.length, notes: sortedNotes.length }

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
                {badges[t.id] > 0 && <span className="tab-badge">{badges[t.id]}</span>}
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

        {tab === 'bookmarks' && (
          <>
            <div className="notes-bar">
              <span className="notes-count">
                {sortedMarks.length ? `共 ${sortedMarks.length} 个` : '暂无书签'}
              </span>
              <button
                className="btn btn-sm"
                data-bm-toggle="1"
                onClick={onBookmarkToggle}
                disabled={!onBookmarkToggle}
                title="书签记住的是「这一页最上面那段文字」，换字号后也回得来"
              >
                {currentBookmark ? '取消当前位置' : '加当前位置'}
              </button>
            </div>
            <div className="panel-body">
              {sortedMarks.length === 0 ? (
                <div className="outline-empty">
                  还没有书签。看书时按顶栏的书签图标，或点上面的「加当前位置」，就能把当前位置记下来。
                </div>
              ) : (
                sortedMarks.map((b) => (
                  <div
                    key={b.id}
                    className={`bm-item${b.id === currentBookmark?.id ? ' on' : ''}`}
                    data-bookmark={b.id}
                  >
                    <button className="bm-main" onClick={() => onJumpBookmark(b)}>
                      <span className="bm-where">
                        <span className="bm-pg">{label(b.page)}</span>
                        {b.label && <span className="bm-label">{b.label}</span>}
                      </span>
                      {b.snippet && <span className="bm-snippet">{b.snippet}</span>}
                    </button>
                    <button
                      className="bm-del"
                      title="删除这个书签"
                      aria-label="删除这个书签"
                      onClick={() => onBookmarkDelete(b)}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
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
                    <button
                      className="note-main"
                      onClick={() => (onNoteJump ? onNoteJump(h) : onJumpPage(h.page + 1))}
                    >
                      <span className="note-pg">{label(h.page)}</span>
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
                    <span className="hit-pg">{label(h.page)}</span>
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
        onClick={() => node.pageIndex != null && onJump(node.pageIndex + 1, node)}
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
