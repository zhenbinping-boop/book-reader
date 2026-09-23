import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  db,
  getBlob,
  saveProgress,
  listHighlights,
  addHighlight,
  updateHighlight,
  deleteHighlight,
  listBookmarks,
  addBookmark,
  deleteBookmark,
} from '../db'
import { loadPrefs, savePrefs, resolveTheme, DEFAULT_PREFS, snapReaderSize } from '../lib/prefs'
import {
  decodeBytes,
  splitChapters,
  paragraphsOf,
  segmentAt,
  searchChapters,
  chapterPercent,
} from '../lib/txtText'
import { firstSegOnPage, pageOfSegment, selectionOffsets, splitByMarks } from '../lib/txtSel'
import { exportNotes } from '../lib/backup'
import useHistoryStack from '../hooks/useHistoryStack'
import useWakeLock from '../hooks/useWakeLock'
import useImmersive from '../hooks/useImmersive'
import usePinch, { applyPinchFx } from '../hooks/usePinch'
import SidePanel from './SidePanel'
import SelectionPopover from './SelectionPopover'
import AppearancePanel from './AppearancePanel'
import DisplayMenu from './DisplayMenu'
import BookmarkButton from './BookmarkButton'

/** 栏间距，必须与 styles.css 里 .reader.txt-reader 的 --txt-gap 保持一致 */
const GAP = 40

/**
 * TXT 阅读器。
 *
 * 与 PdfReader 最大的不同：**页是假的**。TXT 没有固定分页，页数完全取决于
 * 屏幕尺寸与字号，所以：
 *   - 排版用 CSS 多栏（一章文字排成 N 栏，一栏 = 一页），见 styles.css 的说明；
 *   - 位置锚点用「章 + 章内字符偏移」而不是页码（见 lib/txtText.js 开头）；
 *   - 换字号 / 旋屏后按锚点重新定位，不会跳走。
 */
