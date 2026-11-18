import test from 'node:test'
import assert from 'node:assert/strict'
import { READING_RANKS, READING_RULES, readingDay, addReadingTime, isReadingRecord, mergeReadingRecord, readingProfile, createReadingClock } from '../src/lib/readingExperience.js'

const start = new Date(2026, 10, 4, 9).getTime()
const record = (id = 'session', ms = 0, time = start) => ({ version: 1, id, startedAt: time, updatedAt: time + ms, effectiveMs: ms, bookTitle: '已知时长', bookHash: 'sha256:test', days: ms ? { [readingDay(time)]: ms } : {} })

test('five minutes qualifies the full session, short visits never aggregate into qualifying sessions', () => {
  assert.equal(readingProfile([record('a', 299999), record('b', 299999)]).xp, 0)
  assert.equal(readingProfile([record('a', 300000)]).xp, 5)
  assert.equal(readingProfile([record('a', 359999)]).xp, 5)
  assert.equal(readingProfile([record('a', 359999), record('b', 300001)]).xp, 11)
})

test('daily three-hour cap combines all books and survives midnight without resetting lifetime progress', () => {
  const nextDay = start + 86400000
  const result = readingProfile([record('a', 2 * 3600000), record('b', 2 * 3600000), record('c', 3600000, nextDay)], nextDay)
  assert.equal(result.xp, 240); assert.equal(result.todayXp, 60)
  assert.equal(result.effectiveMs, 5 * 3600000); assert.equal(result.creditedMs, 4 * 3600000)
})

test('reading interval is split exactly at local midnight and record data rejects malformed dates or durations', () => {
  const midnight = new Date(2026, 10, 5).getTime(), days = {}
  addReadingTime(days, midnight + 2000, 5000)
  assert.deepEqual(days, { '2026-11-04': 3000, '2026-11-05': 2000 })
  const good = record('valid', 300000)
  assert.equal(isReadingRecord(good), true)
  for (const patch of [{ effectiveMs: Infinity }, { effectiveMs: -1 }, { updatedAt: start + 1 }, { days: { '2026-02-30': 300000 } }, { days: { '2026-11-04': 299999 } }, { version: 2 }]) assert.equal(isReadingRecord({ ...good, ...patch }), false)
})

test('duplicate and older backup checkpoints neither multiply experience nor replace newer time', () => {
  const older = record('same', 300000), newer = record('same', 600000)
  assert.equal(readingProfile([older, newer, newer, older]).xp, 10)
  assert.equal(mergeReadingRecord(newer, older), newer)
  assert.equal(mergeReadingRecord(newer, { ...newer, bookHash: 'other', effectiveMs: 900000, updatedAt: start + 900000, days: { [readingDay(start)]: 900000 } }), newer)
})

test('real samples qualify five minutes while inactivity is clipped and cannot be extended by polling', () => {
  const clock = createReadingClock(record(), 0, start)
  clock.sample(0, start, true)
  for (let second = 1; second <= 300; second++) {
    if (second % 60 === 0) clock.activity(second * 1000, start + second * 1000)
    clock.sample(second * 1000, start + second * 1000, true)
  }
  assert.equal(clock.record.effectiveMs, 300000); assert.equal(readingProfile([clock.record]).xp, 5)
  for (let second = 301; second <= 600; second++) clock.sample(second * 1000, start + second * 1000, true)
  assert.equal(clock.record.effectiveMs, 480000); assert.equal(clock.idle, true)
  clock.activity(600000, start + 600000); clock.sample(601000, start + 601000, true)
  assert.equal(clock.record.effectiveMs, 481000)
})

test('background, scheduler suspension and changing wall time do not create retroactive experience', () => {
  const clock = createReadingClock(record(), 0, start)
  clock.sample(0, start, true); clock.sample(1000, start + 1000, false)
  clock.sample(120000, start + 120000, false)
  assert.equal(clock.record.effectiveMs, 1000)
  clock.activity(120000, start + 120000); clock.sample(120000, start + 120000, true)
  clock.sample(121000, start + 121000, true)
  assert.equal(clock.record.effectiveMs, 2000)
  clock.sample(122000, start + 3600000, true)
  clock.sample(123000, start + 3601000, true)
  assert.equal(clock.record.effectiveMs, 2000)
})

test('all rank boundaries and the slowest allowed completion match the published hours', () => {
  assert.deepEqual(READING_RANKS.map(rank => rank.hours), [0,10,50,150,400,800,1400,2200])
  const accumulated = []
  const atXp = target => {
    accumulated.length = 0
    for (let left = target, day = 0; left > 0; day++) {
      const minutes = Math.min(180, left)
      accumulated.push(record(String(day), minutes * 60000, start + day * 86400000)); left -= minutes
    }
    return readingProfile(accumulated)
  }
  for (let i = 1; i < READING_RANKS.length; i++) {
    const rank = READING_RANKS[i]
    assert.equal(atXp(rank.xp - 1).rank.id, READING_RANKS[i - 1].id)
    const result = atXp(rank.xp)
    assert.equal(result.rank.id, rank.id); assert.ok(result.progress >= 0 && result.progress <= 1)
  }
  assert.equal(atXp(132000).next, null)
  assert.equal(Math.ceil(READING_RANKS.at(-1).xp / (READING_RULES.dailyMs / 60000)), 734)
})
