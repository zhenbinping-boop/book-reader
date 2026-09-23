import { useEffect } from 'react'

/**
 * 阅读器的「显示」面板 —— 从工具栏的 `⋯` 弹出，做成底部抽屉。
 *
 * 为什么要有它：DESIGN.md §11 记了一条「工具栏需要重新组织 —— 现有控件已接近
 * 手机一行能容纳的上限」。常亮 / 沉浸 / 外观都是「显示相关」，塞进工具栏会溢出，
 * 收进一个面板后工具栏宽度不变。
 *
 * 为什么是底部抽屉而不是贴着按钮的气泡：手机上气泡要考虑安全区、屏幕边缘翻转，
 * 而且这一组是开关不是动作，抽屉更好点。桌面端居中显示同一份卡片。
 *
 * 关于「不支持」：iPhone Safari 不支持元素全屏、部分浏览器没有 Wake Lock。
 * 这类项**不禁用、照常可点**，只在右侧标一句「此设备不支持」——
 * 禁用按钮用户不知道为什么不能用，标出来才知道是浏览器的问题而不是 App 坏了。
 */
export default function DisplayMenu({ rows, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <>
      <div className="modal-mask" onClick={onClose} />
      <div className="modal display-menu" role="dialog" aria-modal="true" aria-label="显示设置">
        <div className="modal-card">
          <div className="drawer-head">
            <strong className="modal-title">显示</strong>
            <button className="btn btn-sm" onClick={onClose}>
              关闭
            </button>
          </div>
          <div className="modal-body">
            <section className="modal-sec">
              {rows.map((r) =>
                r.type === 'switch' ? (
                  <button
                    key={r.key}
                    className="display-row"
                    role="switch"
                    aria-checked={!!r.on}
                    onClick={r.onToggle}
                    disabled={r.disabled}
                  >
                    <span className="display-label">{r.label}</span>
                    {r.note && <span className="display-note">{r.note}</span>}
                    <span className={`switch${r.on ? ' on' : ''}`} aria-hidden="true" />
                  </button>
                ) : (
                  <button key={r.key} className="display-row" onClick={r.onClick}>
                    <span className="display-label">{r.label}</span>
                    <span className="display-note">{r.value || ''}</span>
                    <span className="display-arrow" aria-hidden="true">
                      ›
                    </span>
                  </button>
                )
              )}
            </section>
            <p className="modal-note">
              这些设置按设备保存。「常亮」在不支持的手机会被浏览器忽略，不影响其他功能。
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
