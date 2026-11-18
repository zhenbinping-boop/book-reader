// Reading growth is derived from portable time receipts, never a stored XP balance.
export const READING_RULES = Object.freeze({ minuteMs: 60_000, minimumMs: 300_000, idleMs: 180_000, dailyMs: 10_800_000, maxGapMs: 5000, checkpointMs: 5000, leaseMs: 8000 })
export const READING_RANKS = Object.freeze([
  ['tongsheng', '童生', 0], ['xiucai', '秀才', 10], ['juren', '举人', 50], ['gongshi', '贡士', 150],
  ['jinshi', '进士', 400], ['tanhua', '探花', 800], ['bangyan', '榜眼', 1400], ['zhuangyuan', '状元', 2200],
].map(([id, name, hours]) => Object.freeze({ id, name, hours, xp: hours * 60 })))

export function readingDay(time) {
  const d = new Date(time), pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addReadingTime(days, end, milliseconds) {
  let cursor = end - milliseconds
  while (cursor < end) {
    const date = new Date(cursor), next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
    const duration = Math.min(end, next) - cursor, key = readingDay(cursor)
    days[key] = (days[key] || 0) + duration; cursor += duration
  }
}

export function isReadingRecord(row) {
  if (!row || row.version !== 1 || typeof row.id !== 'string' || !row.id || row.id.length > 150 ||
    !Number.isSafeInteger(row.startedAt) || row.startedAt <= 0 || !Number.isSafeInteger(row.updatedAt) || row.updatedAt < row.startedAt ||
    !Number.isSafeInteger(row.effectiveMs) || row.effectiveMs < 0 || row.effectiveMs > row.updatedAt - row.startedAt ||
    typeof row.bookTitle !== 'string' || row.bookTitle.length > 500 ||
    !(row.bookHash === null || typeof row.bookHash === 'string' && row.bookHash.length <= 200) ||
    !row.days || Array.isArray(row.days) || typeof row.days !== 'object' || Object.keys(row.days).length > 3660) return false
  let sum = 0
  for (const [key, value] of Object.entries(row.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(Date.parse(key)) || new Date(key).toISOString().slice(0, 10) !== key ||
      !Number.isSafeInteger(value) || value < 0 || value > 90_000_000) return false
    sum += value
  }
  return sum === row.effectiveMs
}

export function cleanReadingRecord(row) {
  const { id, startedAt, updatedAt, effectiveMs, bookTitle, bookHash, days } = row
  return { version: 1, id, startedAt, updatedAt, effectiveMs, bookTitle, bookHash, days: { ...days } }
}

// Cumulative checkpoints of the same session merge by maximum, never addition.
export function mergeReadingRecord(local, incoming) {
  if (!local) return cleanReadingRecord(incoming)
  if (local.startedAt !== incoming.startedAt || local.bookHash !== incoming.bookHash) return local
  const dominates = Object.entries(local.days).every(([day, ms]) => (incoming.days[day] || 0) >= ms)
  return dominates && incoming.effectiveMs > local.effectiveMs ? cleanReadingRecord(incoming) : local
}

export function readingProfile(records, now = Date.now()) {
  const unique = new Map(), days = Object.create(null)
  for (const row of records) if (isReadingRecord(row)) unique.set(row.id, mergeReadingRecord(unique.get(row.id), row))
  let sessions = 0
  for (const row of unique.values()) {
    if (row.effectiveMs < READING_RULES.minimumMs) continue
    sessions++
    for (const [day, ms] of Object.entries(row.days)) days[day] = (days[day] || 0) + ms
  }
  const effectiveMs = Object.values(days).reduce((total, ms) => total + ms, 0)
  const creditedMs = Object.values(days).reduce((total, ms) => total + Math.min(ms, READING_RULES.dailyMs), 0)
  const xp = Math.floor(creditedMs / READING_RULES.minuteMs)
  let index = 0
  while (index + 1 < READING_RANKS.length && xp >= READING_RANKS[index + 1].xp) index++
  const rank = READING_RANKS[index], next = READING_RANKS[index + 1] || null
  return { xp, effectiveMs, creditedMs, sessions, days, rank, next, remainingXp: next ? next.xp - xp : 0,
    progress: next ? (xp - rank.xp) / (next.xp - rank.xp) : 1,
    todayXp: Math.floor(Math.min(days[readingDay(now)] || 0, READING_RULES.dailyMs) / READING_RULES.minuteMs) }
}

// Monotonic samples reject timer suspension and clock jumps; elapsed intervals
// after the last meaningful interaction are clipped at the inactivity boundary.
export function createReadingClock(record, mono, wall) {
  let current = cleanReadingRecord(record), lastMono = mono, lastWall = wall, lastActivity = mono, active = false
  return {
    get record() { return cleanReadingRecord(current) },
    get idle() { return lastMono - lastActivity >= READING_RULES.idleMs },
    sample(nextMono, nextWall, allowed) {
      const delta = Math.floor(nextMono - lastMono), wallDelta = nextWall - lastWall
      const healthy = delta >= 0 && delta <= READING_RULES.maxGapMs && Math.abs(wallDelta - delta) <= 100
      if (active && healthy) {
        const credit = Math.max(0, Math.min(delta, Math.floor(lastActivity + READING_RULES.idleMs - lastMono), nextWall - current.startedAt - current.effectiveMs))
        if (credit > 0) { addReadingTime(current.days, nextWall - delta + credit, credit); current.effectiveMs += credit }
      }
      if (!healthy) lastActivity = -Infinity
      current.updatedAt = Math.max(current.updatedAt, nextWall)
      lastMono = nextMono; lastWall = nextWall; active = allowed && healthy
      return this.record
    },
    activity(nextMono, nextWall) { this.sample(nextMono, nextWall, active); lastActivity = nextMono },
    replace(saved) { current = cleanReadingRecord(saved) },
  }
}

export function formatReadingTime(ms) {
  const minutes = Math.floor(ms / READING_RULES.minuteMs), hours = Math.floor(minutes / 60)
  return hours ? `${hours} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}` : `${minutes} 分钟`
}
