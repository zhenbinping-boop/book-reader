import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanStudyDecor, rankAchievementDays, studyFocusHistory, studyMonths } from '../src/lib/studyProgress.js'

test('rank dates sort reading days and apply the same daily cap as XP', () => {
  const hour = 3_600_000
  assert.deepEqual(rankAchievementDays({
    '2026-11-04': hour, '2026-11-01': 8 * hour, '2026-11-03': 3 * hour, '2026-11-02': 3 * hour,
  }), { xiucai: '2026-11-04' })
})

test('monthly study review sums reading days and unique finished focus time independently', () => {
  const end = new Date(2026, 10, 1, 0, 5).getTime()
  const focus = { id: 'valid', phase: 'focus', mode: 'free', outcome: 'ended', startedAt: end - 600_000,
    endedAt: end, durationMs: 600_000, elapsedMs: 450_000, intent: '练习', bookTitle: '' }
  const rows = studyFocusHistory([focus, focus, { ...focus, id: 'rest', phase: 'rest' }, { ...focus, id: 'zero', elapsedMs: 0 }])
  assert.equal(rows.length, 1)
  const months = studyMonths({ '2026-10-31': 300_000, '2026-11-01': 420_000 }, rows, end)
  assert.deepEqual(months.map(m => [m.month, m.readingMs, m.focusMs]), [
    ['2026-11', 420_000, 450_000],
    ['2026-10', 300_000, 0],
  ])
})

test('study appearance ignores unknown seals and invalid values and bounds scroll text', () => {
  assert.deepEqual(cleanStudyDecor({ seal: 'invalid', moon: 'true', scroll: true, caption: '  一二三四五六七八九十子丑寅卯  ' }), {
    seal: null, lamp: false, moon: false, scroll: true, caption: '一二三四五六七八九十子丑',
  })
})
