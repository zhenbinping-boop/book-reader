import { Leaf, Pause, ArrowRight, X } from 'lucide-react'
import { useFocus } from './FocusProvider'
import { useHashRoute } from '../hooks/useHashRoute'
import { remainingFocus, formatFocusClock } from '../lib/focusTimer'

export default function FocusDock() {
  const { state, now, error, run } = useFocus()
  const route = useHashRoute()
  if (route.name === 'focus' || (!state.session && !state.lastResult)) return null
  const { session, lastResult } = state
  return <div className={`focus-dock-shell ${route.name === 'read' ? 'in-reader' : ''}`}><a href="#/focus" className={`focus-dock ${route.name === 'read' ? 'in-reader' : ''}`} aria-label={session ? `返回打坐，剩余 ${formatFocusClock(remainingFocus(session, now))}` : '返回打坐，查看本次收功记录'}>
    {session?.status === 'paused' ? <Pause size={16} /> : <Leaf size={17} />}<span>{session ? session.phase === 'rest' ? '休憩' : session.status === 'paused' ? '已暂停' : '打坐中' : lastResult.phase === 'rest' ? '休息已结束' : '已收功'}</span>
    {session && <b>{formatFocusClock(remainingFocus(session, now))}</b>}{error && <span>保存待重试</span>}<ArrowRight size={15} />
  </a>{!session && <button className="focus-dock-dismiss" aria-label="收起收功提示" onClick={() => run({ type: 'dismiss' })}><X size={15} /></button>}</div>
}
