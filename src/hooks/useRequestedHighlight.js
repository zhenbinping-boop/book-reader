import { useEffect, useRef } from 'react'

// Enter a book from the cross-book notebook without replacing saved progress
// with a different book's coordinates or trying to jump before layout is ready.
export default function useRequestedHighlight(phase, highlights, onJump) {
  const id = Number(new URLSearchParams(window.location.hash.split('?')[1] || '').get('note'))
  const handled = useRef(null)
  const latest = useRef(onJump)
  latest.current = onJump
  useEffect(() => {
    if (phase !== 'ready' || !id || handled.current === id) return
    const h = highlights.find(n => n.id === id)
    if (!h) return
    const timer = setTimeout(() => { handled.current = id; latest.current(h) }, 100)
    return () => clearTimeout(timer)
  }, [id, phase, highlights])
}
