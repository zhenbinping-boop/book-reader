import { useEffect, useRef, useState } from 'react'
import { pdfjsLib } from '../pdf/pdfWorker'
import { obtainPage } from '../pdf/pdfService'
import { buildItemMap, hitToRange, normalizeQuery } from '../lib/pdfText'
import { itemSpans, rangeRects } from '../lib/selection'

const MAX_HIT_MARKS = 40

/**
 * 一页 PDF：canvas（图像）+ textLayer（可选文本）+ marks-layer（高亮与搜索命中）。
 *
 * 三层顺序不能改：canvas 在最下，文本层负责选择，标注层在最上只负责点击。
 * 标注层整体 pointer-events:none，只有矩形本身可点，否则会挡住划词。
 */
export default function PdfPage({ pdf, index, scale, pageCache, marks, query, onLayer, onMarkClick }) {
  const canvasRef = useRef(null)
  const layerRef = useRef(null)
  const shownIndex = useRef(index)
  const [drawn, setDrawn] = useState(false)
  const [rects, setRects] = useState([])
  // 文本层每次重建后自增，用来触发标注层重算（ref 变化不会触发渲染）
  const [epoch, setEpoch] = useState(0)

  // ---- 图像层 ----
  useEffect(() => {
    let cancelled = false
    let task = null
    // 单页模式换页时复用同一个 canvas，不先清掉就会看到上一页被拉伸的样子
    if (shownIndex.current !== index) {
      shownIndex.current = index
      setDrawn(false)
    }
    ;(async () => {
      const page = await obtainPage(pdf, pageCache, index)
      if (cancelled || !canvasRef.current) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: scale * dpr })
      const canvas = canvasRef.current
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))

      task = page.render({ canvas, viewport })
      await task.promise
      if (!cancelled) setDrawn(true)
    })().catch(() => {
      /* 单页渲染失败不应中断整本书 */
    })

    return () => {
      cancelled = true
      if (task) {
        try {
          task.cancel()
        } catch {
          /* 已经渲染完了 */
        }
      }
    }
  }, [pdf, index, scale, pageCache])

  // ---- 文本层 ----
  useEffect(() => {
    const container = layerRef.current
    if (!container) return
    let cancelled = false
    let layer = null

    ;(async () => {
      const page = await obtainPage(pdf, pageCache, index)
      if (cancelled || !layerRef.current) return
      const viewport = page.getViewport({ scale })

      // pdf.js v6 用 --total-scale-factor 计算字号与容器尺寸（旧版叫 --scale-factor）。
      // 必须在构造 TextLayer 之前设好：构造函数里就会调 setLayerDimensions。
      container.style.setProperty('--total-scale-factor', String(scale))
      container.style.setProperty('--scale-round-x', '1px')
      container.style.setProperty('--scale-round-y', '1px')
      container.replaceChildren()

      const textContent = await page.getTextContent()
      if (cancelled || !layerRef.current) return

      layer = new pdfjsLib.TextLayer({ textContentSource: textContent, container, viewport })
      await layer.render()
      if (cancelled) return

      // setLayerDimensions 会把 width/height 写成 CSS round() 表达式，依赖上面那几个变量；
      // 直接覆写成 100% 最省事，也避免 round() 在旧浏览器上不生效。
      container.style.width = '100%'
      container.style.height = '100%'
      container.dataset.page = String(index)

      // textDivs 与 textContentItemsStr 一一对应，用它建立 DOM ↔ 文本项的映射
      const divs = layer.textDivs
      for (let i = 0; i < divs.length; i++) {
        divs[i].dataset.idx = String(i)
      }
      setEpoch((n) => n + 1)
    })().catch(() => {
      /* 没有文本层（扫描件）或渲染被取消，静默跳过 */
    })

    return () => {
      cancelled = true
      try {
        layer?.cancel()
      } catch {
        /* 已经结束 */
      }
      if (layerRef.current) layerRef.current.replaceChildren()
    }
  }, [pdf, index, scale, pageCache])

  // ---- 把容器交给上层，划词时上层要靠它做位置换算 ----
  useEffect(() => {
    const el = layerRef.current
    if (!el) return
    onLayer?.(index, el)
    return () => onLayer?.(index, null)
  }, [index, onLayer])

  // ---- 标注层：高亮矩形 + 当前搜索词的命中框 ----
  useEffect(() => {
    const container = layerRef.current
    if (!container) return

    const raf = requestAnimationFrame(() => {
      const out = []

      for (const m of marks || []) {
        for (const r of rangeRects(container, m.start, m.end)) {
          out.push({ ...r, mark: m, kind: 'hl' })
        }
      }

      const needle = normalizeQuery(query)
      if (needle) {
        const spans = itemSpans(container)
        if (spans.length) {
          const map = buildItemMap(
            spans.map((el) => ({ item: Number(el.dataset.idx), text: el.textContent }))
          )
          let at = map.text.indexOf(needle)
          let n = 0
          while (at >= 0 && n < MAX_HIT_MARKS) {
            const rg = hitToRange(map, at, at + needle.length)
            if (rg) {
              for (const r of rangeRects(container, rg.start, rg.end)) {
                out.push({ ...r, kind: 'hit' })
              }
            }
            n++
            at = map.text.indexOf(needle, at + needle.length)
          }
        }
      }

      setRects(out)
    })

    return () => cancelAnimationFrame(raf)
  }, [marks, query, epoch, scale])

  return (
    <>
      {!drawn && <div className="page-placeholder">{index + 1}</div>}
      <canvas ref={canvasRef} style={{ opacity: drawn ? 1 : 0 }} />
      <div className="textLayer" ref={layerRef} lang="zh" />
      {rects.length > 0 && (
        <div className="marks-layer">
          {rects.map((r, i) => (
            <span
              key={i}
              className="mark-rect"
              data-color={r.kind === 'hl' ? r.mark.color : undefined}
              data-kind={r.kind}
              style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
              onClick={(e) => {
                if (r.kind !== 'hl') return
                e.stopPropagation()
                onMarkClick?.(r.mark, e)
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}
