import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from '../db'
import { changeFocus, emptyFocusState } from '../lib/focusStore'
import { focusDeadline } from '../lib/focusTimer'
import { isNative } from '../lib/native'

const FocusContext = createContext(null)
export const useFocus = () => useContext(FocusContext)

export default function FocusProvider({ children }) {
  const [snapshot, setSnapshot] = useState({ state: emptyFocusState(), records: [], ready: false, historyError: '' })
  const [now, setNow] = useState(Date.now)
  const [error, setError] = useState('')
  const current = useRef(snapshot.state)
  const audio = useRef(null)
  const alive = useRef(true)
  current.current = snapshot.state

  const prepareChime = useCallback(() => {
    const Audio = window.AudioContext || window.webkitAudioContext
    if (!Audio) return
    try {
      audio.current ||= new Audio()
      audio.current.resume().catch(() => {})
    } catch { /* Sound is optional; the timer and stored record do not depend on it. */ }
  }, [])

  const chime = useCallback(() => {
    const context = audio.current
    if (!context || context.state !== 'running' || document.hidden || !current.current.settings.chime) return
    for (const [frequency, delay] of [[523.25, 0], [783.99, .25]]) {
      const tone = context.createOscillator(), gain = context.createGain()
      tone.type = 'sine'; tone.frequency.value = frequency
      gain.gain.setValueAtTime(0, context.currentTime + delay)
      gain.gain.linearRampToValueAtTime(.12, context.currentTime + delay + .015)
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + delay + 1.5)
      tone.connect(gain); gain.connect(context.destination)
      tone.start(context.currentTime + delay); tone.stop(context.currentTime + delay + 1.6)
      tone.onended = () => { tone.disconnect(); gain.disconnect() }
    }
  }, [])

  const run = useCallback(async action => {
    try {
      const result = await changeFocus(action)
      if (alive.current) { setError(''); setNow(Date.now()); if (result.completed) chime() }
      return true
    } catch (err) {
      if (alive.current) setError(err?.message || '打坐记录暂时无法保存，请重试')
      return false
    }
  }, [chime])

  useEffect(() => {
    alive.current = true
    const subscription = liveQuery(async () => ({
      state: await db.focusState.get('current') || emptyFocusState(),
      records: await db.focusSessions.orderBy('endedAt').reverse().toArray(),
      ready: true,
      historyError: '',
    })).subscribe({
      next: value => setSnapshot(value),
      error: err => setSnapshot(s => ({ ...s, ready: true, historyError: err?.message || '无法读取打坐记录' })),
    })
    const sync = () => { setNow(Date.now()); run({ type: 'tick' }) }
    sync()
    const interval = setInterval(() => {
      const time = Date.now(); setNow(time)
      const deadline = focusDeadline(current.current.session)
      if (deadline !== null && time >= deadline) run({ type: 'tick' })
    }, 1000)
    const visible = () => { if (!document.hidden) sync() }
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('pageshow', sync)
    window.addEventListener('focus', sync)
    let nativeListener
    if (isNative()) import('@capacitor/app').then(async ({ App }) => {
      const listener = await App.addListener('appStateChange', ({ isActive }) => { if (isActive) sync() })
      if (!alive.current) listener.remove(); else nativeListener = listener
    }).catch(() => {})
    return () => {
      alive.current = false; subscription.unsubscribe(); clearInterval(interval)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('pageshow', sync); window.removeEventListener('focus', sync)
      nativeListener?.remove(); audio.current?.close().catch(() => {})
    }
  }, [run])

  return <FocusContext.Provider value={{ ...snapshot, now, error: error || snapshot.historyError, run, prepareChime }}>{children}</FocusContext.Provider>
}
