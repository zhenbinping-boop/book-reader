import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 全屏沉浸。
 *
 * 分两层，而且**必须分开**：
 *   - UI 层：`.reader.immersive` 藏掉进度条，顶栏只在点击中间区时临时浮现。
 *     这一层任何设备都能生效。
 *   - 真全屏层：`requestFullscreen()` 把浏览器自己的地址栏 / 标签栏也收掉。
 *
 * 为什么两层不能绑死：**iPhone 上的 Safari 至今不支持元素全屏 API**
 * （只有 iPad 支持）。如果「沉浸」= 真全屏，那 iPhone 用户按了这个按钮会毫无反应。
 * 拆开之后 iPhone 至少能拿到 UI 层的沉浸，体验是递减而不是失效。
 *
 * 还有一个必须接的事件：**用户按 Esc / 系统手势退出全屏时，`fullscreenchange`
 * 才会告诉我们**。不接的话按钮状态会显示「沉浸中」而屏幕其实已经退出全屏了。
 */

export const fullscreenSupported = () => {
  if (typeof document === 'undefined') return false
  const el = document.documentElement
  return !!(el.requestFullscreen || el.webkitRequestFullscreen)
}

const fsElement = () =>
  (typeof document !== 'undefined' &&
    (document.fullscreenElement || document.webkitFullscreenElement)) ||
  null

/**
 * @returns {{ on: boolean, realFs: boolean, supported: boolean, toggle: () => void, setOn: (v:boolean)=>void }}
 *   on       —— 沉浸模式是否开启（UI 层，一定有效）
 *   realFs   —— 真全屏是否真的生效（iPhone 上恒为 false，不代表功能坏了）
 */
export default function useImmersive(initial = false) {
  const [on, setOn] = useState(initial)
  const [realFs, setRealFs] = useState(false)
  const [supported] = useState(fullscreenSupported)
  const onRef = useRef(initial)
  onRef.current = on

  const setOnWrapped = useCallback(
    async (next) => {
      setOn(next)
      onRef.current = next
      try {
        const el = document.documentElement
        if (next) {
          if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' })
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
        } else if (fsElement()) {
          if (document.exitFullscreen) await document.exitFullscreen()
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
        }
      } catch {
        // 不支持 / 被拒 / 没有用户手势 —— 只保留 UI 层沉浸
      }
    },
    []
  )

  const toggle = useCallback(() => setOnWrapped(!onRef.current), [setOnWrapped])

  // 用户在系统层面退出全屏（Esc、手势、切换 App）时同步状态
  useEffect(() => {
    const sync = () => {
      const active = !!fsElement()
      setRealFs(active)
      // 退出全屏却还留着「沉浸中」的状态，按钮会和实际不符，这里一并收回
      if (!active && onRef.current) {
        onRef.current = false
        setOn(false)
      }
    }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    sync()
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  // 离开阅读器时必须退出全屏，否则书架会留在全屏里而且没有退出入口
  useEffect(() => {
    return () => {
      if (!fsElement()) return
      try {
        if (document.exitFullscreen) document.exitFullscreen()
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
      } catch {
        /* 忽略 */
      }
    }
  }, [])

  return { on, realFs, supported, toggle, setOn: setOnWrapped }
}
