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
import { searchChapters, segmentAt, chapterPercent } from '../lib/txtText'
import { firstSegOnPage, pageOfSegment, selectionOffsets } from '../lib/txtSel'
import { openEpub, readChapter, readResource } from '../lib/epub'
import { buildChapter, markedHtml } from '../lib/epubDom'
import { resolveHref } from '../lib/zip'
import { exportNotes } from '../lib/backup'
import useHistoryStack from '../hooks/useHistoryStack'
import useWakeLock from '../hooks/useWakeLock'
import useImmersive from '../hooks/useImmersive'
import usePinch from '../hooks/usePinch'
import SidePanel from './SidePanel'
import SelectionPopover from './SelectionPopover'
import AppearancePanel from './AppearancePanel'
import DisplayMenu from './DisplayMenu'
import BookmarkButton from './BookmarkButton'

/** 栏间距，必须与 styles.css 里 .reader.txt-reader 的 --txt-gap 保持一致 */
const GAP = 40

const EMPTY = []

/** 空章节也要有内容，否则「页数测量」这条链路根本不会跑，翻页控件会卡在上一次的数值上 */
const EMPTY_SEG = {
  start: 0,
  kind: 'p',
  level: 0,
  bullet: '',
  wrap: true,
  html: '（这一节没有正文）',
  text: '（这一节没有正文）',
}

/**
 * 章里还有没解码完的图片吗？
 *
 * 图片的固有尺寸要等解码完才知道，在那之前 <img> 的盒子是空的 —— 也就是说**版面还没定**。
 * 这期间量出来的「某一段在第几栏」是错的（图片随后会把那一栏撑开，后面的内容整体往后挪）。
 * 位置照这个错版面落下去，结果就是「退出再进来差一页」。
 * 所以有锚点要落的时候，必须等图片都 load / error 过再落。
 */
function hasPendingImages(cols) {
  const imgs = cols.querySelectorAll('img')
  for (const im of imgs) if (!im.complete) return true
  return false
}

/**
 * EPUB 阅读器。
 *
 * 版式层与 TXT 完全一致 —— 同样是 CSS 多栏分页、同样用「章 + 章内字符偏移」当锚点、
 * 同样复用 `.txt-*` 那套样式与 `lib/txtSel.js` 的划词换算（见 epubDom.js 开头的说明）。
 * 差别只在「章从哪来」：TXT 是一个大字符串切出来的，EPUB 是压缩包里一个个 XHTML，
 * 所以章节内容是**异步按需载入**的，而排版参数每变一次都要重排。
 *
 * 由此带来一个必须守住的约束：**测量/定位只能在「当前章的段落已经就位」时进行**。
 * 所以段落与它所属的章序号打包成一个 bundle 一起 setState，凡是拿段落做几何计算的地方
 * 都先确认 `bundle.chapter === chapter`，否则会用上一章的布局去算这一章的位置。
 */
