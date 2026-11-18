import { useEffect, useMemo, useState } from 'react'
import { liveQuery } from 'dexie'
import { db } from '../db'
import { readingProfile } from '../lib/readingExperience'

export default function useReadingProfile() {
  const [records, setRecords] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const subscription = liveQuery(() => db.readingSessions.toArray()).subscribe({
      next: rows => { setRecords(rows); setError('') },
      error: () => setError('读书功名暂时无法读取'),
    })
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => { subscription.unsubscribe(); window.clearInterval(timer) }
  }, [])

  const profile = useMemo(() => readingProfile(records || [], now), [records, now])
  return { profile, loading: records === null && !error, error }
}
