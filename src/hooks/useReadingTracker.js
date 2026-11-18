import { useEffect, useRef } from 'react'
import { getBook } from '../db'
import { createReadingClock, READING_RULES } from '../lib/readingExperience'
import { checkpointReading } from '../lib/readingStore'
import { isNative } from '../lib/native'

export default function useReadingTracker(bookId, enabled) {
  const latest = useRef(enabled), control = useRef(null)
  latest.current = enabled
  useEffect(() => { control.current?.changed() }, [enabled])
  useEffect(() => {
    let alive = true, clock, owned = false, expiresAt = 0, nativeActive = true, focused = document.hasFocus(), lastSave = 0
    let chain = Promise.resolve(), nativeListener, lastStatus = '', lastPublished = 0
    const owner = crypto.randomUUID?.() || `read-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const foreground = () => alive && latest.current && !document.hidden && focused && nativeActive
    const publish = (error = '') => {
      if (!alive || !clock) return
      const state = error ? 'error' : !foreground() ? 'paused' : clock.idle ? 'idle' : !owned ? 'elsewhere' : 'reading'
      const now = performance.now()
      if (!error && state === lastStatus && now - lastPublished < 5000) return
      lastStatus = state; lastPublished = now
      window.dispatchEvent(new CustomEvent('reader:experience-status', { detail: { state, effectiveMs: clock.record.effectiveMs } }))
    }
    const sample = () => {
      if (clock) clock.sample(performance.now(), Date.now(), foreground() && owned && Date.now() <= expiresAt)
    }
    const save = (release = false) => {
      chain = chain.catch(() => {}).then(async () => {
        if (!clock) return
        sample()
        const result = await checkpointReading(owner, clock.record, { release: release || !alive || !foreground() || clock.idle })
        // Sampling continues while IndexedDB writes. Keep that tail only while
        // the same lease is valid; a new/rejected lease starts at saved time.
        if (!result.accepted || !result.owned) clock.replace(result.record)
        owned = result.owned; expiresAt = result.expiresAt; lastSave = performance.now()
        sample(); publish()
      }).catch(() => { owned = false; expiresAt = 0; publish('storage') })
      return chain
    }
    const changed = () => { if (!clock) return; sample(); if (foreground()) clock.activity(performance.now(), Date.now()); save(!foreground()); publish() }
    const activity = event => {
      if (!event.isTrusted || !foreground() || !clock) return
      if (event.type === 'keydown' && (event.repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key))) return
      const wasIdle = clock.idle
      clock.activity(performance.now(), Date.now())
      if (!owned || wasIdle) save()
      publish()
    }
    const visibility = () => { focused = document.hasFocus(); changed() }
    const blur = () => { focused = false; changed() }
    const focus = () => { focused = true; changed() }
    const pause = () => { nativeActive = false; changed() }
    const show = () => { nativeActive = true; visibility() }
    const poll = () => { sample(); if (clock && performance.now() - lastSave >= READING_RULES.checkpointMs) save(!foreground() || clock.idle); publish() }
    control.current = { changed }
    getBook(bookId).then(book => {
      if (!alive || !book || book.missingFile) return
      const now = Date.now()
      clock = createReadingClock({ version: 1, id: owner, startedAt: now, updatedAt: now, effectiveMs: 0,
        bookTitle: book.title.slice(0, 500), bookHash: book.fileHash?.slice(0, 200) || null, days: {} }, performance.now(), now)
      changed()
    }).catch(() => publish('storage'))
    const timer = setInterval(poll, 1000)
    for (const name of ['pointerdown', 'keydown', 'scroll']) document.addEventListener(name, activity, { capture: true, passive: true })
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('blur', blur); window.addEventListener('focus', focus)
    window.addEventListener('reader:pause', pause); window.addEventListener('pagehide', pause); window.addEventListener('pageshow', show)
    if (isNative()) import('@capacitor/app').then(async ({ App }) => {
      const listener = await App.addListener('appStateChange', ({ isActive }) => { nativeActive = isActive; changed() })
      if (!alive) listener.remove(); else nativeListener = listener
    }).catch(() => {})
    return () => {
      sample(); alive = false; sample(); save(true); control.current = null; clearInterval(timer)
      for (const name of ['pointerdown', 'keydown', 'scroll']) document.removeEventListener(name, activity, true)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('blur', blur); window.removeEventListener('focus', focus)
      window.removeEventListener('reader:pause', pause); window.removeEventListener('pagehide', pause); window.removeEventListener('pageshow', show)
      nativeListener?.remove()
    }
  }, [bookId])
}
