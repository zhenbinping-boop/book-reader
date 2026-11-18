import { db } from '../db'
import { DEFAULT_FOCUS_SETTINGS, elapsedFocus, focusSettings, startFocus, pauseFocus, resumeFocus, finishFocus } from './focusTimer'

export const emptyFocusState = () => ({ key: 'current', settings: { ...DEFAULT_FOCUS_SETTINGS }, session: null, lastResult: null })

// All read-modify-write transitions and history inserts share one transaction.
// Concurrent ticks / tabs cannot finish or count the same session twice.
export async function changeFocus(action, now = Date.now()) {
  return db.transaction('rw', [db.focusState, db.focusSessions], async () => {
    const state = await db.focusState.get('current') || emptyFocusState()
    let session = state.session
    let completed = null
    if (session?.status === 'running' && elapsedFocus(session, now) >= session.durationMs) {
      completed = finishFocus(session, now, 'completed')
      if (completed.phase === 'focus') await db.focusSessions.put(completed)
      state.lastResult = completed
      state.session = session = null
    }
    // An expired session is settled first. A stale pause/end click must never
    // apply to a different session created by another view.
    if (action.sessionId && action.sessionId !== session?.id) {
      if (completed) await db.focusState.put(state)
      return { completed }
    }
    if (action.type === 'start') {
      if (session) throw new Error('当前还有一场打坐，请先收功')
      state.settings = focusSettings(action.settings || state.settings)
      const id = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('-')
      state.session = startFocus(state.settings, { id, now, phase: action.phase, book: action.book })
      state.lastResult = null
    } else if (action.type === 'pause' && session) {
      state.session = pauseFocus(session, now)
    } else if (action.type === 'resume' && session) {
      state.session = resumeFocus(session, now)
    } else if (action.type === 'end' && session) {
      const record = finishFocus(session, now)
      if (record.phase === 'focus') await db.focusSessions.put(record)
      state.lastResult = record
      state.session = null
    } else if (action.type === 'settings') {
      state.settings = focusSettings({ ...state.settings, ...action.patch })
    } else if (action.type === 'dismiss' && !session) {
      state.lastResult = null
    }
    if (completed || action.type !== 'tick') await db.focusState.put(state)
    return { completed }
  })
}
