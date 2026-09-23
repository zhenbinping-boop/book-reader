import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 阅读时常亮（Screen Wake Lock）。
 *
 * 为什么需要它：手机上读着读着屏幕就暗了，隔几秒要摸一下屏幕 —— 这是阅读类
 * App 最影响沉浸感的细节之一。浏览器有标准 API，但有几个坑：
 *
 * 1. **切到后台时浏览器会强制释放锁，回到前台不会自动恢复。**
 *    如果不接 visibilitychange 重新申请，「常亮」会悄悄失效，而且没有任何提示 ——
 *    用户只会觉得「这功能时灵时不灵」。这是这个 hook 存在的唯一理由。
 * 2. **申请可能被拒**：低电量模式、浏览器策略、权限设置。
 *    一律静默降级，不弹错 —— 常亮是锦上添花，失败不该打断阅读。
 * 3. **锁可能被系统单方面释放**（电量低到某个阈值），所以必须监听 release
 *    事件把本地状态同步回 null，否则我们会以为还持有锁，不再重新申请。
 */

export const wakeLockSupported = () =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator && !!navigator.wakeLock?.request

/**
 * @param {boolean} initial 初始是否开启（来自 prefs，用户上次的选择）
 * @returns {{ on: boolean, supported: boolean, setOn: (v: boolean) => void }}
 */
export default function useWakeLock(initial = false) {
  const [on, setOn] = useState(initial)
  const [supported] = useState(wakeLockSupported)
  const sentinelRef = useRef(null)
  // 事件回调里要读最新的 on，但又不想让监听随 on 反复重挂，所以走 ref
  const onRef = useRef(initial)
  onRef.current = on

  const release = useCallback(async () => {
    const s = sentinelRef.current
    sentinelRef.current = null
    if (!s) return
    try {
      await s.release()
    } catch {
      /* 已经释放过了，忽略 */
    }
  }, [])

  const acquire = useCallback(async () => {
    if (!wakeLockSupported()) return false
    // 页面不可见时申请必然失败，先跳过，等回到前台再申请
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false
    try {
      const sentinel = await navigator.wakeLock.request('screen')
      sentinelRef.current = sentinel
      // 系统可能自己释放（低电量等），同步掉本地引用，下次可见时会重新申请
      sentinel.addEventListener?.('release', () => {
        if (sentinelRef.current === sentinel) sentinelRef.current = null
      })
      return true
    } catch {
      // 低电量模式 / 被策略拒绝 —— 静默降级，不影响阅读
      return false
    }
  }, [])

  useEffect(() => {
    if (!on) {
      release()
      return
    }
    let alive = true
    acquire()

    const onVisible = () => {
      if (!alive) return
      if (document.visibilityState !== 'visible') return
      if (!onRef.current || sentinelRef.current) return
      acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      release()
    }
  }, [on, acquire, release])

  return { on, supported, setOn }
}
