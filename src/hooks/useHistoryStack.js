import { useCallback, useRef, useState } from 'react'

/**
 * 位置后退栈：记住「跳转之前我在哪」，让用户能原路退回。
 *
 * 只记**跳转**（点目录、点笔记、点搜索结果）—— 这类操作把人瞬移走，而且靠翻页基本走不回来。
 * 翻页**不进栈**：否则读两页再回退只是往回翻一页，反而会把真正的跳转挤出栈外。
 *
 * 条目对调用方透明：PDF 存 `{ page }`，TXT 存 `{ chapterIndex, charOffset }`，
 * 怎么解读由阅读器自己决定。TXT 存字符锚点而不是页号，所以换字号 / 旋屏之后
 * 回退依然落在同一段文字上（与进度持久化同一套位置模型）。
 *
 * 返回的深度用 state 而不是 ref，是为了让「回退」按钮能在栈空 / 非空之间切换显隐。
 */
export default function useHistoryStack({ limit = 30 } = {}) {
  const stackRef = useRef([])
  const [depth, setDepth] = useState(0)

  const push = useCallback(
    (entry) => {
      if (!entry) return false
      const s = stackRef.current
      s.push(entry)
      // 只留最近的 limit 条，避免长会话里无限增长
      if (s.length > limit) s.splice(0, s.length - limit)
      setDepth(s.length)
      return true
    },
    [limit]
  )

  const pop = useCallback(() => {
    const s = stackRef.current
    if (!s.length) return null
    const entry = s.pop()
    setDepth(s.length)
    return entry
  }, [])

  const clear = useCallback(() => {
    stackRef.current = []
    setDepth(0)
  }, [])

  return { push, pop, clear, depth, canBack: depth > 0 }
}
