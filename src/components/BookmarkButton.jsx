/**
 * 顶栏的书签开关。
 *
 * 加书签是「给当前位置做个标记」，所以只给**一个**按钮、两种状态（已在 / 未在），
 * 按一下切换 —— 不给「加」和「删」两个入口，否则用户得先自己判断当前算不算已加过。
 * 这也是三个阅读器唯一需要共享的书签 UI：列表在 SidePanel 里。
 *
 * 图标用内联 SVG 而不是 emoji：🔖 在不同系统上字形差异很大（有的还是彩色方块），
 * 而这里需要「空心 = 未加 / 实心 = 已加」这个对比，交给 CSS 控制填充最稳。
 */
export default function BookmarkButton({ on, onToggle, disabled }) {
  return (
    <button
      className="btn btn-sm bm-btn"
      data-on={on ? '1' : '0'}
      onClick={onToggle}
      disabled={disabled}
      title={on ? '当前页已有书签，点击删除' : '把当前页加为书签'}
      aria-label={on ? '删除当前页书签' : '把当前页加为书签'}
      aria-pressed={!!on}
    >
      <svg width="12" height="14" viewBox="0 0 24 26" aria-hidden="true">
        <path d="M4 3.2A1.2 1.2 0 0 1 5.2 2h13.6A1.2 1.2 0 0 1 20 3.2V24l-8-5-8 5V3.2Z" />
      </svg>
    </button>
  )
}
