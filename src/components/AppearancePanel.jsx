import { useEffect } from 'react'
import {
  READER_THEMES,
  THEME_LABELS,
  READER_SIZES,
  READER_LEADINGS,
  READER_PARA_GAPS,
  READER_PADS,
  snapTo,
} from '../lib/prefs'

/**
 * 外观设置面板（字号 / 行距 / 段距 / 页边距 + 阅读主题）。
 *
 * 注意适用范围：**PDF 是固定版式，这几项对它没有意义**，所以这个入口只挂在
 * TXT 阅读器上（将来 EPUB 也可以复用）。PDF 那边只有主题切换。
 *
 * 所有改动即时生效 —— 用一个「预览块」当场看到效果，比来回确认直观得多。
 *
 * 四项滑杆的取值都是**档位下标**而不是像素 / 倍率本身（DESIGN.md §4.2 的四张阶梯）。
 * 这样滑杆和双指缩放共用同一张表，不会出现「滑到 19px、捏一下跳回 20px」。
 */

const LADDERS = [
  { key: 'readerSize', label: '字号', list: READER_SIZES, fmt: (v) => `${v}px` },
  { key: 'readerLeading', label: '行距', list: READER_LEADINGS, fmt: (v) => v.toFixed(1) },
  { key: 'readerParaGap', label: '段距', list: READER_PARA_GAPS, fmt: (v) => (v ? `${v}em` : '无') },
  { key: 'readerPad', label: '页边距', list: READER_PADS, fmt: (v) => `${v}px` },
]

export default function AppearancePanel({ values, theme, onChange, onReset, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const previewStyle = {
    '--reader-size': `${values.readerSize}px`,
    '--reader-leading': values.readerLeading,
    '--reader-para-gap': `${values.readerParaGap}em`,
  }

  return (
    <>
      <div className="modal-mask" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="外观设置">
        <div className="modal-card">
          <div className="drawer-head">
            <strong className="modal-title">外观设置</strong>
            <button className="btn btn-sm" onClick={onClose}>
              关闭
            </button>
          </div>

          <div className="modal-body">
            <div className="appearance-preview" data-reader-theme={theme} style={previewStyle}>
              <p>他说，读书这件事，急不得。字要一个一个地看，日子要一天一天地过。</p>
              <p>窗外的光斜进来，落在书页上，像给每个字都镀了一层薄薄的边。</p>
            </div>

            <section className="modal-sec">
              <h3>正文排版</h3>
              {LADDERS.map((s) => (
                <div className="appearance-row" key={s.key}>
                  <label htmlFor={`ap-${s.key}`}>{s.label}</label>
                  <input
                    id={`ap-${s.key}`}
                    type="range"
                    min={0}
                    max={s.list.length - 1}
                    step={1}
                    value={Math.max(0, s.list.indexOf(snapTo(s.list, values[s.key])))}
                    onChange={(e) => onChange({ [s.key]: s.list[Number(e.target.value)] })}
                  />
                  <span className="appearance-val">{s.fmt(values[s.key])}</span>
                </div>
              ))}
            </section>

            <section className="modal-sec">
              <h3>阅读主题</h3>
              <div className="theme-picker">
                {READER_THEMES.map((t) => (
                  <button
                    key={t}
                    className={`theme-opt${theme === t ? ' on' : ''}`}
                    aria-pressed={theme === t}
                    onClick={() => onChange({ readerTheme: t })}
                  >
                    <span className="theme-dot" data-theme={t} aria-hidden="true" />
                    {THEME_LABELS[t]}
                  </button>
                ))}
              </div>
              <p className="modal-note">
                阅读时也可以直接在正文上双指开合来调字号（同样走这 7 档）。
                主题按设备保存，跟随系统亮暗作为默认。设置只影响 TXT 这类流式排版的书，
                PDF 是固定版式，页面上看到的仍是原样。
              </p>
            </section>

            <section className="modal-sec">
              <button className="btn" onClick={onReset}>
                恢复默认
              </button>
            </section>
          </div>
        </div>
      </div>
    </>
  )
}
