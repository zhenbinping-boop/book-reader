import { isFocusRecord } from './focusTimer.js'
import { READING_RANKS, READING_RULES, readingDay } from './readingExperience.js'

export const STUDY_OBJECTS = Object.freeze([
  { id: 'lamp', name: '案头灯', description: '给案头留一盏暖灯。', hours: 1 },
  { id: 'moon', name: '松窗月色', description: '将窗景换成松山夜色。', hours: 10 },
  { id: 'scroll', name: '自题挂轴', description: '挂上自己写的一句话。', hours: 50 },
])

export const SEAL_MATERIALS = ['竹节长印', '青石方印', '古铜拱印', '圆形青玉印', '双框朱砂印', '梅瓣白玉印', '墨玉拱印', '描金朱砂印']
export const HOUR_MS = 3_600_000
const STORAGE_KEY = 'reader.studyDecor'

export function studyFocusHistory(records) {
  const unique = new Map()
  for (const record of records) {
    if (isFocusRecord(record) && record.elapsedMs > 0) unique.set(record.id, record)
  }
  return [...unique.values()].sort((a, b) => b.endedAt - a.endedAt)
}

export function rankAchievementDays(days) {
  const achieved = {}
  let creditedMs = 0
  let rank = 1
  for (const [day, ms] of Object.entries(days).sort(([a], [b]) => a.localeCompare(b))) {
    creditedMs += Math.min(ms, READING_RULES.dailyMs)
    while (rank < READING_RANKS.length && creditedMs >= READING_RANKS[rank].xp * READING_RULES.minuteMs) {
      achieved[READING_RANKS[rank].id] = day
      rank++
    }
    if (rank === READING_RANKS.length) break
  }
  return achieved
}

export function studyMonths(readingDays, focusRows, now = Date.now()) {
  const current = readingDay(now).slice(0, 7)
  const months = new Map()
  const get = month => {
    if (!months.has(month)) months.set(month, { month, readingMs: 0, focusMs: 0, rows: [] })
    return months.get(month)
  }
  get(current)
  for (const [day, ms] of Object.entries(readingDays)) if (ms > 0) get(day.slice(0, 7)).readingMs += ms
  for (const row of focusRows) {
    const month = get(readingDay(row.endedAt).slice(0, 7))
    month.focusMs += row.elapsedMs
    month.rows.push(row)
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month))
}

export function cleanStudyDecor(value) {
  const seal = READING_RANKS.some(rank => rank.id === value?.seal) ? value.seal : null
  const caption = typeof value?.caption === 'string' ? [...value.caption.trim()].slice(0, 12).join('') : ''
  return { seal, lamp: value?.lamp === true, moon: value?.moon === true, scroll: value?.scroll === true, caption }
}

export function loadStudyDecor() {
  try { return cleanStudyDecor(JSON.parse(localStorage.getItem(STORAGE_KEY))) }
  catch { return cleanStudyDecor(null) }
}

export function saveStudyDecor(value) {
  const decor = cleanStudyDecor(value)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decor))
  return decor
}
