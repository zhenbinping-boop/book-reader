import { useEffect, useRef } from 'react'

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
        if (window.history.state?.__backClose === id) {
          window.history.back()
        }
      }
      return
    }

    // 浮层打开时压入虚拟历史，以便拦截安卓侧滑返回
    window.history.pushState({ __backClose: id }, '')
    pushedRef.current = true

    const onPop = () => {
      pushedRef.current = false
      onCloseRef.current?.()
    }

    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
    }
  }, [isOpen, id])
}
