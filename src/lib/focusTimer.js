// Wall-clock segments, rather than interval counts, survive suspended WebViews.
export const DEFAULT_FOCUS_SETTINGS = Object.freeze({ minutes: 25, restMinutes: 5, mode: 'free', intent: '', chime: false })
export const MAX_FOCUS_MINUTES = 180

export function focusSettings(input = {}) {
  const minutes = Number(input.minutes ?? 25)
  const restMinutes = Number(input.restMinutes ?? 5)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_FOCUS_MINUTES) throw new Error('专注时长请填写 1–180 分钟的整数')
  if (!Number.isInteger(restMinutes) || restMinutes < 1 || restMinutes > 60) throw new Error('休息时长请填写 1–60 分钟的整数')
  return { minutes, restMinutes, mode: input.mode === 'reading' ? 'reading' : 'free', intent: String(input.intent || '').trim().slice(0, 60), chime: input.chime === true }
}

export function elapsedFocus(session, now = Date.now()) {
  if (!session) return 0
  return Math.min(session.durationMs, Math.max(0, session.elapsedMs + (session.status === 'running' ? Math.max(0, now - session.anchorAt) : 0)))
}

export function remainingFocus(session, now = Date.now()) {
  return session ? Math.max(0, session.durationMs - elapsedFocus(session, now)) : 0
}

export function focusDeadline(session) {
  return session?.status === 'running' ? session.anchorAt + session.durationMs - session.elapsedMs : null
}

export function startFocus(settings, { id, now, phase = 'focus', book = null }) {
  const prefs = focusSettings(settings)
  if (phase === 'focus' && prefs.mode === 'reading' && !book) throw new Error('请先选择一本可阅读的书')
  return { id, phase, status: 'running', durationMs: (phase === 'rest' ? prefs.restMinutes : prefs.minutes) * 60_000,
    elapsedMs: 0, anchorAt: now, startedAt: now, mode: phase === 'rest' ? 'free' : prefs.mode,
    intent: phase === 'rest' ? '歇一会儿' : prefs.intent, bookId: phase === 'focus' && prefs.mode === 'reading' ? book.id : null,
    bookTitle: phase === 'focus' && prefs.mode === 'reading' ? book.title : '', bookHash: phase === 'focus' && prefs.mode === 'reading' ? book.fileHash || null : null }
}

export function pauseFocus(session, now) {
  return session?.status === 'running' ? { ...session, elapsedMs: elapsedFocus(session, now), anchorAt: null, status: 'paused' } : session
}

export function resumeFocus(session, now) {
  return session?.status === 'paused' ? { ...session, anchorAt: now, status: 'running' } : session
}

export function finishFocus(session, now, outcome = 'ended') {
  const elapsedMs = elapsedFocus(session, now)
  const complete = outcome === 'completed' || elapsedMs >= session.durationMs
  return { id: session.id, phase: session.phase, mode: session.mode, intent: session.intent, bookTitle: session.bookTitle,
    bookHash: session.bookHash, startedAt: session.startedAt,
    endedAt: complete ? (focusDeadline(session) ?? now) : now, durationMs: session.durationMs,
    elapsedMs: complete ? session.durationMs : elapsedMs, outcome: complete ? 'completed' : 'ended' }
}

export function isFocusRecord(row) {
  return !!row && typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 100 && row.phase === 'focus' &&
    ['free', 'reading'].includes(row.mode) && ['completed', 'ended'].includes(row.outcome) &&
    Number.isFinite(row.startedAt) && row.startedAt > 0 && Number.isFinite(row.endedAt) && row.endedAt >= row.startedAt &&
    Number.isInteger(row.durationMs) && row.durationMs >= 60_000 && row.durationMs <= MAX_FOCUS_MINUTES * 60_000 &&
    Number.isFinite(row.elapsedMs) && row.elapsedMs >= 0 && row.elapsedMs <= row.durationMs &&
    (row.outcome !== 'completed' || row.elapsedMs === row.durationMs) &&
    typeof row.intent === 'string' && row.intent.length <= 60 && typeof row.bookTitle === 'string'
}

export function cleanFocusRecord(row) {
  if (!isFocusRecord(row)) throw new Error('备份的打坐记录无效')
  const { id, phase, mode, outcome, startedAt, endedAt, durationMs, elapsedMs, intent, bookTitle } = row
  return { id, phase, mode, outcome, startedAt, endedAt, durationMs, elapsedMs, intent, bookTitle: bookTitle.slice(0, 500), bookHash: typeof row.bookHash === 'string' ? row.bookHash.slice(0, 200) : null }
}

export function formatFocusClock(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function formatFocusDuration(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  if (seconds < 60) return `${seconds} 秒`
  return `${Math.floor(seconds / 60)} 分${seconds % 60 ? ` ${seconds % 60} 秒` : '钟'}`
}

export function todayFocus(records, now = Date.now()) {
  const day = new Date(now); day.setHours(0, 0, 0, 0)
  // Sessions belong to their finishing day; rest and active sessions are excluded.
  const rows = records.filter(row => row.endedAt >= day.getTime() && row.endedAt <= now && row.phase === 'focus')
  return { count: rows.length, completed: rows.filter(row => row.outcome === 'completed').length, elapsedMs: rows.reduce((sum, row) => sum + row.elapsedMs, 0) }
}
