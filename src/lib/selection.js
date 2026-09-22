import { useEffect, useRef, useState } from 'react'

/** 文本层容器里所有「文本项」span，按 DOM 顺序（不含 pdf.js 的 markedContent 包装） */
export function itemSpans(container) {
  return Array.from(container.querySelectorAll('span[data-idx]'))
}

/** 端点 → 相对容器起点的字符偏移。落在 <br>、元素边界上也能得到一个数 */
export function charOffsetIn(container, node, offset) {
  const r = document.createRange()
  r.selectNodeContents(container)
  try {
    r.setEnd(node, offset)
  } catch {
    return null
  }
  return r.toString().length
}

/** 容器字符偏移 → { item, offset } */
export function charToItem(spans, charOffset) {
  let acc = 0
  for (const el of spans) {
    const len = el.textContent.length
    if (charOffset <= acc + len) {
      return { item: Number(el.dataset.idx), offset: charOffset - acc }
    }
    acc += len
  }
  const last = spans[spans.length - 1]
  return last ? { item: Number(last.dataset.idx), offset: last.textContent.length } : null
}

/** 位置点 → 可交给 Range 的 DOM 点 */
export function pointToDom(container, point) {
  const span = container.querySelector(`span[data-idx="${point.item}"]`)
  if (!span) return null
  const tn = span.firstChild
  if (tn && tn.nodeType === Node.TEXT_NODE) {
    return { node: tn, offset: Math.max(0, Math.min(point.offset, tn.data.length)) }
  }
  const parent = span.parentNode
  if (!parent) return null
  return { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, span) }
}

/** 位置区间 → 相对容器的矩形列表（容器坐标系，已扣除容器原点） */
export function rangeRects(container, start, end) {
  const a = pointToDom(container, start)
  const b = pointToDom(container, end)
  if (!a || !b) return []
  const r = document.createRange()
  try {
    r.setStart(a.node, a.offset)
    r.setEnd(b.node, b.offset)
  } catch {
    return []
  }
  const base = container.getBoundingClientRect()
  const out = []
  for (const rc of r.getClientRects()) {
    if (rc.width < 0.5 || rc.height < 0.5) continue
    out.push({
      x: rc.left - base.left,
      y: rc.top - base.top,
      w: rc.width,
      h: rc.height,
    })
  }
  return out
}

/**
 * 读取当前浏览器选区，换算成文本位置。
 *
 * 只处理落在同一个文本层容器内的选区。跨页拖选会被裁剪到起始页
 * —— 高亮以「页内区间」为单位存储，跨页区间会让位置模型复杂很多，
 * 而 PDF 阅读时跨页划词本身也很少见。
 *
 * @returns {{ page:number, start:{item,offset}, end:{item,offset}, rect:DOMRect } | null}
 */
export function readSelection(container) {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null

  const range = sel.getRangeAt(0)
  if (!container.contains(range.startContainer)) return null

  const spans = itemSpans(container)
  if (!spans.length) return null

  const a = charOffsetIn(container, range.startContainer, range.startOffset)
  if (a == null) return null

  const inPage = container.contains(range.endContainer)
  const b = inPage ? charOffsetIn(container, range.endContainer, range.endOffset) : Infinity
  if (b == null) return null

  const total = spans.reduce((n, el) => n + el.textContent.length, 0)
  const endChar = Math.min(b, total)
  if (endChar <= a) return null

  const start = charToItem(spans, a)
  const end = charToItem(spans, endChar)
  if (!start || !end || (start.item === end.item && start.offset === end.offset)) return null

  const text = range.toString().replace(/\s+/g, ' ').trim()
  if (!text) return null

  // 弹出层贴着拖选结束的位置，比整体 bounding box 更符合直觉
  const rects = range.getClientRects()
  const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect()

  return { page: Number(container.dataset.page), start, end, text, rect }
}
