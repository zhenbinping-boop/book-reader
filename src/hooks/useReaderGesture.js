import { useEffect, useRef } from 'react'
import { createReaderGesture } from '../lib/readerGesture'

const hasSelection = () => {
  const selection = window.getSelection()
  return !!selection && !selection.isCollapsed
}

export default function useReaderGesture(options) {
  const config = useRef(options)
  config.current = options
  const machine = useRef(null)
  if (!machine.current) machine.current = createReaderGesture()
  const gesture = machine.current
  const blocked = () => config.current.blocked() || hasSelection() || config.current.shouldIgnoreSwipe()
  useEffect(() => {
    const onSelection = () => { if (hasSelection()) gesture.cancel() }
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
  }, [gesture])
  return {
    shouldIgnoreClick: gesture.shouldIgnoreClick,
    cancel: gesture.cancel,
    handlers: {
      onTouchStart(e) {
        const interactive = e.target.closest?.('button, input, textarea, a, [data-frag], .popover')
        gesture.start(e.touches, { mode: config.current.mode, blocked: !!interactive || blocked(), width: e.currentTarget.clientWidth })
      },
      onTouchMove(e) { gesture.move(e.touches, { blocked: blocked() }) },
      onTouchCancel() { gesture.cancel() },
      onTouchEnd(e) {
        const direction = gesture.end(e.touches, e.changedTouches, { mode: config.current.mode, blocked: blocked() })
        if (direction > 0) config.current.next()
        if (direction < 0) config.current.previous()
      },
    },
  }
}
