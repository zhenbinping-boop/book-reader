import { useEffect, useRef } from 'react'

/** 在章末再次向上滑动进入下一章；普通触底、选择文字和双指手势不换章。 */
export default function useScrollChapter(viewRef, { enabled, chapter, canNext, blocked, onNext }) {
  const latest = useRef({ enabled, chapter, canNext, blocked, onNext })
  latest.current = { enabled, chapter, canNext, blocked, onNext }
  useEffect(() => {
    const view = viewRef.current
    if (!view || !enabled) return
    let gesture = null
    let lastTurn = 0
    const atBottom = () => view.scrollTop >= Math.max(0, view.scrollHeight - view.clientHeight) - 4
    const selected = () => { const s = window.getSelection(); return !!s && !s.isCollapsed }
    const start = e => {
      const c = latest.current
      if (e.touches.length !== 1 || !c.canNext || c.blocked() || selected() || !atBottom() || Date.now() - lastTurn < 700 || e.target.closest?.('button,a,input,textarea,select')) { gesture = null; return }
      const t = e.touches[0]
      gesture = { id: t.identifier, x: t.clientX, y: t.clientY, time: Date.now(), chapter: c.chapter, invalid: false }
    }
    const move = e => {
      if (!gesture) return
      if (e.touches.length !== 1 || latest.current.blocked() || selected()) { gesture.invalid = true; return }
      const t = Array.from(e.touches).find(touch => touch.identifier === gesture.id)
      if (!t || Math.abs(t.clientX - gesture.x) > Math.max(30, Math.abs(t.clientY - gesture.y))) gesture.invalid = true
    }
    const end = e => {
      const g = gesture; gesture = null
      if (!g || g.invalid || e.touches.length || Date.now() - g.time > 1200 || latest.current.chapter !== g.chapter || !latest.current.canNext || latest.current.blocked() || selected() || !atBottom()) return
      const t = Array.from(e.changedTouches).find(touch => touch.identifier === g.id)
      if (!t || g.y - t.clientY < 60 || Math.abs(t.clientX - g.x) > Math.abs(t.clientY - g.y) * .65) return
      lastTurn = Date.now()
      latest.current.onNext()
    }
    const cancel = () => { gesture = null }
    view.addEventListener('touchstart', start, { passive: true })
    view.addEventListener('touchmove', move, { passive: true })
    view.addEventListener('touchend', end, { passive: true })
    view.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      view.removeEventListener('touchstart', start); view.removeEventListener('touchmove', move)
      view.removeEventListener('touchend', end); view.removeEventListener('touchcancel', cancel)
    }
  }, [viewRef, enabled])
}
