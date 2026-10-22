import { useEffect, useRef } from 'react'

// history.back() 是异步的。关闭旧浮层后立刻打开新浮层时，必须等旧的
// popstate 完成再登记新历史，否则迟到的返回事件会把新浮层也关掉。
let pendingBack = null

function removeHistoryEntry(id) {
  if (pendingBack || window.history.state?.__backClose !== id) return
  pendingBack = new Promise((resolve) => {
    window.addEventListener('popstate', () => {
      pendingBack = null
      resolve()
    }, { once: true })
    window.history.back()
  })
}

/**
 * 监听安卓设备物理返回键 / 全面屏边缘侧滑返回手势 / 浏览器后退按钮。
 *
 * 核心目的：
 * 当抽屉（SidePanel）、外观设置（AppearancePanel）、操作菜单或备份面板打开时，
 * 安卓用户本能的边缘侧滑返回应该「关闭当前浮层」，而不是把整个阅读器关闭退回书架或退出 App。
 *
 * @param {boolean} isOpen 浮层是否处于打开状态
 * @param {() => void} onClose 关闭浮层的方法
 * @param {string} [id] 浮层唯一标识
 */
export default function useBackClose(isOpen, onClose, id = 'modal') {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      if (pushedRef.current) {
        pushedRef.current = false
        // 如果是点击遮罩或关闭按钮触发的组件内关闭，回退一次以清理 pushState
        removeHistoryEntry(id)
      }
      return
    }

    let alive = true
    const onPop = () => {
      if (pendingBack) return // 另一浮层正在清理自己的历史
      if (window.history.state?.__backClose === id) return
      pushedRef.current = false
      onCloseRef.current?.()
    }

    const register = () => {
      if (!alive) return
      window.history.pushState({ ...window.history.state, __backClose: id }, '')
      pushedRef.current = true
      window.addEventListener('popstate', onPop)
    }
    if (pendingBack) pendingBack.then(register)
    else register()
    return () => {
      alive = false
      window.removeEventListener('popstate', onPop)
    }
  }, [isOpen, id])
}
