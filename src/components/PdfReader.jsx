import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { openPdf, getPageSizes, buildOutline, extractText } from '../pdf/pdfService'
import {
  db,
  getBlob,
  saveProgress,
  listHighlights,
  addHighlight,
  updateHighlight,
  deleteHighlight,
  getTextIndex,
  putTextIndex,
} from '../db'
import { loadPrefs, savePrefs, resolveTheme, nextTheme, THEME_LABELS } from '../lib/prefs'
import { readSelection } from '../lib/selection'
import PdfPage from './PdfPage'
import SidePanel from './SidePanel'
import SelectionPopover from './SelectionPopover'

const GAP = 12
const MAX_VISIBLE = 12
const ZOOM_MIN = 0.5
const ZOOM_MAX = 4

const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))

export default function PdfReader({ bookId, title, onBack }) {
  const [phase, setPhase] = useState('loading')
  const [msg, setMsg] = useState('正在打开…')
  const [pdf, setPdf] = useState(null)
  const [sizes, setSizes] = useState([])
  const [outline, setOutline] = useState([])
  const [current, setCurrent] = useState(1)
  const [mode, setMode] = useState('scroll')
  const [zoom, setZoom] = useState(1)
  const [ui, setUi] = useState(true)
  const [drawer, setDrawer] = useState(false)
  // 阅读主题：用户显式选择优先，否则跟随系统（见 DESIGN.md §3.4）
  const [theme, setTheme] = useState(() => resolveTheme(loadPrefs()))
  const [viewBox, setViewBox] = useState({ w: 0, h: 0 })
  const [visible, setVisible] = useState(() => new Set())

  // ---- 划词高亮 ----
  const [highlights, setHighlights] = useState([])
  const [popover, setPopover] = useState(null)
  const popoverRef = useRef(null)

  // ---- 全文搜索 ----
  const [query, setQuery] = useState('')
  const [textPages, setTextPages] = useState(null)
  const [indexProgress, setIndexProgress] = useState(null)

  const viewRef = useRef(null)
  const slotsRef = useRef([])
  const layersRef = useRef(new Map())
  const currentRef = useRef(1)
  const modeRef = useRef('scroll')
  const nPagesRef = useRef(1)
  const releaseRef = useRef(null)
  const rafRef = useRef(0)
  const jumpRef = useRef(null)
  const didJump = useRef(false)
  const saveTimer = useRef(0)
  const touchRef = useRef(null)
  const offsetsRef = useRef([])

  // 页对象缓存：canvas 与文本层共用，避免同一页被 getPage 两次
  const pageCache = useMemo(() => ({ ready: new Map(), pending: new Map() }), [])

  currentRef.current = current
  modeRef.current = mode
  nPagesRef.current = sizes.length || 1

  // ---- 载入文档 ----
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const blob = await getBlob(bookId)
        if (!blob) throw new Error('文件已丢失，请重新导入')

        const handle = await openPdf(blob)
        if (!alive) {
          handle.destroy()
          return
        }
        releaseRef.current = handle.destroy
        const doc = handle.doc
        setPdf(doc)
        setMsg(`共 ${doc.numPages} 页，正在排版…`)

        const pageSizes = await getPageSizes(doc)
        if (!alive) return
        setSizes(pageSizes)

        const saved = await db.progress.get(bookId)
        if (!alive) return
        if (saved?.page) jumpRef.current = saved.page
        if (saved?.mode) setMode(saved.mode)
        if (saved?.zoom) setZoom(saved.zoom)

        const tree = await buildOutline(doc).catch(() => [])
        if (!alive) return
        setOutline(tree)

        const marks = await listHighlights(bookId).catch(() => [])
        if (!alive) return
        setHighlights(marks)

        setPhase('ready')
      } catch (err) {
        if (!alive) return
        setMsg(err?.message || '打开失败')
        setPhase('error')
      }
    })()

    return () => {
      alive = false
      if (releaseRef.current) {
        releaseRef.current()
        releaseRef.current = null
      }
    }
  }, [bookId])

  // ---- 容器尺寸 ----
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const apply = (w, h) => setViewBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    apply(el.clientWidth, el.clientHeight)
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      apply(Math.floor(r.width), Math.floor(r.height))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase, mode])

  // ---- 缩放 ----
  const maxWidth = useMemo(() => sizes.reduce((m, s) => Math.max(m, s.width), 1), [sizes])
  const fitScale = viewBox.w ? (viewBox.w - 20) / maxWidth : 1

  const scale = useMemo(() => {
    if (mode === 'page') {
      const h = sizes[current - 1]?.height || 842
      const fitBoth = Math.min(fitScale, viewBox.h ? (viewBox.h - 20) / h : fitScale)
      return fitBoth * zoom
    }
    return fitScale * zoom
  }, [mode, sizes, current, fitScale, viewBox.h, zoom])

  const offsets = useMemo(() => {
    const arr = new Array(sizes.length)
    let y = 12
    for (let i = 0; i < sizes.length; i++) {
      arr[i] = y
      y += sizes[i].height * scale + GAP
    }
    return arr
  }, [sizes, scale])

  offsetsRef.current = offsets

  // ---- 跳转 ----
  const goTo = useCallback((page) => {
    const target = Math.min(Math.max(1, Math.round(page)), nPagesRef.current)
    setCurrent(target)
    if (modeRef.current === 'scroll') {
      const off = offsetsRef.current[target - 1]
      if (off != null && viewRef.current) viewRef.current.scrollTop = off
    }
  }, [])

  useEffect(() => {
    if (phase !== 'ready' || didJump.current) return
    if (!offsets.length || !viewBox.w) return
    didJump.current = true
    requestAnimationFrame(() => goTo(jumpRef.current ?? 1))
  }, [phase, offsets, viewBox.w, goTo])

  // 切换回连续模式时把滚动位置对齐到当前页
  useEffect(() => {
    if (phase !== 'ready' || mode !== 'scroll') return
    const off = offsetsRef.current[currentRef.current - 1]
    if (off != null && viewRef.current) viewRef.current.scrollTop = off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // 缩放变化后保持当前页不动
  useEffect(() => {
    if (phase !== 'ready' || mode !== 'scroll') return
    const off = offsetsRef.current[currentRef.current - 1]
    if (off != null && viewRef.current) viewRef.current.scrollTop = off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale])

  // ---- 滚动时更新页码 ----
  const computeCurrent = useCallback(() => {
    const el = viewRef.current
    const list = offsetsRef.current
    if (!el || !list.length) return
    const y = el.scrollTop + el.clientHeight * 0.3
    let lo = 0
    let hi = list.length - 1
    let ans = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (list[mid] <= y) {
        ans = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    setCurrent(ans + 1)
  }, [])

  const onScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      computeCurrent()
    })
  }, [computeCurrent])

  // ---- 可见页追踪：只渲染视口附近的页，控制内存 ----
  useEffect(() => {
    if (phase !== 'ready' || mode !== 'scroll') return
    const root = viewRef.current
    if (!root) return

    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev)
          for (const entry of entries) {
            const i = Number(entry.target.dataset.page)
            if (Number.isNaN(i)) continue
            if (entry.isIntersecting) next.add(i)
            else next.delete(i)
          }
          if (next.size > MAX_VISIBLE) {
            const base = currentRef.current - 1
            const kept = [...next]
              .sort((a, b) => Math.abs(a - base) - Math.abs(b - base))
              .slice(0, MAX_VISIBLE)
            return new Set(kept)
          }
          return next
        })
      },
      { root, rootMargin: '900px 0px', threshold: 0 }
    )

    slotsRef.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [phase, mode, sizes, scale])

  useEffect(() => {
    if (mode === 'page') setVisible(new Set())
  }, [mode])

  // ---- 进度写回 ----
  useEffect(() => {
    if (phase !== 'ready') return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveProgress(bookId, { page: current, mode, zoom })
    }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [current, mode, zoom, phase, bookId])

  // ---- 自动隐藏控件 ----
  useEffect(() => {
    if (phase !== 'ready') return
    const t = setTimeout(() => setUi(false), 3500)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    const onKey = (e) => {
      if (drawer) return
      if (e.key === 'Escape') return onBack()
      if (modeRef.current !== 'page') return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        goTo(currentRef.current + 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        goTo(currentRef.current - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, onBack, drawer])

  /* ---------------- 划词高亮 ---------------- */

  const onLayer = useCallback((i, el) => {
    if (el) layersRef.current.set(i, el)
    else layersRef.current.delete(i)
  }, [])

  const closePopover = useCallback(() => {
    popoverRef.current = null
    setPopover(null)
  }, [])

  // Esc 优先关气泡，其次才退出阅读器
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && popoverRef.current) {
        e.stopPropagation()
        closePopover()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [closePopover])

  const openForSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
    for (const el of layersRef.current.values()) {
      if (!el.contains(sel.anchorNode)) continue
      const data = readSelection(el)
      if (!data) return
      const next = { mode: 'new', ...data }
      popoverRef.current = next
      setPopover(next)
      return
    }
  }, [])

  // 统一用「指针按下状态 + selectionchange」判断，鼠标与触屏长按都能覆盖。
  // 只监听 mouseup 在移动端会漏（长按后拖动选择手柄不会再触发 touchend）。
  useEffect(() => {
    let down = false
    let timer = 0
    const onDown = () => {
      down = true
    }
    const onUp = () => {
      down = false
      clearTimeout(timer)
      timer = setTimeout(openForSelection, 60)
    }
    const onSelChange = () => {
      if (down) return // 还在拖，等松手
      clearTimeout(timer)
      timer = setTimeout(openForSelection, 260)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointerup', onUp, true)
    document.addEventListener('selectionchange', onSelChange)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointerup', onUp, true)
      document.removeEventListener('selectionchange', onSelChange)
    }
  }, [openForSelection])

  const reloadHighlights = useCallback(async () => {
    const marks = await listHighlights(bookId).catch(() => [])
    setHighlights(marks)
  }, [bookId])

  const onMarkClick = useCallback((mark, e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const next = { mode: 'edit', existing: mark, text: mark.text, rect: r }
    popoverRef.current = next
    setPopover(next)
  }, [])

  const clearNativeSelection = () => {
    try {
      window.getSelection()?.removeAllRanges()
    } catch {
      /* 忽略 */
    }
  }

  const pickColor = useCallback(
    async (color) => {
      const p = popoverRef.current
      if (!p) return
      try {
        if (p.mode === 'edit') {
          await updateHighlight(p.existing.id, { color })
        } else {
          await addHighlight({
            bookId,
            page: p.page,
            start: p.start,
            end: p.end,
            text: p.text,
            color,
          })
        }
        await reloadHighlights()
      } catch (err) {
        // 保存失败必须留下痕迹，否则用户会以为高亮成功了
        console.error('[book-reader] 保存高亮失败', err)
      }
      clearNativeSelection()
      closePopover()
    },
    [bookId, closePopover, reloadHighlights]
  )

  const removeMark = useCallback(
    async (target) => {
      // 从标注气泡进来时无参，从侧栏某条笔记进来时带该条记录
      const h = target && typeof target.id === 'number' ? target : popoverRef.current?.existing
      if (!h) return
      try {
        await deleteHighlight(h.id)
        await reloadHighlights()
      } catch (err) {
        console.error('[book-reader] 删除高亮失败', err)
      }
      clearNativeSelection()
      closePopover()
    },
    [closePopover, reloadHighlights]
  )

  const copyMarkText = useCallback(async () => {
    const p = popoverRef.current
    if (!p?.text) return
    try {
      await navigator.clipboard.writeText(p.text)
    } catch {
      /* 无剪贴板权限时忽略 */
    }
    clearNativeSelection()
    closePopover()
  }, [closePopover])

  /* ---------------- 全文搜索 ---------------- */

  const ensureIndex = useCallback(async () => {
    if (textPages) return textPages
    const cached = await getTextIndex(bookId).catch(() => null)
    if (cached) {
      setTextPages(cached)
      return cached
    }
    if (!pdf) return null
    setIndexProgress({ done: 0, total: pdf.numPages })
    try {
      const pages = await extractText(pdf, (done, total) => setIndexProgress({ done, total }))
      setTextPages(pages)
      putTextIndex(bookId, pages).catch(() => {})
      return pages
    } catch {
      return null
    } finally {
      setIndexProgress(null)
    }
  }, [textPages, bookId, pdf])

  const onJumpHit = useCallback((hit) => goTo(hit.page + 1), [goTo])

  /* ---------------- 渲染 ---------------- */

  // 每页的高亮切成稳定的数组，避免每次渲染都让子组件的标注层重算
  const marksByPage = useMemo(() => {
    const map = new Map()
    for (const h of highlights) {
      const list = map.get(h.page)
      if (list) list.push(h)
      else map.set(h.page, [h])
    }
    return map
  }, [highlights])

  if (phase !== 'ready') {
    return (
      <div className="center-msg">
        {phase === 'error' ? (
          <div>
            <div style={{ marginBottom: 14 }}>{msg}</div>
            <button className="btn" onClick={onBack}>
              返回书架
            </button>
          </div>
        ) : (
          <div>
            <div className="spin" />
            {msg}
          </div>
        )}
      </div>
    )
  }

  const curSize = sizes[current - 1] || { width: 595, height: 842 }
  const total = sizes.length
  const activeQuery = query.trim()

  const renderPage = (i, s) => (
    <PdfPage
      pdf={pdf}
      index={i}
      scale={scale}
      pageCache={pageCache}
      marks={marksByPage.get(i) || EMPTY_MARKS}
      query={activeQuery}
      onLayer={onLayer}
      onMarkClick={onMarkClick}
    />
  )

  return (
    <div className="reader" data-reader-theme={theme}>
      <div
        className={`reader-view${mode === 'page' ? ' page-mode' : ''}`}
        ref={viewRef}
        onScroll={mode === 'scroll' ? onScroll : undefined}
        onClick={() => {
          if (popoverRef.current) return
          const sel = window.getSelection()
          if (sel && !sel.isCollapsed) return
          setUi((v) => !v)
        }}
        onTouchStart={(e) => {
          const t = e.touches[0]
          touchRef.current = { x: t.clientX, y: t.clientY }
        }}
        onTouchEnd={(e) => {
          const start = touchRef.current
          touchRef.current = null
          if (!start || mode !== 'page') return
          const t = e.changedTouches[0]
          const dx = t.clientX - start.x
          const dy = t.clientY - start.y
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            goTo(currentRef.current + (dx < 0 ? 1 : -1))
          }
        }}
      >
        <div className="pages" style={mode === 'page' ? undefined : { width: maxWidth * scale }}>
          {mode === 'page' ? (
            <div
              className="page-slot"
              style={{ width: curSize.width * scale, height: curSize.height * scale }}
            >
              {renderPage(current - 1, curSize)}
            </div>
          ) : (
            sizes.map((s, i) => (
              <div
                className="page-slot"
                key={i}
                data-page={i}
                ref={(el) => {
                  slotsRef.current[i] = el
                }}
                style={{ width: s.width * scale, height: s.height * scale }}
              >
                {visible.has(i) && renderPage(i, s)}
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`reader-top${ui ? '' : ' hidden'}`}>
        <button className="btn btn-sm" onClick={onBack}>
          返回
        </button>
        <div className="reader-title">{title}</div>
        <button
          className="btn btn-sm"
          onClick={() => setMode((m) => (m === 'scroll' ? 'page' : 'scroll'))}
        >
          {mode === 'scroll' ? '连续' : '单页'}
        </button>
        <button className="btn btn-sm" onClick={() => setZoom((z) => clampZoom(z - 0.25))}>
          −
        </button>
        <button
          className="btn btn-sm"
          style={{ minWidth: 48, fontVariantNumeric: 'tabular-nums' }}
          onClick={() => setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button className="btn btn-sm" onClick={() => setZoom((z) => clampZoom(z + 0.25))}>
          ＋
        </button>
        <button
          className="btn btn-sm theme-btn"
          title={`阅读主题：${THEME_LABELS[theme]}`}
          aria-label={`切换阅读主题，当前为${THEME_LABELS[theme]}`}
          onClick={() => {
            const next = nextTheme(theme)
            setTheme(next)
            savePrefs({ readerTheme: next })
          }}
        >
          <span className="theme-dot" data-theme={theme} aria-hidden="true" />
        </button>
        <button className="btn btn-sm" onClick={() => setDrawer(true)}>
          面板
        </button>
      </div>

      <div className={`reader-bottom${ui ? '' : ' hidden'}`} onClick={(e) => e.stopPropagation()}>
        <div className="scrub">
          <input
            type="range"
            min={1}
            max={total}
            value={current}
            onChange={(e) => goTo(Number(e.target.value))}
          />
          <span className="scrub-num">
            {current} / {total}
          </span>
        </div>
      </div>

      {popover && (
        <SelectionPopover
          data={popover}
          onPick={pickColor}
          onDelete={removeMark}
          onCopy={copyMarkText}
          onClose={closePopover}
        />
      )}

      {drawer && (
        <SidePanel
          outline={outline}
          current={current}
          onClose={() => setDrawer(false)}
          onJumpPage={(page) => {
            setDrawer(false)
            goTo(page)
          }}
          highlights={highlights}
          onMarkClick={onMarkClick}
          onMarkDelete={removeMark}
          ensureIndex={ensureIndex}
          indexProgress={indexProgress}
          onJumpHit={onJumpHit}
          query={query}
          setQuery={setQuery}
        />
      )}
    </div>
  )
}

const EMPTY_MARKS = []
