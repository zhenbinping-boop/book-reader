import test from 'node:test'
import assert from 'node:assert/strict'
import { focusSettings, startFocus, elapsedFocus, remainingFocus, focusDeadline, pauseFocus, resumeFocus, finishFocus, isFocusRecord, cleanFocusRecord, formatFocusClock, todayFocus } from '../src/lib/focusTimer.js'

const t0 = new Date(2026, 10, 2, 10).getTime()
const start = (settings = {}) => startFocus(focusSettings(settings), { id: 'known-session', now: t0 })

test('suspended timer and restored JSON use elapsed wall time without interval ticks', () => {
  const session = JSON.parse(JSON.stringify(start()))
  assert.equal(remainingFocus(session, t0 + 7 * 60_000 + 3500), 17 * 60_000 + 56_500)
  assert.equal(formatFocusClock(remainingFocus(session, t0 + 423_500)), '17:57')
  assert.equal(focusDeadline(session), t0 + 25 * 60_000)
})

test('multiple pauses exclude all paused time and keep one exact final deadline', () => {
  let session = pauseFocus(start(), t0 + 5 * 60_000)
  assert.equal(elapsedFocus(session, t0 + 2 * 60 * 60_000), 5 * 60_000)
  assert.equal(focusDeadline(session), null)
  session = resumeFocus(session, t0 + 30 * 60_000)
  session = pauseFocus(session, t0 + 33 * 60_000)
  session = resumeFocus(session, t0 + 60 * 60_000)
  assert.equal(focusDeadline(session), t0 + 77 * 60_000)
  assert.equal(elapsedFocus(session, t0 + 65 * 60_000), 13 * 60_000)
})

test('late foreground wake caps recorded effort at the target and timestamps actual completion', () => {
  const record = finishFocus(start(), t0 + 6 * 60 * 60_000)
  assert.equal(record.outcome, 'completed')
  assert.equal(record.elapsedMs, 25 * 60_000)
  assert.equal(record.endedAt, t0 + 25 * 60_000)
  assert.equal(isFocusRecord(record), true)
})

test('early ending a paused session saves actual effort and retains reading identity as a snapshot', () => {
  const session = startFocus({ mode: 'reading' }, { id: 'reading-session', now: t0, book: { id: 9, title: '浮生六记', fileHash: 'sha256:book' } })
  const record = finishFocus(pauseFocus(session, t0 + 125_000), t0 + 8 * 60_000)
  assert.equal(record.elapsedMs, 125_000)
  assert.equal(record.outcome, 'ended')
  assert.equal(record.bookTitle, '浮生六记')
  assert.equal(record.bookHash, 'sha256:book')
  assert.equal(Object.hasOwn(record, 'bookId'), false)
})

test('custom durations reject empty, fractional, negative, excessive and nonnumeric inputs', () => {
  for (const minutes of ['', 0, -1, 1.5, 181, NaN, Infinity, 'oops']) assert.throws(() => focusSettings({ minutes }), /1–180/)
  assert.equal(focusSettings({ minutes: '90' }).minutes, 90)
  assert.throws(() => startFocus({ mode: 'reading' }, { id: 'x', now: t0 }), /选择/)
})

test('rest is a separate explicit timer and never counts toward focus totals', () => {
  const session = startFocus({ restMinutes: 10 }, { id: 'rest', now: t0, phase: 'rest' })
  assert.equal(session.durationMs, 600_000)
  const rest = finishFocus(session, t0 + 600_000)
  assert.equal(isFocusRecord(rest), false)
  assert.deepEqual(todayFocus([rest], t0 + 600_000), { count: 0, completed: 0, elapsedMs: 0 })
})

test('daily totals follow local completion date, including midnight crossings', () => {
  const beforeMidnight = new Date(2026, 10, 1, 23, 50).getTime()
  const session = startFocus({}, { id: 'crosses-midnight', now: beforeMidnight })
  const record = finishFocus(session, t0)
  assert.deepEqual(todayFocus([record], t0), { count: 1, completed: 1, elapsedMs: 25 * 60_000 })
  assert.equal(todayFocus([record], beforeMidnight).count, 0)
})

test('a corrupt backup record is rejected and imported records cannot inject active-timer fields', () => {
  const record = finishFocus(start(), t0 + 1000)
  for (const patch of [{ elapsedMs: -1 }, { endedAt: t0 - 1 }, { durationMs: Infinity }, { id: '' }, { outcome: 'completed' }, { mode: 'bogus' }]) {
    assert.equal(isFocusRecord({ ...record, ...patch }), false)
    assert.throws(() => cleanFocusRecord({ ...record, ...patch }), /无效/)
  }
  assert.equal(Object.hasOwn(cleanFocusRecord({ ...record, bookId: 999, anchorAt: t0 }), 'anchorAt'), false)
  assert.equal(Object.hasOwn(cleanFocusRecord({ ...record, bookId: 999 }), 'bookId'), false)
})

test('negative clock jumps never create negative effort or more than the target', () => {
  const session = start()
  assert.equal(elapsedFocus(session, t0 - 1000), 0)
  assert.equal(remainingFocus(session, t0 - 1000), 25 * 60_000)
  assert.equal(formatFocusClock(remainingFocus(session, t0 + 99 * 60_000)), '00:00')
})
