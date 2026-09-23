import { useEffect, useRef } from 'react'

/**
 * 阅读器内的双指缩放。
 *
 * 为什么不直接用浏览器自带的双指缩放（`maximum-scale`）：那是**整页缩放** ——
 * 地址栏、阅读器自己的工具栏会跟着一起放大，屏幕上能看到的正文反而更少；
 * 而且放大后的坐标系和阅读器的分栏 / 分页模型对不上，翻页就错位了。
 * 阅读器要的是「只放大正文」，只能自己接管。
 *
 * 三条关键取舍：
 *
 * 1. **只拦两根手指，一根手指完全不碰。**
 *    长按划词必须保留，而 `touch-action: none` 会把选择一起杀掉 —— 所以
 *    监听必须是 non-passive 的，并且只在 `touches.length >= 2` 时 `preventDefault()`。
 *
 * 2. **手势进行中不重排。**
 *    PDF 重渲染一页、TXT 重新分栏都是几十毫秒级的开销，跟着手指每帧做会卡成幻灯片。
 *    手势中只做 transform 的视觉反馈（`onLive`），松手才提交真实值（`commit`）。
 *
 * 3. **提交后由调用方负责定位。**
 *    缩放会让内容整体换尺寸，落点得按阅读器自己的位置模型重算：
 *    PDF 按页码，TXT 按字符锚点。hook 不掺和这件事。
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** 两根手指之间的距离 */
const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

/**
 * 手势中的视觉反馈：给内容层挂一个临时缩放。
 *
 * `transform-origin` 必须按**当前视口**算，不能用默认的 `center` ——
 * 横向滚动的内容层宽度可能是视口的几十倍，「元素中心」远在屏幕之外，
 * 绕着那个点缩放看起来就像整块内容飞走了。所以用手动算的像素原点。
 */
export function applyPinchFx(el, scroller, ratio) {
  if (!el) return
  if (ratio == null) {
    el.style.transform = ''
    el.style.transformOrigin = ''
    el.style.willChange = ''
    return
  }
  const ox = (scroller?.scrollLeft || 0) + (scroller?.clientWidth || 0) / 2
  const oy = (scroller?.scrollTop || 0) + (scroller?.clientHeight || 0) / 2
  el.style.transformOrigin = `${ox}px ${oy}px`
  el.style.transform = `scale(${ratio})`
  el.style.willChange = 'transform'
}

/**
 * @param {object} o
 * @param {React.RefObject} o.targetRef   手势区域（通常是滚动容器）
 * @param {React.RefObject} o.feedbackRef 手势中做 transform 的内容层
 * @param {boolean} o.enabled
 * @param {() => number} o.getValue       当前值，例如缩放倍率 / 字号
 * @param {(v:number)=>number} o.commit   提交。返回值是实际生效的值，供反馈复位用
 * @param {number} [o.min] @param {number} [o.max]
 * @returns {{ shouldIgnoreSwipe: () => boolean }}
 */
export default function usePinch({
  targetRef,
  feedbackRef,
  enabled = true,
  getValue,
  commit,
  min = 0,
  max = Infinity,
}) {
  // { d0, v0 }：手势开始时的指距与基准值
  const gestureRef = useRef(null)
  // 手势结束时刻。阅读器判「滑动翻页」时必须跳过这一次 ——
  // 双指缩小后 `changedTouches[0]` 的位移完全可能超过 50px，会被误判成翻页
  const endAtRef = useRef(0)
  // 触控板捏合（ctrl + wheel）的累积状态
  const wheelRef = useRef(null)

  // 最新的 props 走 ref，监听只挂一次
  const cfgRef = useRef({})
  cfgRef.current = { enabled, getValue, commit, min, max }

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    const ends = () => {
      if (!gestureRef.current) return
      gestureRef.current = null
      endAtRef.current = performance.now()
      applyPinchFx(feedbackRef.current, el, null)
    }

    const onStart = (e) => {
      const { enabled: en, getValue: gv } = cfgRef.current
      if (!en) return
      if (e.touches.length < 2) {
        // 从两指松到一指又重新按下：先把上一段手势收尾
        ends()
        return
      }
      gestureRef.current = { d0: dist(e.touches[0], e.touches[1]), v0: gv() }
    }

    const onMove = (e) => {
      const cfg = cfgRef.current
      if (!cfg.enabled) return
      const g = gestureRef.current
      if (!g) {
        if (e.touches.length >= 2) onStart(e)
        return
      }
      if (e.touches.length < 2) return
      // 到这一步才拦：一根手指的滑动要留给浏览器做划词与滚动
      e.preventDefault()
      const d = dist(e.touches[0], e.touches[1])
      if (!g.d0) return
      const ratio = d / g.d0
      applyPinchFx(feedbackRef.current, el, ratio)
    }

    const onEnd = (e) => {
      const g = gestureRef.current
      if (!g) return
      const cfg = cfgRef.current
      if (e.touches.length >= 2) return // 还有两指，只是其中一指换了位置
      // 用最后一次 move 的指距结算。touchend 里拿不到「抬起的那根手指」的
      // 历史位置，所以改成记录在 gesture 上
      gestureRef.current = null
      endAtRef.current = performance.now()
      applyPinchFx(feedbackRef.current, el, null)
      if (g.lastRatio && g.lastRatio !== 1) cfg.commit(clamp(g.v0 * g.lastRatio, cfg.min, cfg.max))
    }

    // 在 move 里顺手记下比例，供 end 结算
    const track = (e) => {
      const g = gestureRef.current
      if (g && e.touches.length >= 2 && g.d0) {
        g.lastRatio = dist(e.touches[0], e.touches[1]) / g.d0
      }
    }

    const onWheel = (e) => {
      const cfg = cfgRef.current
      if (!cfg.enabled || !e.ctrlKey) return
      // ctrl+wheel 是浏览器给「捏合」的标准信号，不拦的话它会缩整页
      e.preventDefault()
      let st = wheelRef.current
      if (!st) st = wheelRef.current = { v0: cfg.getValue(), k: 1, t: 0 }
      st.k *= Math.exp(-e.deltaY / 300)
      clearTimeout(st.t)
      st.t = setTimeout(() => {
        wheelRef.current = null
      }, 320)
      cfg.commit(clamp(st.v0 * st.k, cfg.min, cfg.max))
    }

    const onTouchMove = (e) => {
      track(e)
      onMove(e)
    }

    const opts = { passive: false }
    el.addEventListener('touchstart', onStart, opts)
    el.addEventListener('touchmove', onTouchMove, opts)
    el.addEventListener('touchend', onEnd, opts)
    el.addEventListener('touchcancel', onEnd, opts)
    el.addEventListener('wheel', onWheel, opts)

    return () => {
      el.removeEventListener('touchstart', onStart, opts)
      el.removeEventListener('touchmove', onTouchMove, opts)
      el.removeEventListener('touchend', onEnd, opts)
      el.removeEventListener('touchcancel', onEnd, opts)
      el.removeEventListener('wheel', onWheel, opts)
      applyPinchFx(feedbackRef.current, el, null)
    }
    // targetRef 指向的元素在 phase 变化后才会挂上，所以用 enabled 一起触发重挂
  }, [targetRef, feedbackRef, enabled])

  return {
    /** 阅读器判滑动翻页前先问一句：刚才是双指手势吗？ */
    shouldIgnoreSwipe: () => performance.now() - endAtRef.current < 400,
  }
}
