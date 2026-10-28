import { useState } from 'react'
import { ArrowDownToLine, ChevronRight, FileText, Hand, Moon, Sun, Upload } from 'lucide-react'
import { DEFAULT_PREFS, loadPrefs, savePrefs, resolveTheme, READER_THEMES, THEME_LABELS, READER_BACKGROUNDS, READER_BACKGROUND_LABELS, READER_SIZES, READER_LEADINGS, READER_PARA_GAPS, READER_PADS } from '../lib/prefs'
import { SectionTitle } from './InkUI'

export function ThemePicker({ theme, onChange }) {
  return <div className="theme-picker ink-theme-picker">{READER_THEMES.map(t => <button key={t} className={`theme-opt ${theme === t ? 'on' : ''}`} aria-pressed={theme === t} onClick={() => onChange(t)}><span className="theme-dot" data-theme={t} aria-hidden="true">{theme === t && <span>✓</span>}</span>{THEME_LABELS[t]}</button>)}</div>
}

export function BackgroundPicker({ value, onChange }) {
  return <div className="background-picker">{READER_BACKGROUNDS.map(bg => <button key={bg} type="button" className="background-choice" aria-label={`阅读背景：${READER_BACKGROUND_LABELS[bg]}`} aria-pressed={value === bg} onClick={() => onChange(bg)}><span data-background={bg} /><small>{READER_BACKGROUND_LABELS[bg]}</small></button>)}</div>
}

export default function LibrarySettings({ onPickFile, onOpenBackup }) {
  const [prefs, setPrefs] = useState(loadPrefs)
  const [tip, setTip] = useState('')
  const change = patch => { setPrefs(savePrefs(patch)); setTip('已保存，将用于下次阅读') }
  const cycle = (key, ladder) => { const i = ladder.indexOf(prefs[key]); change({ [key]: ladder[(i + 1) % ladder.length] }) }
  return <div className="library-settings">
    <section className="settings-section"><SectionTitle>导入图书</SectionTitle><div className="format-tiles">{[['pdf', 'PDF', '固定版式'], ['txt', 'TXT', '纯文本'], ['epub', 'EPUB', '电子书']].map(([id, title, sub]) => <button className={`format-tile tile-${id}`} key={id} onClick={() => onPickFile(id)}><span className="file-icon"><FileText size={24} strokeWidth={1.3} /><b>{title}</b></span><strong>{title}</strong><span>{sub}</span></button>)}</div></section>
    <section className="settings-section"><SectionTitle>阅读外观</SectionTitle><ThemePicker theme={resolveTheme(prefs)} onChange={t => change({ readerTheme: t })} />
      <p className="setting-help">阅读背景</p><BackgroundPicker value={prefs.readerBackground} onChange={b => change({ readerBackground: b })} />
      <div className="settings-font-row"><span>字号</span><span className="type-a">A</span><input type="range" aria-label="默认字号" min={0} max={READER_SIZES.length - 1} value={Math.max(0, READER_SIZES.indexOf(prefs.readerSize))} onChange={e => change({ readerSize: READER_SIZES[Number(e.target.value)] })} /><span className="type-a large">A</span></div>
      {[['readerLeading', '行距', READER_LEADINGS], ['readerParaGap', '段距', READER_PARA_GAPS], ['readerPad', '页边距', READER_PADS]].map(([key, label, ladder]) => <button className="settings-row" key={key} onClick={() => cycle(key, ladder)}><span>{label}</span><span className="setting-value">{key === 'readerPad' ? `${prefs[key]}px` : key === 'readerParaGap' ? `${prefs[key]}em` : prefs[key]}<ChevronRight size={15} /></span></button>)}
      <div className="settings-row"><span>阅读方式</span><div className="segmented">{[['page', '翻页'], ['scroll', '滚动']].map(([key, label]) => <button key={key} aria-pressed={prefs.readerFlow === key} onClick={() => change({ readerFlow: key })}>{label}</button>)}</div></div>
      <p className="setting-help">字号与排版适用于 TXT / EPUB，PDF 保留原始版式。</p>
    </section>
    <section className="settings-section"><SectionTitle>阅读体验</SectionTitle><button className="settings-row setting-switch" role="switch" aria-checked={!!prefs.readerKeepAwake} onClick={() => change({ readerKeepAwake: !prefs.readerKeepAwake })}><Sun size={19} /><span><strong>屏幕常亮</strong><small>阅读时保持屏幕亮起</small></span><i className={`switch${prefs.readerKeepAwake ? ' on' : ''}`} /></button>
      <button className="settings-row setting-switch" role="switch" aria-checked={!!prefs.readerImmersive} onClick={() => change({ readerImmersive: !prefs.readerImmersive })}><Moon size={19} /><span><strong>沉浸阅读</strong><small>打开书籍时默认收起操作栏</small></span><i className={`switch${prefs.readerImmersive ? ' on' : ''}`} /></button>
      <div className="gesture-hint"><Hand size={23} strokeWidth={1.2} /><span>双指缩放 · 点击显隐工具栏</span></div>
    </section>
    <section className="settings-section"><SectionTitle>备份与恢复</SectionTitle><p className="setting-help">书籍、进度、书签与笔记，妥善收藏。</p><button className="settings-row backup-entry" onClick={onOpenBackup}><Upload size={20} /><span>导出备份 / 恢复备份</span><ArrowDownToLine size={18} /><ChevronRight size={16} /></button><p className="setting-help">可选择包含原文件，完整迁移你的私人书房。</p></section>
    <div className="settings-foot"><button onClick={() => { setPrefs(savePrefs(DEFAULT_PREFS)); setTip('已恢复默认阅读设置') }}>恢复默认设置</button><span>芸窗 · 一卷在手，心有所栖</span><small>v{__APP_VERSION__}</small></div>
    <div className="settings-live-tip" aria-live="polite">{tip}</div>
  </div>
}
