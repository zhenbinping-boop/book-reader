import { useEffect, useRef } from 'react'

export default function useDialogFocus(onClose) {
  const ref = useRef(null)
  const latest = useRef(onClose)
  latest.current = onClose
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const previous = document.activeElement
    const focusables = () => [...el.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')]
      .filter(n => n.getClientRects().length)
    const frame = requestAnimationFrame(() => {
      if (!el.contains(document.activeElement)) focusables()[0]?.focus({ preventScroll: true })
    })
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); latest.current?.(); return
      }
      if (event.key !== 'Tab') return
      const list = focusables()
      if (!list.length) { event.preventDefault(); return }
      const first = list[0], last = list.at(-1)
      if (!el.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey, true)
      if (previous?.isConnected) previous.focus?.({ preventScroll: true })
    }
  }, [])
  return ref
}