export default function EpubReader({ bookId, title, onBack }) {
  const [phase, setPhase] = useState('loading')
  const [msg, setMsg] = useState('正在打开…')
  const [epub, setEpub] = useState(null)
  const [bundle, setBundle] = useState(null)
  const [chapter, setChapter] = useState(0)
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [ui, setUi] = useState(true)
  const [drawer, setDrawer] = useState(false)
  const [appearance, setAppearance] = useState(false)
  const [menu, setMenu] = useState(false)
  const [prefs, setPrefs] = useState(() => loadPrefs())
  const [theme, setTheme] = useState(() => resolveTheme(loadPrefs()))
  const [highlights, setHighlights] = useState([])
  const [bookmarks, setBookmarks] = useState([])
  const [popover, setPopover] = useState(null)
  const [toast, setToast] = useState('')
  const [query, setQuery] = useState('')
  const [jumpSeq, setJumpSeq] = useState(0)
  // 图片解码完版面会变，用这个自增触发一次重测
  const [measureSeq, setMeasureSeq] = useState(0)
  // 全书实时进度（%）：章号 + 章内锚点插值。随翻页 / 滚动不断刷新；
  // null = 还没量出来，回退到章号百分比
  const [finePct, setFinePct] = useState(null)

  const {
    on: immersive,
    supported: fsSupported,
    toggle: toggleImmersive,
  } = useImmersive()
  const keepAwake = useWakeLock(prefs.readerKeepAwake)

  const vpRef = useRef(null)
  const colRef = useRef(null)
  const boxRef = useRef({ w: 0, h: 0 })
  const epubRef = useRef(null)
  const bundleRef = useRef(null)
  const pageRef = useRef(0)
  const chapterRef = useRef(0)
  const pagesRef = useRef(1)
  const highlightsRef = useRef([])
  const rafRef = useRef(0)
  const saveTimer = useRef(0)
  // 有没有「位置变了但还没写回」——写回时再读 anchorRef，见下面「进度写回」的说明
  const dirtyRef = useRef(false)
  // flushNow 要在多处被调用（滚动停稳、卸载兜底），用 ref 转一手，免得互相成为依赖
  const flushRef = useRef(() => {})
  const pendingAnchorRef = useRef(null)
  const pendingEndRef = useRef(false)
  const anchorRef = useRef(0)
  const jumpRef = useRef(null)
  const restoredRef = useRef(false)
  // 恢复看门狗：滚动模式的「恢复」若赶上版面没定（图片晚到等），落点会偏。
  // 恢复完成后 700ms 核对一次实际顶段，用户没动过且偏了就重新落一次。
  const restoreWatchRef = useRef(0)
  const restoreAbortRef = useRef(null)
  const userMovedRef = useRef(false)
  const popoverRef = useRef(null)
  const touchRef = useRef(null)
  // segs 的镜像：给不随 segs 重建的回调（如 syncAnchorFromScroll）读当前段列表用
  const segsRef = useRef([])
  const prefsRef = useRef(loadPrefs())
  /** 版式也留一份 ref：滚动 / 翻页的分支都在回调里，不该把它们变成依赖（会重建一堆 useCallback） */
  const flowRef = useRef(loadPrefs().readerFlow)
  const pinchRef = useRef(null)
  const textsRef = useRef(null)
  const indexRef = useRef(null)
  const setCols = useCallback((el) => {
    colRef.current = el
    pinchRef.current = el
  }, [])

  boxRef.current = box
  epubRef.current = epub
  bundleRef.current = bundle
  pageRef.current = page
  chapterRef.current = chapter
  pagesRef.current = pages
  highlightsRef.current = highlights
  prefsRef.current = prefs
  flowRef.current = prefs.readerFlow

  /** 当前版式：'page'（一次一屏，左右翻页）/ 'scroll'（本节内竖向滚动） */
  const flow = prefs.readerFlow

  const chapters = epub?.chapters ?? EMPTY
  const total = chapters.length
  const chap = chapters[chapter] ?? null

  // 段落必须属于「当前这一章」才能拿去排版，否则宁可当空
  const segs = bundle && bundle.chapter === chapter ? bundle.segs : EMPTY
  segsRef.current = segs
  const pathToChapter = useMemo(
    () => new Map(chapters.map((c) => [c.path, c.index])),
    [chapters]
  )

  /* ---------------- 打开：解容器、读元数据、恢复进度 ---------------- */

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const blob = await getBlob(bookId)
        if (!blob) throw new Error('文件已丢失，请重新导入')
        setMsg('正在解析 EPUB…')
        const book = await openEpub(await blob.arrayBuffer())
        if (!alive) return
        setEpub(book)

        const saved = await db.progress.get(bookId)
        if (!alive) return
        if (saved && Number.isFinite(saved.chapterIndex)) {
          jumpRef.current = {
            chapterIndex: Math.min(Math.max(0, saved.chapterIndex), book.chapters.length - 1),
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

  /* ---------------- 按章载入正文 + 图片 ---------------- */

  useEffect(() => {
    if (phase !== 'ready' || !epub) return
    const target = epub.chapters[chapter]
    if (!target) return
    let alive = true
    const urls = []
    const urlCache = new Map()

    ;(async () => {
      try {
        const html = await readChapter(epub, chapter)
        if (!alive) return
        const built = html
          ? await buildChapter({
              html,
              chapterPath: target.path,
              // 章内图片有限，一次载入一批就够；切章时整批回收（见下面的 segs 回收 effect）
              getResource: async (abs) => {
                if (urlCache.has(abs)) return urlCache.get(abs)
                const res = await readResource(epub, abs)
                if (!res) {
                  urlCache.set(abs, null)
                  return null
                }
                const url = URL.createObjectURL(res)
                urls.push(url)
                urlCache.set(abs, url)
                return url
              },
            })
          : { segs: [], ids: new Map(), text: '' }
        if (!alive) return
        setBundle({
          chapter,
          segs: built.segs.length ? built.segs : [EMPTY_SEG],
          ids: built.ids,
          urls,
        })
      } catch (err) {
        if (!alive) return
        setToast(`这一节读不出来：${err?.message || '解析失败'}`)
        setBundle({ chapter, segs: [EMPTY_SEG], ids: new Map(), urls: [] })
      }
    })()

    return () => {
      alive = false
      // 载入中途切走的话，这批 objectURL 没人会用，当场回收
      for (const u of urls) URL.revokeObjectURL(u)
    }
  }, [phase, epub, chapter])

  // bundle 被换掉（切章）时回收上一章的图片 —— 此时 DOM 已经换成新内容，没人再引用它们
  useEffect(() => {
    const urls = bundle?.urls ?? EMPTY
    return () => {
      for (const u of urls) URL.revokeObjectURL(u)
    }
  }, [bundle])

  useEffect(() => {
    setUi(!immersive)
  }, [immersive])

  /* ---------------- 分栏测量与定位 ---------------- */

  const colW = box.w
  const colH = box.h

  useEffect(() => {
    const el = vpRef.current
    if (phase !== 'ready' || !el) return
    const apply = () => {
      const w = Math.floor(el.clientWidth)
      const h = Math.floor(el.clientHeight)
      if (w === boxRef.current.w && h === boxRef.current.h) return
      // 与 TxtReader 同一条教训：锚点直接取 anchorRef，**不要**在这里拿旧几何重推，
      // 字号一变内容当场就重排完了（字号走 CSS 变量，不经过 React）。
      // 另外：有还没落定的锚点时不要盖掉它（那是明确的目标，比当前位置可信）。
      if (boxRef.current.w && restoredRef.current && !pendingAnchorRef.current) {
        pendingAnchorRef.current = { charOffset: anchorRef.current }
      }
      setBox({ w, h })
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [phase])

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
    // 用户主动翻页 = 故意换位置：恢复看门狗作废（与 scrollToSeg 同一个理由）
    clearTimeout(restoreWatchRef.current)
    restoreAbortRef.current?.abort()
    const target = Math.max(0, Math.min(p, pagesRef.current - 1))
    const x = target * (w + GAP)
    if (smooth) vp.scrollTo({ left: x, behavior: 'smooth' })
    else vp.scrollLeft = x
    setPage(target)
  }, [])

  /* ---------------- 竖向滚动版式（flow === 'scroll'） ----------------
     分页模式的「位置」是 scrollLeft 除以栏宽；滚动模式的位置则直接是 DOM 几何 ——
     视口顶部压着的是哪一段，人就在哪儿。下面三个函数就是这套坐标的换算，
     其余逻辑（书签 / 后退栈 / 进度写回 / 划词 / 内链）**一行都不用改**，
     因为它们只认「章 + 章内偏移」和「当前单位」这两个抽象。 */

  /**
   * 视口顶部压着的那一段。
   *
   * 用 rect.bottom > 视口顶 找第一段「跨过顶线」的：它才是此刻在读的那一段。
   * 长段落从上方延续过来时它也正好是那一段，所以不像分页模式那样需要「往前退一段」的兜底；
   * 只有滚到最底部（后面已经没有内容）时才返回最后一段。
   */
  const topSegInFlow = useCallback(() => {
    const cols = colRef.current
    const vp = vpRef.current
    if (!cols || !vp) return null
    const top = vp.getBoundingClientRect().top
    let last = null
    for (const el of cols.children) {
      if (el.getBoundingClientRect().bottom > top + 1) return { el, exact: true }
      last = el
    }
    return last ? { el: last, exact: false } : null
  }, [])

  /** 把第 idx 段顶到视口最上面。用实时 rect 差值算，不去猜 offsetParent 链 */
  const scrollToSeg = useCallback((idx) => {
    const vp = vpRef.current
    const el = colRef.current?.children?.[idx]
    if (!vp || !el) return
    // 滑杆 / 锚点跳转都是「故意换位置」：恢复看门狗作废。否则目录跳转后 700ms 内
    // 一拖滑杆，看门狗会拿跳转时的旧锚点当标准，把视口又拽回去（踩过）。
    clearTimeout(restoreWatchRef.current)
    restoreAbortRef.current?.abort()
    vp.scrollTop += el.getBoundingClientRect().top - vp.getBoundingClientRect().top
  }, [])

  /** 章内字符偏移 → 滚到那一段（滚动模式的「跳转」） */
  const scrollToOffset = useCallback(
    (charOffset, list) => {
      scrollToSeg(segmentAt(list, Math.max(0, charOffset || 0)))
    },
    [scrollToSeg]
  )

  /** 恢复看门狗（滚动模式）：700ms 后核对实际顶段，用户没动过且偏了就重新落一次。幂等。 */
  const armRestoreWatch = useCallback(
    (off, list) => {
      clearTimeout(restoreWatchRef.current)
      restoreAbortRef.current?.abort()
      const vp = vpRef.current
      if (!vp) return
      userMovedRef.current = false
      const ac = new AbortController()
      restoreAbortRef.current = ac
      const mark = () => {
        userMovedRef.current = true
      }
      vp.addEventListener('touchstart', mark, { signal: ac.signal, passive: true })
      vp.addEventListener('wheel', mark, { signal: ac.signal, passive: true })
      vp.addEventListener('pointerdown', mark, { signal: ac.signal })
      restoreWatchRef.current = setTimeout(() => {
        restoreWatchRef.current = 0
        try {
          ac.abort()
        } catch {
          /* 已 abort 也无所谓 */
        }
        if (userMovedRef.current) return
        const seg = topSegInFlow()
        const cur = seg?.el ? Number(seg.el.dataset.start) : -1
        const idx = segmentAt(list, Math.max(0, off || 0))
        const want = idx >= 0 ? Number(list[idx]?.start ?? off) : off
        if (cur >= 0 && cur !== want) scrollToOffset(off, list)
      }, 700)
    },
    [topSegInFlow, scrollToOffset]
  )

  /** 章内字符偏移 → 应该在当前位置序号上的第几个单位 */
  const pageForCharOffset = useCallback(
    (charOffset, list) => {
      const idx = segmentAt(list, Math.max(0, charOffset || 0))
      if (idx < 0) return 0
      // 滚动模式里「当前单位」就是**段下标**（视口顶部压着第几段）。
      // 书签与后退栈的判据是「目标单位 == 当前单位」，把单位从「栏」换成「段」即可，
      // 判据本身不用动 —— 与分页模式是同一条（见 MEMORY 的「锚点落在当前显示的栏里」）。
      if (flowRef.current === 'scroll') return idx
      const p = pageOfSegment(colRef.current, idx, geo())
      return p < 0 ? 0 : p
    },
    [geo]
  )

  /** 锚点 id → 章内偏移。目录里的 'ch2.xhtml#part2' 这种深链靠它落到具体位置 */
  const offsetOfFragment = useCallback((fragment, list, ids) => {
    if (!fragment) return 0
    const i = ids?.get(fragment)
    if (i == null || !list[i]) return 0
    return list[i].start
  }, [])

  /** 把可能带锚点的目标解析成章内偏移 */
  const resolveAnchor = useCallback(
    (anchor, list, ids) => {
      if (!anchor) return 0
      if (typeof anchor.charOffset === 'number') return anchor.charOffset
      return offsetOfFragment(anchor.fragment, list, ids)
    },
    [offsetOfFragment]
  )

  /**
   * 全书实时百分比：章号 + 章内锚点插值。EPUB 的章没有全局字符基点（懒加载），
   * 用「(当前章 + 章内进度) / 总章数」估算，章内进度 = 锚点 ÷ 本章文本长度。
   */
  const pctFromAnchor = useCallback((off) => {
    const list = segsRef.current
    const n = epubRef.current?.chapters?.length ?? 0
    if (!n) return 0
    const last = list[list.length - 1]
    const len = last ? (last.start ?? 0) + (last.text?.length ?? 0) + 1 : 1
    const intra = Math.max(0, Math.min(1, (off || 0) / Math.max(1, len)))
    return Math.max(0, Math.min(100, Math.round(((chapterRef.current + intra) / n) * 100)))
  }, [])

  /** 换章。charOffset 可以是数字，也可以是 { fragment }（目录 / 内链的深链） */
  const goChapter = useCallback((i, charOffset = 0, atEnd = false) => {
    const n = epubRef.current?.chapters?.length ?? 0
    if (!n) return
    const t = Math.max(0, Math.min(Math.round(i), n - 1))
    pendingAnchorRef.current = atEnd ? null : typeof charOffset === 'number' ? { charOffset } : charOffset
    // 立刻把锚点记到目标位置：换章加载期间若退出，兜底 flush 才不会把
    // 上一章的偏移混着新章号写进进度
    if (typeof charOffset === 'number') anchorRef.current = Math.max(0, charOffset || 0)
    // 新章的 segs 还没加载，章内进度先按 0 算，加载完由锚点同步刷新
    setFinePct(Math.max(0, Math.min(100, Math.round((t / n) * 100))))
    // 换章后位置正在变化，恢复看门狗作废
    clearTimeout(restoreWatchRef.current)
    restoreAbortRef.current?.abort()
    pendingEndRef.current = atEnd
    restoredRef.current = true
    const vp = vpRef.current
    // 换章要把视口回到开头。两种版式各自回到自己的原点：横向的 scrollLeft 或竖向的 scrollTop
    if (vp) {
      if (flowRef.current === 'scroll') vp.scrollTop = 0
      else vp.scrollLeft = 0
    }
    setPage(0)
    setChapter(t)
    // 同章内跳转时 chapter / segs 都没变，定位副作用不会重跑 —— 用自增序号把
    // 「跳转」这件事本身变成依赖（TxtReader 里同样的坑）
    setJumpSeq((s) => s + 1)
  }, [])

  /**
   * 滚动模式下的「翻页」= 往下滚一屏。
   *
   * 这就是「只在当前节内滚动」的边界行为：滚到底再往下走，才进下一节
   * （而不是无声无息地无限加载）。往上同理，退到节首再往上走回到上一节的末尾。
   */
  const scrollByScreen = useCallback(
    (dir) => {
      const vp = vpRef.current
      if (!vp) return
      // 用户主动滑动 = 故意换位置：恢复看门狗作废（与 scrollToSeg 同一个理由）
      clearTimeout(restoreWatchRef.current)
      restoreAbortRef.current?.abort()
      const max = Math.max(0, vp.scrollHeight - vp.clientHeight)
      if (dir > 0 && vp.scrollTop >= max - 4) return goChapter(chapterRef.current + 1, 0, false)
      if (dir < 0 && vp.scrollTop <= 4) return goChapter(chapterRef.current - 1, 0, true)
      const step = Math.max(60, vp.clientHeight * 0.9)
      const to = Math.max(0, Math.min(max, vp.scrollTop + dir * step))
      vp.scrollTo({ top: to, behavior: 'smooth' })
    },
    [goChapter]
  )

  const nextPage = useCallback(() => {
    if (flowRef.current === 'scroll') return scrollByScreen(1)
    if (pageRef.current < pagesRef.current - 1) scrollToPage(pageRef.current + 1, true)
    else goChapter(chapterRef.current + 1, 0, false)
  }, [scrollByScreen, scrollToPage, goChapter])

  const prevPage = useCallback(() => {
    if (flowRef.current === 'scroll') return scrollByScreen(-1)
    if (pageRef.current > 0) scrollToPage(pageRef.current - 1, true)
    else goChapter(chapterRef.current - 1, 0, true)
  }, [scrollByScreen, scrollToPage, goChapter])

  /**
   * 切换翻页 / 滚动。
   *
   * 版式换了，坐标系统也换了（栏 ↔ 段），但**位置本身没变** ——
   * 把当前锚点交给重排后的定位副作用再落一次，人就不会因为切了一下版式而跳走。
   */
  const toggleFlow = useCallback(() => {
    const next = flowRef.current === 'scroll' ? 'page' : 'scroll'
    pendingAnchorRef.current = { charOffset: anchorRef.current }
    setPrefs(savePrefs({ readerFlow: next }))
  }, [])

  /* ---------------- 位置后退栈 ---------------- */

  const { push: pushHist, pop: popHist, depth: histDepth } = useHistoryStack()

  const anchorIsHere = useCallback(
    (chapterIndex, charOffset) => {
      if (chapterIndex !== chapterRef.current) return false
      return pageForCharOffset(charOffset || 0, segs) === pageRef.current
    },
    [pageForCharOffset, segs]
  )

  const rememberHere = useCallback(() => {
    pushHist({ chapterIndex: chapterRef.current, charOffset: anchorRef.current })
  }, [pushHist])

  const jumpToChapter = useCallback(
    (p, frag) => {
      const t = Math.max(0, Math.min(Math.round(p) - 1, (epubRef.current?.chapters?.length ?? 1) - 1))
      if (!(t === chapterRef.current && pageRef.current === 0)) rememberHere()
      setDrawer(false)
      // 两种调用方：目录（SidePanel）传的是**整个节点**，节点自己带着 fragment；
      // 书内跨文件内链（followFragment）传的是字符串。都归一成 { fragment }。
      const anchor =
        typeof frag === 'string' ? { fragment: frag } : frag?.fragment ? { fragment: frag.fragment } : 0
      goChapter(t, anchor)
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
    setToast(`已回到第 ${entry.chapterIndex + 1} 节`)
  }, [goChapter, popHist])

  /* ---------------- 书签 ---------------- */

  const reloadBookmarks = useCallback(async () => {
    setBookmarks(await listBookmarks(bookId).catch(() => []))
  }, [bookId])

  /**
   * 当前页上已经有书签了吗？
   *
   * 用「书签偏移在当前排版下落在第几页」判定，而不是比 charOffset 是否相等：
   * 改字号 / 旋屏会重新分栏，同一个偏移可能落到另一页、也可能不再是页首。
   * 与 TXT 那边是同一条判据（见 MEMORY 的「锚点段落落在当前显示的那一栏」）。
   */
  const currentBookmark = useMemo(
    () =>
      bookmarks.find(
        (b) => b.page === chapter && pageForCharOffset(b.charOffset ?? 0, segs) === page
      ) ?? null,
    [bookmarks, chapter, page, pageForCharOffset, segs]
  )

  /** 当前页最上面那段文字的开头 —— 书签列表里的摘要 */
  const snippetHere = useCallback(() => {
    const seg =
      flowRef.current === 'scroll'
        ? topSegInFlow()
        : firstSegOnPage(colRef.current, pageRef.current, geo())
    const text = seg?.el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    return text.slice(0, 40)
  }, [geo, topSegInFlow])

  const toggleBookmark = useCallback(async () => {
    try {
      if (currentBookmark) {
        await deleteBookmark(currentBookmark.id)
        await reloadBookmarks()
        setToast('已删除这个书签')
        return
      }
      // 与进度写回同一个锚点（章序号 + 章内偏移），所以书签跳回去的位置
      // 和「下次打开回到的位置」天然一致
      await addBookmark({
        bookId,
        page: chapterRef.current,
        charOffset: anchorRef.current,
        label: chap?.title ?? '',
        snippet: snippetHere(),
      })
      await reloadBookmarks()
      setToast(`已加书签 · 第 ${chapterRef.current + 1} 节`)
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

  const appearanceKey = `${prefs.readerSize}|${prefs.readerLeading}|${prefs.readerParaGap}|${prefs.readerPad}`
  useLayoutEffect(() => {
    if (phase !== 'ready' || !segs.length) return
    const cols = colRef.current
    if (!cols) return

    // ---- 滚动模式：不量栏，直接把锚点那一段顶到视口顶部 ----
    if (flow === 'scroll') {
      // 图片还没解码完 → 版面还没定，锚点先按住（与分页模式同一个理由，见 hasPendingImages）
      if ((pendingAnchorRef.current || jumpRef.current) && hasPendingImages(cols)) return
      // 段数是这个版式下的「位置刻度」，滑杆要用它
      pagesRef.current = segs.length
      setPages(segs.length)
      const first = !restoredRef.current
      if (first) restoredRef.current = true
      const anchor = pendingAnchorRef.current ?? (first ? jumpRef.current : null)
      pendingAnchorRef.current = null
      if (pendingEndRef.current) {
        pendingEndRef.current = false
        const vp = vpRef.current
        if (vp) vp.scrollTop = vp.scrollHeight
        return
      }
      if (anchor) {
        const off = resolveAnchor(anchor, segs, bundleRef.current?.ids)
        scrollToOffset(off, segs)
        jumpRef.current = null
        // 恢复完立刻记账，避免「刚打开就退出」把位置丢掉
        anchorRef.current = off
        setFinePct(pctFromAnchor(off))
        armRestoreWatch(off, segs)
      }
      return
    }

    if (!colW || !colH) return

    // 行宽上限由 CSS 变量算出来，改字号会连带改栏宽，而视口宽度先于 React state 落到 colW。
    // 这一轮量出来的页数是错的 —— 先同步几何，锚点留着下一轮再消耗。
    const liveW = Math.floor(vpRef.current?.clientWidth || 0)
    const liveH = Math.floor(vpRef.current?.clientHeight || 0)
    if (liveW && (Math.abs(liveW - colW) > 1 || Math.abs(liveH - colH) > 1)) {
      setBox({ w: liveW, h: liveH })
      return
    }

    // 图片还没解码完 → 版面还没定，锚点先按住，等图片 load / error 触发重测再落（见 hasPendingImages）
    if ((pendingAnchorRef.current || jumpRef.current) && hasPendingImages(cols)) return

    const counted = Math.max(1, Math.round((cols.scrollWidth + GAP) / (colW + GAP)))
    // 先同步到 ref：scrollToPage 用 pagesRef 钳制，否则首次测量时 pagesRef 还是 1，
    // 恢复到靠后的页会被钳回第 1 页
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
      const off = resolveAnchor(anchor, segs, bundleRef.current?.ids)
      scrollToPage(Math.min(pageForCharOffset(off, segs), counted - 1), false)
      jumpRef.current = null
      anchorRef.current = off
      setFinePct(pctFromAnchor(off))
      return
    }
    if (pageRef.current > counted - 1) scrollToPage(counted - 1, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, colW, colH, segs, appearanceKey, chapter, jumpSeq, measureSeq, scrollToPage, flow, scrollToOffset, pctFromAnchor])

  /**
   * 把「当前页最上面那段文字」记成锚点。
   *
   * 真相在 DOM 里（滚出去多少就是第几页），所以读的是**实时 scrollLeft** 而不是 state 里的
   * `page` —— 定位发生在 useLayoutEffect 里，而这是个 useEffect，两者中间隔着 React 的一轮
   * 渲染，page 可能还停在上一轮的旧值；拿旧值算锚点会把刚恢复好的位置写成 0
   * （EPUB 特有的「图片 load 后重测」正好踩中这一拍）。
   *
   * 但实时值只在滚动**停下来**之后才等于目标页：翻页走的是 smooth 滚动，effect 跑的时候
   * 视口还停在原地（scrollLeft 约等于旧值），此刻算出来的是**上一页**的锚点。
   * 而滚动结束时 onScroll 里的 `setPage(prev === p ? prev : p)` 是个 no-op（page 早被
   * scrollToPage 设好了），effect 不会重跑 —— 于是锚点永远停在 0，表现为「退出再进来总是
   * 回到这一节开头」。所以滚动停稳后还要再同步一次，见下面 scrollend 那一段。
   */
  const syncAnchorFromScroll = useCallback(() => {
    const vp = vpRef.current
    if (!vp) return
    // 滚动模式的位置真相在竖向几何里，不经过「栏」
    let seg = null
    if (flowRef.current === 'scroll') {
      seg = topSegInFlow()
    } else {
      const w = boxRef.current.w
      if (!w) return
      const live = Math.max(0, Math.round(vp.scrollLeft / (w + GAP)))
      seg = firstSegOnPage(colRef.current, live, geo())
    }
    if (!seg?.el) return
    const abs = Number(seg.el.dataset.start)
    if (!Number.isFinite(abs)) return
    const next = Math.max(0, abs)
    if (next === anchorRef.current) return
    anchorRef.current = next
    setFinePct(pctFromAnchor(next))
    // 位置真的动了 → 重新排一次写回（不然只有 page 变化才会写）
    if (restoredRef.current) {
      dirtyRef.current = true
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => flushRef.current(), 600)
    }
  }, [geo, topSegInFlow, pctFromAnchor])

  useEffect(() => {
    if (phase !== 'ready' || !segs.length) return
    syncAnchorFromScroll()
  }, [page, phase, segs, colW, colH, syncAnchorFromScroll])

  // 滚动停稳后再同步一次锚点。用定时器而不是 scrollend 事件：后者 Safari 支持得晚，
  // 而这里需要的只是「scroll 事件安静了 120ms」这个信号，够用且到处都能跑。
  useEffect(() => {
    const vp = vpRef.current
    if (!vp || phase !== 'ready' || !segs.length) return
    let t = 0
    const onScroll = () => {
      clearTimeout(t)
      t = setTimeout(() => {
        t = 0
        syncAnchorFromScroll()
      }, 120)
    }
    vp.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(t)
      vp.removeEventListener('scroll', onScroll)
    }
  }, [phase, segs, colW, colH, syncAnchorFromScroll])

  // 章内图片是异步解码的，加载完版面会变 → 页数得重算，位置得照旧
  useEffect(() => {
    const cols = colRef.current
    if (!cols || !segs.length) return
    const onImg = (e) => {
      if (e.target?.tagName !== 'IMG') return
      // 位置还没落定（刚换章 / 刚恢复）时**不要**注入锚点：此刻 anchorRef 可能还是上一轮的
      // 旧值，注进去会把真正的目标盖掉。没锚点可落时才拿当前位置当锚点。
      if (restoredRef.current && !pendingAnchorRef.current) {
        pendingAnchorRef.current = { charOffset: anchorRef.current }
      }
      setMeasureSeq((s) => s + 1)
    }
    // 解码失败也要算「定下来了」，否则那个烂图会把定位一直按住
    cols.addEventListener('load', onImg, true)
    cols.addEventListener('error', onImg, true)
    return () => {
      cols.removeEventListener('load', onImg, true)
      cols.removeEventListener('error', onImg, true)
    }
  }, [segs])

  const onScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const vp = vpRef.current
      if (!vp) return
      if (flowRef.current === 'scroll') {
        const seg = topSegInFlow()
        const idx = seg?.el ? Number(seg.el.dataset.seg) : -1
        if (idx >= 0) setPage((prev) => (prev === idx ? prev : idx))
        return
      }
      const w = boxRef.current.w
      if (!w) return
      const p = Math.round(vp.scrollLeft / (w + GAP))
      setPage((prev) => (prev === p ? prev : p))
    })
  }, [topSegInFlow])

  /* ---------------- 进度写回 ---------------- */

  /**
   * 真正落库。**值在这里现读**（chapterRef / anchorRef），不在「排写回」的那一刻抓取：
   * 位置是异步落定的（smooth 滚动停稳、图片解码后重排都会改锚点），排写回时先抓一份
   * 就会把还没落定的旧位置存进去 —— 这正是「EPUB 永远记不住章内位置」的成因。
   */
  const flushNow = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = 0
    if (!dirtyRef.current) return
    dirtyRef.current = false
    saveProgress(bookId, {
      chapterIndex: chapterRef.current,
      charOffset: anchorRef.current,
      // 书架按 page / pageCount 算百分比，这里让 page 表示「第几节」
      page: chapterRef.current + 1,
      mode: 'page',
    })
  }, [bookId])
  flushRef.current = flushNow

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => flushRef.current(), 600)
  }, [])

  useEffect(() => {
    if (phase !== 'ready' || !restoredRef.current) return
    scheduleSave()
  }, [chapter, page, phase, bookId, scheduleSave])

  // 兜底写出：离开阅读器 / 页面转后台时立刻补写（只依赖 bookId，cleanup 只在真卸载时跑）
  useEffect(() => {
    const flush = () => flushRef.current()
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      clearTimeout(restoreWatchRef.current)
      restoreAbortRef.current?.abort()
      // 强制补写：dirty 标志若因任何竞态漏置，退出时仍以当前锚点兜底
      if (restoredRef.current) dirtyRef.current = true
      flush()
    }
  }, [bookId])

  /* ---------------- 外观 / 缩放 ---------------- */

  const applyAppearance = useCallback((patch) => {
    const reflow = ['readerSize', 'readerLeading', 'readerParaGap', 'readerPad'].some((k) => k in patch)
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

  const toggleKeepAwake = useCallback(() => {
    const next = !loadPrefs().readerKeepAwake
    savePrefs({ readerKeepAwake: next })
    keepAwake.setOn(next)
  }, [keepAwake])

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
    {
      // 窄屏上顶栏按钮会挤，这条是「切换翻页方式」的替代入口（DESIGN.md §15）
      key: 'flow',
      type: 'action',
      label: '翻页方式',
      value: flow === 'scroll' ? '竖向滚动' : '左右翻页',
      onClick: () => {
        setMenu(false)
        toggleFlow()
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

  /** 书里的内链：同章就直接滚过去，跨章就换章带上锚点 */
  const followFragment = useCallback(
    (raw) => {
      const cur = chapters[chapterRef.current]
      if (!cur) return
      const { path, fragment } = resolveHref(cur.path, raw)
      const target = pathToChapter.get(path)
      if (target == null) {
        setToast('这个链接指向书里没有的内容')
        return
      }
      const b = bundleRef.current
      const here = b?.chapter === chapterRef.current
      if (target === chapterRef.current && here) {
        const off = offsetOfFragment(fragment, b.segs, b.ids)
        if (!anchorIsHere(target, off)) rememberHere()
        pendingAnchorRef.current = { charOffset: off }
        setMeasureSeq((s) => s + 1)
        return
      }
      if (target !== chapterRef.current) {
        jumpToChapter(target + 1, fragment)
      }
    },
    [chapters, pathToChapter, offsetOfFragment, anchorIsHere, rememberHere, jumpToChapter]
  )

  /**
   * 点屏幕。
   *
   * 工具栏 3.5 秒后会自动收起，所以「点一下空白把工具栏唤回来」是最高频的动作，
   * 它绝不能被翻页抢走 —— 旧实现不分状态地按左/中/右分区，工具栏收起时点两侧就是翻页，
   * 翻完页工具栏又自己收了，人于是**永远调不出工具栏**。
   *
   *  · 工具栏**收起**时 → 点哪儿都只负责唤出，不翻页；
   *  · 工具栏**展开**时 → 滚动模式下点哪儿都只负责收起（滚动模式里「翻页」= 滚一屏，
   *    被一次误点触发很难受）；翻页模式下中间收起、左右各 1/4 翻页。
   */
  const onStageClick = useCallback(
    (e) => {
      if (popoverRef.current) return
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) return

      // 段落里的高亮 / 内链是 dangerouslySetInnerHTML 塞进去的，挂不了 onClick，
      // 只能在这里做事件委托
      const markEl = e.target.closest?.('mark[data-hl]')
      if (markEl) {
        const id = Number(markEl.getAttribute('data-hl'))
        const mark = highlightsRef.current.find((h) => h.id === id)
        if (mark) {
          const next = {
            mode: 'edit',
            existing: mark,
            text: mark.text,
            rect: markEl.getBoundingClientRect(),
          }
          popoverRef.current = next
          setPopover(next)
        }
        return
      }
      const link = e.target.closest?.('[data-frag]')
      if (link) {
        followFragment(link.getAttribute('data-frag'))
        return
      }

      // 点屏幕只干一件事：切换工具栏。翻页交给滑动 / 键盘 / 底栏「‹ ›」，
      // 不再按落点分区 —— 工具栏 3.5 秒自动收起，「点空白唤回」是最高频动作，
      // 被分区翻页抢走就会永远调不出工具栏（DESIGN.md §15.8）
      setUi((v) => !v)
    },
    [followFragment]
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
    if (!cols) return
    const data = selectionOffsets(cols)
    if (!data) return
    // 段上的 data-start 就是**章内**偏移，所以不用再减章起点（TXT 那边要减）
    const next = {
      mode: 'new',
      from: Math.max(0, data.from),
      to: Math.max(0, data.to),
      text: data.text,
      rect: data.rect,
    }
    popoverRef.current = next
    setPopover(next)
  }, [])

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
          // 与 PDF / TXT 同一种形状：page = 章序号，offset = 章内字符偏移。
          // 所以笔记列表、导出、备份恢复都不用为 EPUB 开分支。
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

  const onExportNotes = useCallback(() => {
    try {
      const r = exportNotes({ title }, highlights, { unit: '节', bookmarks })
      setToast(r.count ? `已导出 ${r.count} 条笔记：${r.filename}` : '这本书还没有笔记，已导出空文件')
    } catch (err) {
      setToast(`导出失败：${err?.message || '未知错误'}`)
    }
  }, [title, highlights, bookmarks])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(t)
  }, [toast])

  /* ---------------- 全文搜索 ---------------- */

  /**
   * 搜索索引 = 每一章的纯文本。**必须用 buildChapter 的产出去拼**，
   * 不能另外拿 textContent 去凑 —— 搜索命中的偏移要能直接落到段上（data-start），
   * 两套文本只要差一个空白字符，跳转就会偏。
   *
   * 懒建 + 缓存：EPUB 的正文是散在压缩包里的一个个 XHTML，第一次搜索要把它们
   * 全部解压解析一遍（几百章的书要一两秒），所以只能在用户真的搜索时才付这个代价。
   */
  const ensureIndex = useCallback(async () => {
    if (textsRef.current) return textsRef.current
    if (indexRef.current) return indexRef.current
    const book = epubRef.current
    if (!book) return null
    indexRef.current = (async () => {
      const out = []
      for (const ch of book.chapters) {
        const html = await readChapter(book, ch.index)
        if (!html) {
          out.push('')
          continue
        }
        const built = await buildChapter({ html, chapterPath: ch.path })
        out.push(built.text)
      }
      textsRef.current = out
      return out
    })()
    return indexRef.current
  }, [])

  const doSearch = useCallback((sources, q) => {
    const list = Array.isArray(sources) ? sources : textsRef.current
    if (!list) return []
    const out = []
    for (let c = 0; c < list.length && out.length < 200; c++) {
      const t = list[c]
      if (!t) continue
      // 每章单独扫一遍：searchChapters 的 from/to 是相对传入文本的偏移，
      // 传单章文本正好得到「章内偏移」，跳转直接用
      for (const hit of searchChapters(t, [{ start: 0, end: t.length }], q)) {
        out.push({ ...hit, page: c })
        if (out.length >= 200) break
      }
    }
    return out
  }, [])

  const onJumpHit = useCallback((hit) => jumpToAnchor(hit.page, hit.from || 0), [jumpToAnchor])

  /* ---------------- 渲染 ---------------- */

  const marksLocal = useMemo(
    () =>
      highlights
        .filter((h) => h.page === chapter)
        .map((h) => ({
          id: h.id,
          color: h.color,
          from: h.start?.offset ?? 0,
          to: h.end?.offset ?? 0,
        }))
        .filter((m) => m.to > m.from),
    [highlights, chapter]
  )

  const rendered = useMemo(
    () => segs.map((s) => ({ ...s, html: markedHtml(s.html, s.start, marksLocal) })),
    [segs, marksLocal]
  )

  const readerStyle = {
    '--reader-size': `${prefs.readerSize}px`,
    '--reader-leading': prefs.readerLeading,
    '--reader-para-gap': `${prefs.readerParaGap}em`,
    '--reader-pad': `${prefs.readerPad}px`,
    '--reader-col-h': `${Math.max(80, colH - 8)}px`,
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

  // 顶栏 / 底栏的百分比：优先用全书实时值（章号 + 章内插值），量不出来再退回章号
  const pct = finePct ?? chapterPercent(chapter, Math.max(1, total))

  return (
    <div
      className={`reader txt-reader epub-reader${immersive ? ' immersive' : ''}`}
      data-reader-theme={theme}
      style={readerStyle}
    >
      {/* 长按选词时压制系统「复制/全选」气泡：contextmenu 一律拦下（选区本身保留，
          交给自家的 SelectionPopover），否则原生菜单和笔记弹窗同时弹出来打架 */}
      <div
        className="txt-stage"
        onClick={onStageClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className={`txt-viewport${flow === 'scroll' ? ' scroll-flow' : ''}`}
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
          onTouchMove={(e) => {
            // 滚动模式：滚到底（到顶）之后**继续**滑 → 换节。
            // 「只在当前节内滚动」需要一个自然的出口，否则读完本节就卡住了。
            // 判据取「已经在边界上 + 手指还往边界外推」，所以正常浏览永远不会误触发。
            if (flowRef.current !== 'scroll') return
            const start = touchRef.current
            const vp = vpRef.current
            if (!start || !vp || e.touches.length > 1) return
            const max = Math.max(0, vp.scrollHeight - vp.clientHeight)
            const dy = e.touches[0].clientY - start.y
            if (vp.scrollTop >= max - 2 && dy < -80) {
              touchRef.current = null // 一次滑动只换一节，免得连跳
              nextPage()
            } else if (vp.scrollTop <= 2 && dy > 80) {
              touchRef.current = null
              prevPage()
            }
          }}
          onTouchEnd={(e) => {
            const start = touchRef.current
            touchRef.current = null
            if (!start) return
            // 刚做完双指缩放：`changedTouches[0]` 的位移可能远超 50px，别误判成翻页
            if (shouldIgnoreSwipe()) return
            // 滚动模式下上下滑就是浏览本身，横向轻滑不该被当成「滚一屏」翻页
            if (flowRef.current === 'scroll') return
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
            className={`txt-columns${flow === 'scroll' ? ' scroll-flow' : ''}`}
            ref={setCols}
            style={
              flow === 'scroll'
                ? undefined
                : { width: colW || 1, height: colH || 1, columnWidth: colW || 1, columnGap: GAP }
            }
          >
            {rendered.map((s, i) => {
              const common = {
                key: i,
                className: `txt-p${s.kind === 'h' ? ' txt-p-title' : ''}`,
                'data-seg': i,
                'data-start': s.start,
                'data-kind': s.kind,
                'data-level': s.level || undefined,
                'data-bullet': s.bullet || undefined,
                'data-img': s.img || undefined,
                dangerouslySetInnerHTML: { __html: s.html },
              }
              // <hr> 是块级，塞进 <p> 会被浏览器「抬」出去，DOM 一变偏移就全错
              return s.wrap === false ? <div {...common} /> : <p {...common} />
            })}
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
            第 {chapter + 1}/{total} 节 · {pct}%
          </div>
        </div>
        <button
          className="btn btn-sm toolbar-optional"
          onClick={() => goChapter(chapter - 1, 0, true)}
          disabled={chapter <= 0}
          title="上一节"
        >
          上一节
        </button>
        <button
          className="btn btn-sm toolbar-optional"
          onClick={() => goChapter(chapter + 1)}
          disabled={chapter >= total - 1}
          title="下一节"
        >
          下一节
        </button>
        <button
          className="btn btn-sm"
          onClick={toggleFlow}
          data-flow={flow}
          title={flow === 'scroll' ? '现在是竖向滚动，点一下改回翻页' : '现在是翻页，点一下改成竖向滚动'}
        >
          {flow === 'scroll' ? '滚动' : '翻页'}
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
            第 {chapter + 1}/{total} 节
          </span>
          {/* 桌面鼠标没有滑动手势，点屏幕又只负责工具栏 —— 翻页给两个固定按钮 */}
          <button
            className="btn btn-sm scrub-btn"
            onClick={prevPage}
            title="上一页"
            aria-label="上一页"
          >
            ‹
          </button>
          {flow === 'scroll' ? (
            <>
              {/* 滚动模式下没有「第几页」，滑杆改成「第几段」—— 拖一下就能在节内定位 */}
              <input
                type="range"
                min={1}
                max={Math.max(1, pages)}
                value={page + 1}
                onChange={(e) => scrollToSeg(Number(e.target.value) - 1)}
              />
              <span className="scrub-num">{pct}%</span>
            </>
          ) : (
            <>
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
            </>
          )}
          <button
            className="btn btn-sm scrub-btn"
            onClick={nextPage}
            title="下一页"
            aria-label="下一页"
          >
            ›
          </button>
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
          outline={epub?.outline ?? EMPTY}
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
          ensureIndex={ensureIndex}
          search={doSearch}
          pageLabel={(i) => `第${i + 1}节`}
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
