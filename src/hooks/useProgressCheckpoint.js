import { useEffect, useMemo, useRef } from 'react'
import { saveProgress } from '../db'
import { createProgressCheckpoint } from '../lib/progressCheckpoint'

export default function useProgressCheckpoint(bookId, read, onError) {
  const latest = useRef({ read, onError })
  latest.current = { read, onError }
  const checkpoint = useMemo(() => createProgressCheckpoint({
    read: () => latest.current.read(),
    write: (patch) => saveProgress(bookId, patch),
    onError: (error) => latest.current.onError(error),
  }), [bookId])
  useEffect(() => {
    const flush = () => { checkpoint.flush(true) }
    const hidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('reader:pause', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('reader:pause', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', hidden)
      flush()
    }
  }, [checkpoint])
  return checkpoint
}