export default function TxtReader({ bookId, title, onBack }) {
  const [phase, setPhase] = useState('loading')
  const [msg, setMsg] = useState('正在打开…')
  const [doc, setDoc] = useState(null)
  const [chapter, setChapter] = useState(0)
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [ui, setUi] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [appearance, setAppearance] = useState(false)
  const [prefs, setPrefs] = useState(() => loadPrefs())
  const [theme, setTheme] = useState(() => resolveTheme(loadPrefs()))
  const [highlights, setHighlights] = useState([])
  const [bookmarks, setBookmarks] = useState([])
  const [popover, setPopover] = useState(null)
  const [toast, setToast] = useState('')
  const [query, setQuery] = useState('')
  // 每次「跳转」自增，用来让定位副作用在同章跳转时也能重跑（见 goChapter）
  const [jumpSeq, setJumpSeq] = useState(0)
  const [menu, setMenu] = useState(false)

  const {
    on: immersive,
    realFs,
    supported: fsSupported,
    toggle: toggleImmersive,
    setOn: setImmersive,
  } = useImmersive()
  const keepAwake = useWakeLock(prefs.readerKeepAwake)

  const vpRef = useRef(null)
  const colRef = useRef(null)
  const boxRef = useRef({ w: 0, h: 0 })
  const docRef = useRef(null)
  const pageRef = useRef(0)
  const chapterRef = useRef(0)
  const pagesRef = useRef(1)
  const highlightsRef = useRef([])
  const rafRef = useRef(0)
  const saveTimer = useRef(0)
  const pendingRef = useRef(null)
  // 排版变化（换字号 / 旋屏 / 换章）后要回到的字符锚点
  const pendingAnchorRef = useRef(null)
  const pendingEndRef = useRef(false)
  // 当前页最上面那段文字在章内的偏移 —— 也就是下次打开要回到的地方
  const anchorRef = useRef(0)
  const jumpRef = useRef(null)
  const restoredRef = useRef(false)
  const popoverRef = useRef(null)
  const touchRef = useRef(null)
  const prefsRef = useRef(loadPrefs())
  /** 手势中的临时缩放作用在分栏层上。分栏层的宽度可能是视口的几十倍，
   * 所以 transform-origin 必须按视口算 —— 见 usePinch 的 applyPinchFx */
  const pinchRef = useRef(null)
  // 分栏层同时是「量栏宽的把手」和「缩放的反馈层」，两个 ref 一起维护。
  // 必须包成 useCallback：内联函数每次渲染都会换身份，React 会反复 detach/attach
  const setCols = useCallback((el) => {
    colRef.current = el
    pinchRef.current = el
  }, [])

  boxRef.current = box
  docRef.current = doc
  pageRef.current = page
  chapterRef.current = chapter
  pagesRef.current = pages
  highlightsRef.current = highlights
  prefsRef.current = prefs

  const chapters = doc?.chapters ?? []
  const total = chapters.length
  const chap = chapters[chapter] ?? null

  const paras = useMemo(
    () => (doc && chap ? paragraphsOf(doc.text, chap.start, chap.end) : []),
    [doc, chap]
  )

  /* ---------------- 载入与解码 ---------------- */

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const blob = await getBlob(bookId)
        if (!blob) throw new Error('文件已丢失，请重新导入')
        setMsg('正在解码文本…')
        const { text, encoding } = decodeBytes(await blob.arrayBuffer())
        if (!alive) return
        if (!text.trim()) throw new Error('这个文件里没有可显示的文本')

        const chs = splitChapters(text)
        setDoc({ text, chapters: chs, encoding })

        const saved = await db.progress.get(bookId)
        if (!alive) return
        if (saved && Number.isFinite(saved.chapterIndex)) {
          jumpRef.current = {
            chapterIndex: Math.min(Math.max(0, saved.chapterIndex), chs.length - 1),
            charOffset: Math.max(0, saved.charOffset || 0),
          }
          setChapter(jumpRef.current.chapterIndex)
        }

        const marks = await listHighlights(bookId).catch(() => [])
        if (!alive) return
        setHighlights(marks)
        setBookmarks(await listBookmarks(bookId).catch(() => []))
        if (!alive) return
        setPhase('ready')

        if (encoding !== 'utf-8' && encoding !== 'utf-8-bom') {
          setToast(`文本按 ${encoding.toUpperCase()} 解码，共 ${chs.length} 章`)
        }
      } catch (err) {
        if (!alive) return
        setMsg(err?.message || '打开失败')
        setPhase('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [bookId])

  useEffect(() => {
    const el = vpRef.current
    if (phase !== 'ready' || !el) return
    const apply = () => {
      const w = Math.floor(el.clientWidth)
      const h = Math.floor(el.clientHeight)
      if (w === boxRef.current.w && h === boxRef.current.h) return
      // 尺寸变了就要重排。锚点直接取 anchorRef —— 它已经是「当前页最上面那段
      // 文字」的章内偏移，就是我们要回到的地方。
      //
      // **不要在这里用旧几何重新推锚点**：字号一变内容当场就重排完了（字号是 CSS
      // 变量，不走 React），拿旧栏宽去量新布局只会算出一个错的锚点（踩过）。
      if (boxRef.current.w && restoredRef.current) {
        pendingAnchorRef.current = { charOffset: anchorRef.current }
      }
      setBox({ w, h })
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase])

  /* ---------------- 分栏测量与定位 ---------------- */

  const colW = box.w
  const colH = box.h

  const geo = useCallback(() => {
    const vp = vpRef.current
    if (!vp) return { left: 0, scrollLeft: 0, colW: boxRef.current.w, gap: GAP }
    return {
      left: vp.getBoundingClientRect().left,
      scrollLeft: vp.scrollLeft,
      colW: boxRef.current.w,
      gap: GAP,
    }
  }, [])

  const scrollToPage = useCallback((p, smooth) => {
    const vp = vpRef.current
    const w = boxRef.current.w
    if (!vp || !w) return
    const target = Math.max(0, Math.min(p, pagesRef.current - 1))
    const x = target * (w + GAP)
    if (smooth) vp.scrollTo({ left: x, behavior: 'smooth' })
    else vp.scrollLeft = x
    setPage(target)
  }, [])

  /** 章内字符偏移 → 应该显示在第几栏 */
  const pageForCharOffset = useCallback(
    (charOffset, list) => {
      const segIdx = segmentAt(list, (chap?.start ?? 0) + charOffset)
      if (segIdx < 0) return 0
      const p = pageOfSegment(colRef.current, segIdx, geo())
      return p < 0 ? 0 : p
    },
    [chap, geo]
  )

  /** 换章。charOffset 是章内偏移；atEnd=true 时定位到该章最后一页 */
  const goChapter = useCallback((i, charOffset = 0, atEnd = false) => {
    const n = docRef.current?.chapters?.length ?? 0
    if (!n) return
    const t = Math.max(0, Math.min(Math.round(i), n - 1))
    pendingAnchorRef.current = atEnd ? null : { charOffset }
    pendingEndRef.current = atEnd
    // 用户已经主动翻过页，之后的页码变化都可以记账了
    restoredRef.current = true
    const vp = vpRef.current
    if (vp) vp.scrollLeft = 0
    setPage(0)
    setChapter(t)
    // 定位副作用挂在 chapter / paras 上，**同章内跳到章内别处时这两者都没变**，
    // 副作用不会重跑，人就被留在章首了。用一个自增序号把「跳转」这件事本身
    // 也变成依赖，同章跳转才会被真的执行。
    setJumpSeq((s) => s + 1)
  }, [])

  const nextPage = useCallback(() => {
    if (pageRef.current < pagesRef.current - 1) scrollToPage(pageRef.current + 1, true)
    else goChapter(chapterRef.current + 1, 0, false)
  }, [scrollToPage, goChapter])

  const prevPage = useCallback(() => {
    if (pageRef.current > 0) scrollToPage(pageRef.current - 1, true)
    else goChapter(chapterRef.current - 1, 0, true)
  }, [scrollToPage, goChapter])

  /* ---------------- 位置后退栈 ---------------- */

  const { push: pushHist, pop: popHist, depth: histDepth } = useHistoryStack()

  /** 目标锚点是不是已经在眼前？是的话这次跳转等于没动，不该进栈 */
  const anchorIsHere = useCallback(
    (chapterIndex, charOffset) => {
      if (chapterIndex !== chapterRef.current) return false
      return pageForCharOffset(charOffset || 0, paras) === pageRef.current
    },
    [pageForCharOffset, paras]
  )

  /** 记下当前所在，供之后回退。TXT 存章 + 章内字符偏移，换字号 / 旋屏后依然对得上 */
  const rememberHere = useCallback(() => {
    pushHist({ chapterIndex: chapterRef.current, charOffset: anchorRef.current })
  }, [pushHist])

  const jumpToChapter = useCallback(
    (p) => {
      const t = Math.max(0, Math.min(Math.round(p) - 1, (docRef.current?.chapters?.length ?? 1) - 1))
      if (!(t === chapterRef.current && pageRef.current === 0)) rememberHere()
      setDrawer(false)
      goChapter(t)
    },
    [goChapter, rememberHere]
  )

  const jumpToAnchor = useCallback(
    (chapterIndex, charOffset) => {
      if (!anchorIsHere(chapterIndex, charOffset)) rememberHere()
      setDrawer(false)
      goChapter(chapterIndex, charOffset || 0)
    },
    [anchorIsHere, goChapter, rememberHere]
  )

  const backToPrev = useCallback(() => {
    const entry = popHist()
    if (!entry) return
    setDrawer(false)
    goChapter(entry.chapterIndex, entry.charOffset || 0)
    setToast(`已回到第 ${entry.chapterIndex + 1} 章`)
  }, [goChapter, popHist])

  /* ---------------- 书签 ---------------- */

  const reloadBookmarks = useCallback(async () => {
    setBookmarks(await listBookmarks(bookId).catch(() => []))
  }, [bookId])

  /**
   * 当前页上已经有书签了吗？
   *
   * 判定**不能**只比 charOffset 是否相等：书签存的是建立时那一页顶段的偏移，
   * 而改字号 / 旋屏会重新分栏 —— 同一个偏移可能落到另一页上，也可能不再是页首。
   * 所以反过来问：「这个书签的偏移在当前排版下落在第几页」，落在当前页就算它在眼前。
   * 这与 MEMORY 里那条「判定标准是锚点段落落在当前显示的那一栏」是同一条判据。
   */
  const currentBookmark = useMemo(
    () =>
      bookmarks.find(
        (b) => b.page === chapter && pageForCharOffset(b.charOffset ?? 0, paras) === page
      ) ?? null,
    [bookmarks, chapter, page, pageForCharOffset, paras]
  )

  /** 当前页最上面那段文字的开头 —— 书签列表里的摘要，用来认出「这是哪儿」 */
  const snippetHere = useCallback(() => {
    const seg = firstSegOnPage(colRef.current, pageRef.current, geo())
    const text = seg?.el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    return text.slice(0, 40)
  }, [geo])

  const toggleBookmark = useCallback(async () => {
    try {
      if (currentBookmark) {
        await deleteBookmark(currentBookmark.id)
        await reloadBookmarks()
        setToast('已删除这个书签')
        return
      }
      // 存的是**实时锚点**而不是 page：它与进度写回用的是同一个值，
      // 所以「书签跳回去的位置」和「下次打开回到的位置」天然一致
      await addBookmark({
        bookId,
        page: chapterRef.current,
        charOffset: anchorRef.current,
        label: chap?.title ?? '',
        snippet: snippetHere(),
      })
      await reloadBookmarks()
      setToast(`已加书签 · 第 ${chapterRef.current + 1} 章`)
    } catch (err) {
      console.error('[book-reader] 书签写入失败', err)
      setToast('书签没能保存')
    }
  }, [bookId, currentBookmark, reloadBookmarks, snippetHere, chap])

  const onJumpBookmark = useCallback(
    (b) => jumpToAnchor(b.page, b.charOffset ?? 0),
    [jumpToAnchor]
  )

  const onBookmarkDelete = useCallback(
    async (b) => {
      try {
        await deleteBookmark(b.id)
        await reloadBookmarks()
        setToast('已删除书签')
      } catch (err) {
        console.error('[book-reader] 删除书签失败', err)
      }
    },
    [reloadBookmarks]
  )

  // 排版尺寸 / 参数变化后重新测量，并把「刚才在读的那段文字」重新对到当前页
  const appearanceKey = `${prefs.readerSize}|${prefs.readerLeading}|${prefs.readerParaGap}|${prefs.readerPad}`
  useLayoutEffect(() => {
    if (phase !== 'ready' || !colW || !colH || !paras.length) return
    const cols = colRef.current
    if (!cols) return

    // 行宽上限是 CSS 变量算出来的（34em），所以**改字号会连带改栏宽**，
    // 而视口宽度变化先于 React state 落到 colW/colH 上。
    // 这一轮拿旧栏宽量出来的页数是错的，必须先同步几何再重算一遍；
    // 锚点原样留着别在这一轮消耗掉（消耗了就等于按错的页数跳一次，位置就飞了）。
    const liveW = Math.floor(vpRef.current?.clientWidth || 0)
    const liveH = Math.floor(vpRef.current?.clientHeight || 0)
    if (liveW && (Math.abs(liveW - colW) > 1 || Math.abs(liveH - colH) > 1)) {
      setBox({ w: liveW, h: liveH })
      return
    }

    const counted = Math.max(1, Math.round((cols.scrollWidth + GAP) / (colW + GAP)))
    // 必须先同步到 ref：scrollToPage 用 pagesRef 做钳制，
    // 否则首次测量时 pagesRef 还是初始的 1，恢复到靠后的页会被钳回第 1 页。
    pagesRef.current = counted
    setPages(counted)

    const first = !restoredRef.current
    if (first) restoredRef.current = true
    const anchor = pendingAnchorRef.current ?? (first ? jumpRef.current : null)
    pendingAnchorRef.current = null

    if (pendingEndRef.current) {
      pendingEndRef.current = false
      scrollToPage(counted - 1, false)
      return
    }
    if (anchor) {
      scrollToPage(Math.min(pageForCharOffset(anchor.charOffset, paras), counted - 1), false)
      jumpRef.current = null
      // 恢复完立刻记账，避免「刚打开就退出」把位置丢掉
      anchorRef.current = anchor.charOffset
      return
    }
    if (pageRef.current > counted - 1) scrollToPage(counted - 1, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, colW, colH, paras, appearanceKey, chapter, jumpSeq, scrollToPage])

  // 当前页最上面那段文字 = 位置锚点（换字号、旋屏、下次打开都靠它）
  useEffect(() => {
    if (phase !== 'ready' || !paras.length) return
    const seg = firstSegOnPage(colRef.current, page, geo())
    if (!seg?.el) return
    const abs = Number(seg.el.dataset.start)
    if (Number.isFinite(abs)) anchorRef.current = Math.max(0, abs - (chap?.start ?? 0))
  }, [page, phase, paras, chap, colW, colH, geo])

  const onScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const vp = vpRef.current
      const w = boxRef.current.w
      if (!vp || !w) return
      const p = Math.round(vp.scrollLeft / (w + GAP))
      setPage((prev) => (prev === p ? prev : p))
    })
  }, [])

  /* ---------------- 进度写回 ---------------- */

  useEffect(() => {
    if (phase !== 'ready' || !restoredRef.current) return
    pendingRef.current = {
      chapterIndex: chapter,
      charOffset: anchorRef.current,
      // 书架按 page / pageCount 算百分比，这里让 page 表示「第几章」
      page: chapter + 1,
      mode: 'page',
    }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const patch = pendingRef.current
      pendingRef.current = null
      if (patch) saveProgress(bookId, patch)
    }, 600)
  }, [chapter, page, phase, bookId])

  // 兜底写出：离开阅读器、页面转后台 / 关闭时立刻补写。
  // 只依赖 bookId，所以 cleanup 只在真正卸载时跑 —— 与 PdfReader 同一个坑的同一套解法。
  useEffect(() => {
    const flush = () => {
      const patch = pendingRef.current
      if (!patch) return
      pendingRef.current = null
      saveProgress(bookId, patch)
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [bookId])

  /* ---------------- 外观设置 ---------------- */

  const applyAppearance = useCallback((patch) => {
    const reflow = ['readerSize', 'readerLeading', 'readerParaGap', 'readerPad'].some(
      (k) => k in patch
    )
    // 排版参数一变就要重排，先记住锚点，重排后回到同一段文字
    if (reflow) pendingAnchorRef.current = { charOffset: anchorRef.current }
    const next = savePrefs(patch)
    setPrefs(next)
    if (patch.readerTheme) setTheme(patch.readerTheme)
  }, [])

  const resetAppearance = useCallback(() => {
    pendingAnchorRef.current = { charOffset: anchorRef.current }
    setPrefs(
      savePrefs({
        readerSize: DEFAULT_PREFS.readerSize,
        readerLeading: DEFAULT_PREFS.readerLeading,
        readerParaGap: DEFAULT_PREFS.readerParaGap,
        readerPad: DEFAULT_PREFS.readerPad,
      })
    )
  }, [])

  /* ---------------- 沉浸 / 常亮 / 双指缩放 ---------------- */

  // 进入沉浸先把工具栏收起来（之后点中间区仍可临时唤出，和视频播放器一个套路）
  useEffect(() => {
    setUi(!immersive)
  }, [immersive])

  const toggleKeepAwake = useCallback(() => {
    const next = !loadPrefs().readerKeepAwake
    savePrefs({ readerKeepAwake: next })
    keepAwake.setOn(next)
  }, [keepAwake])

  /**
   * 双指缩放调的是**字号**，不是 CSS 缩放。
   *
   * 流式排版的书没有「原始尺寸」这个概念 —— 把整块文字 transform 放大，
   * 一屏里的字反而更少、还要左右拖着看。调字号才是真正的「放大正文」：
   * 重新分栏、填满屏幕，而且位置锚点是字符偏移，重排后仍然停在原处。
   *
   * 提交时吸附到 §4.2 的档位：一来和滑杆共用同一张表，二来**吸附本身就是节流** ——
   * 档位没变就不重排，手势中不会每帧触发一次分栏计算。
   */
  const commitPinchSize = useCallback(
    (size) => {
      const snapped = snapReaderSize(size)
      if (snapped === prefsRef.current.readerSize) return snapped
      applyAppearance({ readerSize: snapped })
      return snapped
    },
    [applyAppearance]
  )

  const { shouldIgnoreSwipe } = usePinch({
    targetRef: vpRef,
    feedbackRef: pinchRef,
    enabled: phase === 'ready',
    getValue: () => prefsRef.current.readerSize,
    commit: commitPinchSize,
    min: 8,
    max: 60,
  })

  const menuRows = [
    {
      key: 'wake',
      type: 'switch',
      label: '阅读时常亮',
      on: keepAwake.on,
      note: keepAwake.supported ? '' : '此设备不支持',
      onToggle: toggleKeepAwake,
    },
    {
      key: 'immersive',
      type: 'switch',
      label: '全屏沉浸',
      on: immersive,
      note: fsSupported ? '' : '仅隐藏界面',
      onToggle: toggleImmersive,
    },
    {
      key: 'appearance',
      type: 'action',
      label: '外观设置',
      value: `${prefs.readerSize}px · 行距 ${prefs.readerLeading}`,
      onClick: () => {
        setMenu(false)
        setAppearance(true)
      },
    },
  ]

  /* ---------------- 交互 ---------------- */

  useEffect(() => {
    if (phase !== 'ready') return
    const t = setTimeout(() => setUi(false), 3500)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    const onKey = (e) => {
      if (drawer || appearance || menu) return
      if (e.key === 'Escape') {
        if (popoverRef.current) return
        return onBack()
      }
      // Alt+← 回退到跳转前的位置（浏览器自己的后退是 Cmd/Ctrl+←，不冲突）
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        backToPrev()
        return
      }
      if (e.key === ' ') e.preventDefault()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        nextPage()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        prevPage()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nextPage, prevPage, onBack, drawer, appearance, menu, backToPrev])

  // 点屏幕：左 1/3 上一页、右 1/3 下一页、中间唤出 / 收起菜单
  const onStageClick = useCallback(
    (e) => {
      if (popoverRef.current) return
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) return
      const vp = vpRef.current
      if (!vp) return
      const r = vp.getBoundingClientRect()
      const rel = (e.clientX - r.left) / Math.max(1, r.width)
      if (rel < 0.32) prevPage()
      else if (rel > 0.68) nextPage()
      else setUi((v) => !v)
    },
    [nextPage, prevPage]
  )

  /* ---------------- 划词高亮 ---------------- */

  const closePopover = useCallback(() => {
    popoverRef.current = null
    setPopover(null)
  }, [])

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
    const cols = colRef.current
    if (!cols || !chap) return
    const data = selectionOffsets(cols)
    if (!data) return
    const next = {
      mode: 'new',
      from: Math.max(0, data.from - chap.start),
      to: Math.max(0, data.to - chap.start),
      text: data.text,
      rect: data.rect,
    }
    popoverRef.current = next
    setPopover(next)
  }, [chap])

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
      if (down) return
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
    setHighlights(await listHighlights(bookId).catch(() => []))
  }, [bookId])

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
        if (p.existing) {
          await updateHighlight(p.existing.id, { color })
        } else {
          // 存成与 PDF 相同的形状：page 表示章序号，start/end 的 offset 是章内字符偏移。
          // 这样笔记列表、导出、备份恢复都不用为 TXT 单独开一套。
          await addHighlight({
            bookId,
            page: chapterRef.current,
            start: { item: 0, offset: p.from },
            end: { item: 0, offset: p.to },
            text: p.text,
            color,
          })
        }
        await reloadHighlights()
      } catch (err) {
        console.error('[book-reader] 保存高亮失败', err)
      }
      clearNativeSelection()
      closePopover()
    },
    [bookId, closePopover, reloadHighlights]
  )

  const removeMark = useCallback(
    async (target) => {
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

  const copyText = useCallback(async () => {
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

  const onMarkClick = useCallback((markId, e) => {
    e.stopPropagation()
    const mark = highlightsRef.current.find((h) => h.id === markId)
    if (!mark) return
    const next = {
      mode: 'edit',
      existing: mark,
      text: mark.text,
      rect: e.currentTarget.getBoundingClientRect(),
    }
    popoverRef.current = next
    setPopover(next)
  }, [])

  /* ---------------- 笔记导出 / 搜索 ---------------- */

  const onExportNotes = useCallback(() => {
    try {
      const r = exportNotes({ title }, highlights, { unit: '章', bookmarks })
      setToast(
        r.count ? `已导出 ${r.count} 条笔记：${r.filename}` : '这本书还没有笔记，已导出空文件'
      )
    } catch (err) {
      setToast(`导出失败：${err?.message || '未知错误'}`)
    }
  }, [title, highlights, bookmarks])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // TXT 不需要持久化索引：整本是内存里的一个字符串，切片即得
  const chapterTexts = useMemo(
    () => (doc ? doc.chapters.map((c) => doc.text.slice(c.start, c.end)) : null),
    [doc]
  )

  const doSearch = useCallback(
    (sources, q) => searchChapters(doc?.text ?? '', doc?.chapters ?? [], q),
    [doc]
  )

  const onJumpHit = useCallback(
    (hit) => jumpToAnchor(hit.page, hit.from || 0),
    [jumpToAnchor]
  )

  /* ---------------- 渲染 ---------------- */

  const outline = useMemo(
    () => chapters.map((c, i) => ({ key: `c${i}`, title: c.title, pageIndex: i })),
    [chapters]
  )

  // 当前章的高亮，换算成全文绝对偏移后交给 splitByMarks 切段
  const marksAbs = useMemo(() => {
    if (!chap) return []
    return highlights
      .filter((h) => h.page === chapter)
      .map((h) => ({
        id: h.id,
        color: h.color,
        from: chap.start + (h.start?.offset ?? 0),
        to: chap.start + (h.end?.offset ?? 0),
      }))
      .filter((m) => m.to > m.from)
  }, [highlights, chapter, chap])

  const readerStyle = {
    '--reader-size': `${prefs.readerSize}px`,
    '--reader-leading': prefs.readerLeading,
    '--reader-para-gap': `${prefs.readerParaGap}em`,
    '--reader-pad': `${prefs.readerPad}px`,
  }

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

  const pct = chapterPercent(chapter, Math.max(1, total))

  return (
    <div
      className={`reader txt-reader${immersive ? ' immersive' : ''}`}
      data-reader-theme={theme}
      style={readerStyle}
    >
      <div className="txt-stage" onClick={onStageClick}>
        <div
          className="txt-viewport"
          ref={vpRef}
          onScroll={onScroll}
          onTouchStart={(e) => {
            // 双指落下时不要用它当「滑动起点」：两指的起点终点混在一起会算出一个
            // 巨大的位移，松手时被当成翻页
            if (e.touches.length > 1) {
              touchRef.current = null
              return
            }
            const t = e.touches[0]
            touchRef.current = { x: t.clientX, y: t.clientY }
          }}
          onTouchEnd={(e) => {
            const start = touchRef.current
            touchRef.current = null
            if (!start) return
            // 刚做完双指缩放：`changedTouches[0]` 的位移可能远超 50px，别误判成翻页
            if (shouldIgnoreSwipe()) return
            const t = e.changedTouches[0]
            const dx = t.clientX - start.x
            const dy = t.clientY - start.y
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
              if (dx < 0) nextPage()
              else prevPage()
            }
          }}
        >
          <div
            className="txt-columns"
            ref={setCols}
            style={{
              width: colW || 1,
              height: colH || 1,
              columnWidth: colW || 1,
              columnGap: GAP,
            }}
          >
            {paras.map((p, i) => (
              <p
                key={p.start}
                className={`txt-p${i === 0 && /^第.+[章节節回卷]/.test(p.text) ? ' txt-p-title' : ''}`}
                data-seg={i}
                data-start={p.start}
              >
                {splitByMarks(p.text, p.start, marksAbs).map((piece, k) =>
                  piece.mark ? (
                    <mark
                      key={k}
                      data-color={piece.mark.color}
                      onClick={(e) => onMarkClick(piece.mark.id, e)}
                    >
                      {piece.text}
                    </mark>
                  ) : (
                    <span key={k}>{piece.text}</span>
                  )
                )}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className={`reader-top${ui ? '' : ' hidden'}`}>
        <button className="btn btn-sm" onClick={onBack}>
          返回
        </button>
        {histDepth > 0 && (
          <button
            className="btn btn-sm"
            onClick={backToPrev}
            title="回到跳转前的位置（Alt+←）"
            aria-label="回到跳转前的位置"
          >
            ↩
          </button>
        )}
        <div className="txt-head">
          <div className="txt-head-title">{chap?.title || title}</div>
          <div className="txt-head-sub">
            第 {chapter + 1}/{total} 章 · {pct}%
          </div>
        </div>
        <button
          className="btn btn-sm toolbar-optional"
          onClick={() => goChapter(chapter - 1, 0, true)}
          disabled={chapter <= 0}
          title="上一章"
        >
          上一章
        </button>
        <button
          className="btn btn-sm toolbar-optional"
          onClick={() => goChapter(chapter + 1)}
          disabled={chapter >= total - 1}
          title="下一章"
        >
          下一章
        </button>
        <BookmarkButton on={!!currentBookmark} onToggle={toggleBookmark} />
        <button
          className="btn btn-sm"
          onClick={() => setAppearance(true)}
          title="字号与主题"
          aria-label="外观设置"
        >
          Aa
        </button>
        <button
          className="btn btn-sm"
          onClick={() => setMenu(true)}
          title="显示设置：常亮 / 沉浸"
          aria-label="显示设置"
        >
          ⋯
        </button>
        <button className="btn btn-sm" onClick={() => setDrawer(true)}>
          面板
        </button>
      </div>

      <div className={`reader-bottom${ui ? '' : ' hidden'}`} onClick={(e) => e.stopPropagation()}>
        <div className="scrub">
          <span className="scrub-chap">
            第 {chapter + 1}/{total} 章
          </span>
          <input
            type="range"
            min={1}
            max={Math.max(1, pages)}
            value={page + 1}
            onChange={(e) => scrollToPage(Number(e.target.value) - 1, false)}
          />
          <span className="scrub-num">
            {page + 1} / {pages}
          </span>
        </div>
      </div>

      {popover && (
        <SelectionPopover
          data={popover}
          onPick={pickColor}
          onDelete={removeMark}
          onCopy={copyText}
          onClose={closePopover}
        />
      )}

      {appearance && (
        <AppearancePanel
          values={prefs}
          theme={theme}
          onChange={applyAppearance}
          onReset={resetAppearance}
          onClose={() => setAppearance(false)}
        />
      )}

      {menu && <DisplayMenu rows={menuRows} onClose={() => setMenu(false)} />}

      {drawer && (
        <SidePanel
          outline={outline}
          current={chapter + 1}
          onClose={() => setDrawer(false)}
          onJumpPage={jumpToChapter}
          highlights={highlights}
          onMarkClick={onMarkClick}
          onMarkDelete={removeMark}
          onNoteJump={(h) => jumpToAnchor(h.page, h.start?.offset ?? 0)}
          bookmarks={bookmarks}
          currentBookmark={currentBookmark}
          onBookmarkToggle={toggleBookmark}
          onJumpBookmark={onJumpBookmark}
          onBookmarkDelete={onBookmarkDelete}
          ensureIndex={async () => chapterTexts}
          search={doSearch}
          pageLabel={(i) => `第${i + 1}章`}
          onJumpHit={onJumpHit}
          onExportNotes={onExportNotes}
          query={query}
          setQuery={setQuery}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
