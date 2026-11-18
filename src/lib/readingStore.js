import { db } from '../db'
import { cleanReadingRecord, isReadingRecord, mergeReadingRecord, READING_RULES } from './readingExperience.js'

// One device-wide lease serializes counting across tabs and readers. An expired
// lease may be reclaimed, but its unconfirmed time must never be backfilled.
export async function checkpointReading(owner, record, { now = Date.now(), release = false } = {}) {
  if (!isReadingRecord(record)) throw Error('阅读时长记录无效')
  return db.transaction('rw', [db.readingSessions, db.readingState], async () => {
    const lease = await db.readingState.get('lease'), previous = await db.readingSessions.get(record.id)
    const owned = lease?.owner === owner && lease.expiresAt >= now
    let saved = previous || { ...cleanReadingRecord(record), effectiveMs: 0, days: {} }
    if (owned && record.effectiveMs > 0) {
      saved = mergeReadingRecord(previous, record)
      await db.readingSessions.put(saved)
    }
    if (release) {
      if (lease?.owner === owner) await db.readingState.delete('lease')
      return { owned: false, accepted: owned, record: saved, expiresAt: 0 }
    }
    if (!lease || lease.owner === owner || lease.expiresAt < now) {
      const expiresAt = now + READING_RULES.leaseMs
      await db.readingState.put({ key: 'lease', owner, expiresAt })
      return { owned: true, accepted: owned, record: saved, expiresAt }
    }
    return { owned: false, accepted: false, record: saved, expiresAt: 0 }
  })
}
