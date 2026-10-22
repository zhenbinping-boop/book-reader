/** 单次触摸只归属一种动作；不拦浏览器滚动或原生选区。 */
export function createReaderGesture({ now = () => performance.now() } = {}) {
  let gesture = null
  let ignoreClickUntil = -Infinity
  const cancel = () => {
    if (gesture) gesture.cancelled = true
    ignoreClickUntil = now() + 350
  }
  const point = (touches, id) => Array.from(touches || []).find((t) => t.identifier === id)
  const move = (touches, { blocked = false } = {}) => {
    if (!gesture) return
    const touch = point(touches, gesture.id)
    if (blocked || touches.length !== 1 || !touch) return cancel()
    const dx = touch.clientX - gesture.x
    const dy = touch.clientY - gesture.y
    if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
      // 长按后再拖动属于选词，不能在松手时回退成一次横滑。
      if (now() - gesture.time >= 350) return cancel()
      if (Math.abs(dx) > Math.abs(dy) * 1.5) gesture.axis = 'x'
      else if (Math.abs(dy) > Math.abs(dx) * 1.5) gesture.axis = 'y'
    }
  }
  return {
    start(touches, { blocked = false, mode = 'page', width = 0 } = {}) {
      const t = touches[0]
      gesture = t ? { id: t.identifier, x: t.clientX, y: t.clientY, time: now(),
        axis: null, cancelled: blocked || touches.length !== 1 || mode !== 'page',
        distance: Math.max(50, width * 0.12) } : null
    },
    move,
    cancel,
    end(touches, changedTouches, { blocked = false, mode = 'page' } = {}) {
      const g = gesture
      gesture = null
      if (!g) return 0
      const t = point(changedTouches, g.id)
      const elapsed = now() - g.time
      if (g.cancelled || blocked || mode !== 'page' || touches.length || !t || elapsed >= 600) {
        ignoreClickUntil = now() + 350
        return 0
      }
      const dx = t.clientX - g.x
      const dy = t.clientY - g.y
      if (g.axis === 'y' || (!g.axis && elapsed >= 350)) return 0
      if (Math.abs(dx) < g.distance || Math.abs(dx) <= Math.abs(dy) * 1.5) return 0
      ignoreClickUntil = now() + 350
      return dx < 0 ? 1 : -1
    },
    shouldIgnoreClick: () => now() < ignoreClickUntil,
  }
}
