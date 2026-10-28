import { BookOpen, Compass, NotebookPen, Settings2, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import useDialogFocus from '../hooks/useDialogFocus'

export function Seal({ children = '芸窗', className = '' }) {
  const characters = typeof children === 'string' ? [...children] : [children]
  return <span className={`ink-seal ${className}`} aria-hidden="true">{characters.map((character, index) => <span className="ink-seal-char" key={index}>{character}</span>)}</span>
}

export function SectionTitle({ children, aside }) {
  return <div className="ink-section-heading"><span className="section-diamond" aria-hidden="true">◇</span><h2>{children}</h2><i />{aside}</div>
}

export function IconButton({ label, children, ...props }) {
  return <button type="button" className="icon-button" aria-label={label} title={label} {...props}>{children}</button>
}

export function AppNavigation({ page }) {
  return <nav className="ink-navigation" aria-label="主导航">
    {[['shelf', '书架', BookOpen, '#/'], ['discover', '寻书', Compass, '#/discover'], ['notes', '笔记', NotebookPen, '#/notes'], ['settings', '设置', Settings2, '#/settings']]
      .map(([id, title, Icon, href]) => <a key={id} href={href} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined}>
        <Icon size={22} strokeWidth={1.6} /><span>{title}</span>
      </a>)}
  </nav>
}

export function InkDialog({ title, label = title, onClose, children, className = '' }) {
  const reduce = useReducedMotion()
  const ref = useDialogFocus(onClose)
  return <><div className="modal-mask" onClick={onClose} />
    <motion.section ref={ref} className={`ink-dialog ${className}`} role="dialog" aria-modal="true" aria-label={label}
      initial={{ opacity: 0, y: reduce ? 0 : 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .22 }}>
      <header><h2>{title}</h2><IconButton label="关闭" onClick={onClose}><X size={20} /></IconButton></header>
      {children}
    </motion.section></>
}
