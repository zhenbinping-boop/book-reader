import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, List, MoreVertical, Undo2 } from 'lucide-react'
import BookmarkButton from './BookmarkButton'

export function ReaderHeader({ visible, title, subtitle, status, onBack, histDepth, onHistoryBack, bookmarked, onBookmark, onMenu, children }) {
  return <header className={`reader-top ink-reader-header${visible ? '' : ' hidden'}`}>
    <button className="btn btn-sm header-back" onClick={onBack} aria-label="返回"><ArrowLeft size={22} strokeWidth={1.5} /><span className="sr-only">返回</span></button>
    {histDepth > 0 && <button className="btn btn-sm history-back" onClick={onHistoryBack} title="回到跳转前的位置（Alt+←）" aria-label="回到跳转前的位置"><Undo2 size={18} /><span className="sr-only">↩</span></button>}
    <div className="reader-title txt-head"><span className="book-heading">{title}</span>{subtitle && <><span className="txt-head-title">{subtitle}</span><span className="txt-head-sub">{status || subtitle}</span></>}</div>
    {children}
    <BookmarkButton on={bookmarked} onToggle={onBookmark} />
    <button className="btn btn-sm" onClick={onMenu} aria-label="显示设置" title="显示设置：常亮 / 沉浸"><MoreVertical size={23} strokeWidth={1.5} /></button>
  </header>
}

export function ReaderActions({ onPanel, onBookmarks, onAppearance, onFlow, flow, pdf = false, onPrevious, onNext, children }) {
  return <div className="ink-reader-actions">
    <button className="btn btn-sm reader-tool" onClick={onPanel} aria-label="阅读面板"><List size={23} strokeWidth={1.5} /><span>目录</span></button>
    <button className="btn btn-sm reader-tool" onClick={onBookmarks}><Bookmark size={23} strokeWidth={1.5} /><span>书签</span></button>
    <button className="btn btn-sm reader-tool" onClick={onAppearance} aria-label={pdf ? 'PDF 外观设置' : '外观设置'}><span className="font-glyph" aria-hidden="true">Aa</span><span>{pdf ? '外观' : '字号'}</span></button>
    <div className="reader-turner"><div className="turner-buttons"><button className="btn btn-sm scrub-btn" aria-label="上一页" title="上一页" onClick={onPrevious}><ChevronLeft size={20} strokeWidth={1.5} /></button><button className="btn btn-sm scrub-btn" aria-label="下一页" title="下一页" onClick={onNext}><ChevronRight size={20} strokeWidth={1.5} /></button></div>
      <button className="flow-control" onClick={onFlow} data-flow={flow} title={flow === 'scroll' ? '现在是竖向滚动，点一下改回翻页' : '现在是翻页，点一下改成竖向滚动'}>{pdf ? flow === 'scroll' ? '连续' : '单页' : flow === 'scroll' ? '滚动' : '翻页'}</button>
    </div>{children}
  </div>
}
