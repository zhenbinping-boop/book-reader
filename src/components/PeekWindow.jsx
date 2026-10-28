import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import useDialogFocus from '../hooks/useDialogFocus'
import { intraOffsetAtTop, scrollSegToChar } from '../lib/txtSel'
import PdfPage from './PdfPage'

/** 独立的预览位置，不触碰主阅读器的滚动、进度、标注或历史。 */
export default function PeekWindow({ initial, total, label, load, onClose, onRead, pdf }) {
  const [target, setTarget] = useState(initial)
  const [content, setContent] = useState(null)
  const [error, setError] = useState('')
  const [width, setWidth] = useState(0)
  const viewRef = useRef(null)
  const dialogRef = useDialogFocus(onClose)
  const currentOffset = useRef(initial.offset || 0)
  const reduce = useReducedMotion()

  useEffect(() => {
    let alive = true
    let cleanup = null
    setContent(null); setError('')
    currentOffset.current = target.offset || 0
    Promise.resolve().then(() => load(target)).then(result => {
      if (!alive) { result?.cleanup?.(); return }
      cleanup = result?.cleanup
      currentOffset.current = result?.offset ?? target.offset ?? 0
      setContent(result)
    }).catch(e => { if (alive) setError(e?.message || '这一处暂时无法读取') })
    return () => { alive = false; cleanup?.() }
  }, [target, load])

  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure); observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (!content || pdf || !viewRef.current) return
    const view = viewRef.current
    const elements = [...view.querySelectorAll('[data-peek-start]')]
    const off = currentOffset.current
    let chosen = elements[0]
    for (const el of elements) if (Number(el.dataset.peekStart) <= off) chosen = el
    if (!chosen) return
    view.scrollTop += chosen.getBoundingClientRect().top - view.getBoundingClientRect().top
    scrollSegToChar(chosen, off - Number(chosen.dataset.peekStart), view)
  }, [content, pdf])

  const updateOffset = () => {
    if (pdf || !viewRef.current) return
    const view = viewRef.current
    const line = view.getBoundingClientRect().top + 1
    const segments = [...view.querySelectorAll('[data-peek-start]')]
    const el = segments.find(node => node.getBoundingClientRect().bottom > line) || segments[segments.length - 1]
    if (el) currentOffset.current = Number(el.dataset.peekStart) + intraOffsetAtTop(el, view)
  }
  const move = direction => setTarget({ index: target.index + direction, offset: 0 })
  const readHere = () => { updateOffset(); onRead({ ...target, offset: currentOffset.current }) }

  return <>
    <div className="peek-mask" onClick={onClose} />
    <motion.section ref={dialogRef} className="peek-window" role="dialog" aria-modal="true" aria-label="回读窗"
      initial={{ y: reduce ? 0 : 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: .2 }}>
      <div className="peek-handle" aria-hidden="true" />
      <header className="peek-header"><div><h2>回读窗 <span className="peek-stamp" aria-hidden="true">回读</span></h2><p>{label(target.index)} · 回看</p></div><button className="icon-button" onClick={onClose} aria-label="关闭回读窗"><X size={22}/></button></header>
      <div className={`peek-content${pdf ? ' is-pdf' : ''}`} ref={viewRef} onScroll={updateOffset}>
        {error ? <p className="peek-message" role="alert">{error}</p> : !content ? <p className="peek-message">正在打开…</p> : pdf ? (
          width > 0 && <div className="peek-pdf-page" style={{ width: width - 24, height: (width - 24) * pdf.sizes[target.index].height / pdf.sizes[target.index].width }}>
            <PdfPage pdf={pdf.doc} index={target.index} scale={(width - 24) / pdf.sizes[target.index].width} pageCache={pdf.cache} marks={[]} query="" />
          </div>
        ) : content.segs?.length ? content.segs.map((seg, i) => seg.html != null
          ? <div className="peek-paragraph" key={i} data-peek-start={seg.start} dangerouslySetInnerHTML={{ __html: seg.html }} />
          : <p className="peek-paragraph" key={i} data-peek-start={seg.start}>{seg.text}</p>) : <p className="peek-message">此处没有可显示的正文。</p>}
      </div>
      <div className="peek-controls"><button className="peek-arrow" disabled={target.index <= 0} onClick={() => move(-1)} aria-label="回看上一处"><ChevronLeft size={21}/></button><span>{target.index + 1} / {total}</span><button className="peek-arrow" disabled={target.index >= total - 1} onClick={() => move(1)} aria-label="回看下一处"><ChevronRight size={21}/></button></div>
      <div className="peek-actions"><button className="btn btn-primary" disabled={!content || !!error} onClick={readHere}>读这里</button><button className="btn" onClick={onClose}>关闭</button></div>
    </motion.section>
  </>
}
