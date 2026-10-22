export default function SelectionPopover({ data, onPick, onDelete, onCopy, onClose }) {
  const { rect } = data
  const W = 280
  const H = 48
  const vw = window.innerWidth
  const vh = window.innerHeight

  const isCoarse =
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0

  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - W / 2), Math.max(8, vw - W - 8))

  // 安卓触屏（coarse pointer）长按选词时，系统原生浮动菜单（复制/分享）通常出现在选区正上方。
  // 触屏下优先放在选区下方（rect.bottom + 12），避免与系统菜单重叠；下方放不下时再落回上方。
  // 鼠标桌面端则保持优先在上方。
  let top
  if (isCoarse) {
    const below = rect.bottom + 12
    top = below + H <= vh - 8 ? below : Math.max(8, rect.top - H - 12)
  } else {
    const above = rect.top - H - 10
    top = above > 8 ? above : Math.min(rect.bottom + 10, vh - H - 8)
  }

  return (
    <>
      {!isCoarse && <div className="popover-mask" onMouseDown={onClose} />}
      <div
        className="popover"
        role="toolbar"
        aria-label="选中文字操作"
        data-placement={isCoarse ? 'bottom' : 'floating'}
        style={isCoarse ? undefined : { left, top, width: W, height: H }}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {data.existing ? (
          <>
            {['yellow', 'green', 'blue', 'pink'].map((c) => (
              <button
                key={c}
                className={`sw${data.existing.color === c ? ' on' : ''}`}
                data-color={c}
                title={`改为${c}`}
                aria-label={`改为${c}色`}
                onClick={() => onPick(c)}
              />
            ))}
            <button className="pop-btn" onClick={() => onCopy()}>
              复制
            </button>
            <button className="pop-btn danger" onClick={() => onDelete()}>
              删除
            </button>
          </>
        ) : (
          <>
            {['yellow', 'green', 'blue', 'pink'].map((c) => (
              <button
                key={c}
                className="sw"
                data-color={c}
                title={`高亮为${c}`}
                aria-label={`高亮为${c}色`}
                onClick={() => onPick(c)}
              />
            ))}
            <button className="pop-btn" onClick={() => onCopy()}>
              复制
            </button>
          </>
        )}
        {isCoarse && <button className="pop-btn" aria-label="关闭选中文字操作" onClick={onClose}>关闭</button>}
      </div>
    </>
  )
}
