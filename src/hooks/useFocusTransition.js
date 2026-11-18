import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { FOCUS_ENTER_MS, FOCUS_LEAVE_MS, focusTransitionSample } from '../lib/focusTransition'

export default function useFocusTransition(hasSession, ready) {
  const reduced = useReducedMotion()
  const [view, setView] = useState({ phase: 'loading', camera: 0, pose: 0 })
  const motionRef = useRef(null)
  if (!motionRef.current) {
    const listeners = new Set()
    motionRef.current = {
      current: view,
      subscribe(listener) { listeners.add(listener); listener(this.current); return () => listeners.delete(listener) },
      commit(next) { this.current = next; for (const listener of listeners) listener(next) },
    }
  }
  const motion = motionRef.current
  const hydrated = useRef(false)
  useEffect(() => {
    if (!ready) return
    const target = hasSession ? 1 : 0
    const publish = (next, force = false) => {
      const changed = motion.current.phase !== next.phase
      motion.commit(next)
      // React owns semantic phases only. Canvas/camera subscribe to smooth
      // progress directly, without reconciling the page on every frame.
      if (changed || force) setView(next)
    }
    if (!hydrated.current || reduced) {
      hydrated.current = true
      const next = { phase: hasSession ? 'active' : 'idle', camera: reduced ? 0 : target, pose: target }
      publish(next, true)
      return
    }
    const from = { camera: motion.current.camera, pose: motion.current.pose }
    if (Math.abs(from.pose - target) < .0001 && Math.abs(from.camera - target) < .0001) return
    const phase = hasSession ? 'entering' : 'leaving'
    const duration = hasSession ? FOCUS_ENTER_MS : FOCUS_LEAVE_MS
    const started = performance.now()
    let frame
    const animate = time => {
      const sample = focusTransitionSample(from, target, time - started, duration)
      const next = { ...sample, phase: sample.done ? hasSession ? 'active' : 'idle' : phase }
      publish(next)
      if (!sample.done) frame = requestAnimationFrame(animate)
    }
    publish({ ...motion.current, phase })
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [hasSession, ready, reduced, motion])
  return { ...view, reduced: !!reduced, motion }
}
