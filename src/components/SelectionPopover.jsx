export default function SelectionPopover({ data, onPick, onDelete, onCopy, onClose }) {
  const { rect } = data
  const W = 280
  const H = 48
  const vw = window.innerWidth
  const vh = window.innerHeight

  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - W / 2), Math.max(8, vw - W - 8))
  // 选区上方放不下就落到下方，避免被工具栏遮住
  const above = rect.top - H - 10
  const top = above > 8 ? above : Math.min(rect.bottom + 10, vh - H - 8)

  return (
    <>
      <div className="popover-mask" onMouseDown={onClose} onTouchStart={onClose} />
      <div
        className="popover"
        style={{ left, top, width: W, height: H }}
        onMouseDown={(e) => e.stopPropagation()}
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
      </div>
    </>
  )
}
