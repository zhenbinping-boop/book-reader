import { useEffect, useState } from 'react'

export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')

  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const m = hash.match(/^#\/read\/(\d+)/)
  if (m) return { name: 'read', id: Number(m[1]) }
  return { name: 'shelf' }
}

export function goShelf() {
  window.location.hash = '#/'
}

export function goRead(id) {
  window.location.hash = `#/read/${id}`
}
