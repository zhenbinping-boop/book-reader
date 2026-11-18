import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, Feather, History, Pause, Play, RotateCcw, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react'
import { useFocus } from './FocusProvider'
import { InkDialog } from './InkUI'
import useBackClose from '../hooks/useBackClose'
import useFocusTransition from '../hooks/useFocusTransition'
import { goRead } from '../hooks/useHashRoute'
import { elapsedFocus, remainingFocus, formatFocusClock, formatFocusDuration, todayFocus } from '../lib/focusTimer'
import FocusActor from './FocusActor'

const asset = name => import.meta.env.BASE_URL + 'art/focus/' + name + '.webp'
const atlas = asset('wuxia-sit-sequence-32')

export function FocusScene({ pose, camera, motion, resting, active, onReveal, onArtLoad, onArtError }) {
  const scene = useRef(null), shadow = useRef(null)
  useEffect(() => motion.subscribe(state => {
    scene.current?.style.setProperty('--camera-scale', String(1 + state.camera * .17))
    shadow.current?.style.setProperty('--shadow-spread', String(1 + state.pose * .7))
  }), [motion])
  return <div className={'focus-scene ' + (active ? 'is-active ' : '') + (resting ? 'is-resting' : '')} ref={scene} style={{ '--camera-scale': 1 + camera * .17 }}>
    <div className="focus-camera">
      <img className="focus-landscape" src={asset('pine-vista-portrait')} alt="竖屏青绿水墨远山、松枝和临崖石台" fetchPriority="high" onLoad={() => onArtLoad(1)} onError={onArtError} />
      <div className="focus-mist" aria-hidden="true" />
      <div ref={shadow} className="focus-actor-shadow" aria-hidden="true" style={{ '--shadow-spread': 1 + pose * .7 }} />
      <FocusActor motion={motion} onReady={onArtLoad} onError={onArtError} />
    </div>
    <img className="focus-atlas-source" src={atlas} alt="" aria-hidden="true" onError={onArtError} />
    <div className="focus-scene-shade" aria-hidden="true" />
    <button className="focus-scene-hit" aria-label="轻点山水，显示打坐操作" onClick={onReveal} />
  </div>
}

export default function FocusPage({ books, onPhaseChange }) {
  const { state, records, now, ready, error, run, prepareChime } = useFocus()
  const { session, lastResult } = state
  const [draft, setDraft] = useState(state.settings)
  const [bookId, setBookId] = useState('')
  const [ending, setEnding] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [validation, setValidation] = useState('')
  const [controlsOpen, setControlsOpen] = useState(false)
  const [artLoaded, setArtLoaded] = useState(0)
  const [artError, setArtError] = useState(false)
  const [interaction, setInteraction] = useState(0)
  const controlsRef = useRef(null)
  const view = useFocusTransition(!!session, ready)
  const idle = view.phase === 'idle'
  const busyTransition = view.phase === 'entering' || view.phase === 'leaving'
  const running = session?.status === 'running'
  const resting = session?.phase === 'rest'
  const controlsVisible = !!session && !busyTransition && (controlsOpen || !!error)
  useBackClose(ending, () => setEnding(false), 'focus-end')
  useBackClose(historyOpen, () => setHistoryOpen(false), 'focus-history')
  useBackClose(settingsOpen, () => setSettingsOpen(false), 'focus-settings')
  useEffect(() => { setDraft(state.settings) }, [state.settings])
  useEffect(() => { if (!session) { setEnding(false); setControlsOpen(false) } }, [session?.id])
  useEffect(() => { if (session?.status === 'paused') setControlsOpen(true) }, [session?.status])
  useEffect(() => { onPhaseChange?.(view.phase) }, [view.phase, onPhaseChange])
  useEffect(() => {
    if (!controlsVisible || !running || ending || settingsOpen || historyOpen) return
    const timeout = setTimeout(() => {
      if (!controlsRef.current?.querySelector(':focus-visible')) setControlsOpen(false)
    }, 5000)
    return () => clearTimeout(timeout)
  }, [controlsVisible, running, ending, settingsOpen, historyOpen, interaction])

  const available = useMemo(() => books.filter(book => !book.missingFile), [books])
  const recent = useMemo(() => available.reduce((latest, book) => !latest || (book.lastReadAt || 0) > (latest.lastReadAt || 0) ? book : latest, null), [available])
  const chosenId = bookId || String(recent?.id || '')
  const chosen = useMemo(() => available.find(book => String(book.id) === chosenId), [available, chosenId])
  const stats = useMemo(() => todayFocus(records, now), [records, now])
  const remaining = session ? remainingFocus(session, now) : Number(draft.minutes || 0) * 60_000
  const update = patch => { setDraft(value => ({ ...value, ...patch })); setValidation('') }
  const reveal = () => { if (session && !busyTransition) { setControlsOpen(value => !value); setInteraction(value => value + 1) } }
  const act = async action => {
    if (pending) return false
    setPending(true)
    try { return await run(action) } finally { setPending(false) }
  }
  const start = async (phase = 'focus') => {
    if (phase === 'focus' && draft.mode === 'reading' && !chosen) { setValidation('先去书架添一本书，再来读书打坐。'); setSettingsOpen(true); return }
    if (draft.chime) prepareChime()
    if (await act({ type: 'start', settings: draft, phase, book: chosen })) {
      setSettingsOpen(false); setHistoryOpen(false); setControlsOpen(false)
    }
  }
  const toggleSound = async () => {
    const chime = !draft.chime
    if (chime) prepareChime()
    if (!session) { update({ chime }); return }
    if (await act({ type: 'settings', patch: { chime } })) update({ chime })
  }
  const artReady = artLoaded === 3
  const message = validation || (error ? '保存遇到问题：' + error : '')

  return <div className="focus-page focus-immersive" data-phase={view.phase} data-reduced-motion={view.reduced ? 'true' : 'false'}>
    <FocusScene pose={view.pose} camera={view.camera} motion={view.motion} active={running && view.phase === 'active'} resting={resting} onReveal={reveal} onArtLoad={bit => setArtLoaded(value => value | bit)} onArtError={() => setArtError(true)} />
    <header className="focus-float-header" inert={!idle || undefined} aria-hidden={!idle || undefined}>
      <a className="focus-return" href="#/" aria-label="返回书架"><ArrowLeft size={17} /><span>芸窗</span></a>
      <div className="focus-header-actions"><button className="focus-icon" aria-label={draft.chime ? '关闭到时轻铃' : '开启到时轻铃'} aria-pressed={draft.chime} onClick={toggleSound}>{draft.chime ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button className="focus-icon focus-history-toggle" aria-label="查看打坐行迹" onClick={() => setHistoryOpen(true)}><History size={18} /><span>行迹</span></button></div>
    </header>
    <div className="focus-idle-ui" inert={!idle || undefined} aria-hidden={!idle || undefined}>
      <div className="focus-vista-title"><span>一方静处 · 松下</span><h1>松下听风</h1><p>暂别喧嚣，望一程山水。</p></div>
      <section className="focus-landing" aria-label="开始一程打坐">
        {lastResult && <div className="focus-result" role="status"><Check size={15} /><div><strong>{lastResult.phase === 'rest' ? '休息已结束' : lastResult.outcome === 'completed' ? '这一程，已收功' : '这一程，也算数'}</strong><span>{lastResult.phase === 'focus' ? ' · ' + formatFocusDuration(lastResult.elapsedMs) : ''}</span></div>{lastResult.phase === 'focus' && <button onClick={() => start('rest')} disabled={pending}>歇 {draft.restMinutes} 分钟</button>}</div>}
        <div className="focus-presets" aria-label="选择专注时长">{[25, 45, 60].map(minutes => <button key={minutes} aria-pressed={Number(draft.minutes) === minutes} onClick={() => update({ minutes })}>{minutes}<span> 分钟</span></button>)}<button aria-label="自定义打坐设定" onClick={() => setSettingsOpen(true)}>{[25, 45, 60].includes(Number(draft.minutes)) ? '自定' : draft.minutes + ' 分钟'}</button></div>
        <div className="focus-launch"><button className="focus-settings-toggle" aria-label="专注设定" onClick={() => setSettingsOpen(true)}><SlidersHorizontal size={19} /></button><button className="btn focus-start" onClick={() => start()} disabled={pending || !ready || !idle || !artReady}><Feather size={17} />{!artReady ? '正在铺开山水…' : '入座，开始打坐'}</button></div>
        <p className="focus-launch-note">{draft.intent || (draft.mode === 'reading' ? chosen ? '带《' + chosen.title + '》入座' : '读书打坐 · 先添一卷书' : '自由专注 · 风过松间，心归一处')}</p>
      </section>
    </div>
    <button className="focus-clock-chip" inert={!session || busyTransition || undefined} aria-hidden={!session || undefined} aria-label={'显示打坐操作，剩余 ' + formatFocusClock(remaining)} onClick={() => { setControlsOpen(true); setInteraction(value => value + 1) }} onFocus={() => { setControlsOpen(true); setInteraction(value => value + 1) }}>
      <i className={running ? 'running' : ''} /><span className="focus-clock" role="timer" aria-label={'剩余 ' + formatFocusClock(remaining)} aria-live="off">{formatFocusClock(remaining)}</span>{!running && session && <Pause size={11} />}
    </button>
    <p className="focus-transition-caption" role="status">{view.phase === 'entering' ? '拂去尘念，缓缓入座。' : view.phase === 'leaving' ? '收功，山水仍在。' : ''}</p>
    {session && <section ref={controlsRef} className={'focus-active-controls ' + (controlsVisible ? 'is-visible' : '')} inert={!controlsVisible || undefined} aria-hidden={!controlsVisible || undefined} aria-label="打坐操作" onPointerDown={() => setInteraction(value => value + 1)} onFocus={() => setInteraction(value => value + 1)} onBlur={() => setInteraction(value => value + 1)}>
      <div className="focus-control-heading"><span>{resting ? '歇一会儿' : running ? '静坐中' : '已暂停'}</span><button className="focus-hide-controls" onClick={() => setControlsOpen(false)}>收起</button></div>
      <p className="focus-current-task">{resting ? '慢慢来，远眺片刻。' : session.intent || (session.bookTitle ? '读《' + session.bookTitle + '》' : '此刻，只专心眼前的事。')}</p>
      <div className="focus-actions"><button className="btn" onClick={() => { if (draft.chime) prepareChime(); act({ type: running ? 'pause' : 'resume', sessionId: session.id }) }} disabled={pending}>{running ? <Pause size={16} /> : <Play size={16} />}{running ? '稍作停留' : '继续打坐'}</button><button className="btn" onClick={() => setEnding(true)} disabled={pending}>{resting ? '结束休息' : '提前收功'}</button></div>
      {session.mode === 'reading' && session.bookId && <button className="focus-open-book" onClick={() => goRead(session.bookId)}><BookOpen size={16} /><span>去读《{session.bookTitle}》</span><ArrowRight size={16} /></button>}
      <p className="focus-gentle-note">轻点山水收起操作 · 切后台与锁屏继续计时</p>
    </section>}
    {message && !settingsOpen && !ending && <div className="focus-error focus-floating-error" role="alert">{message}{error && <button onClick={() => run({ type: 'tick' })}>重试</button>}</div>}
    {artError && <p className="focus-error focus-floating-error" role="alert">画面暂未载入，请重新打开本页。已有计时仍会保留。</p>}
    <span className="sr-only" role="status">{session && view.phase === 'active' ? running ? '界面已收起，轻点山水或计时提示可显示操作' : '计时已暂停' : ''}</span>
    {settingsOpen && <InkDialog title="为这一程留白" label="打坐设定" onClose={() => setSettingsOpen(false)} className="focus-settings-dialog"><div className="focus-settings-form">
      <label>专注时长 · 分钟<input type="number" inputMode="numeric" aria-label="自定义专注分钟" min="1" max="180" step="1" value={draft.minutes} onChange={e => update({ minutes: e.target.value })} /></label>
      <div className="focus-modes" aria-label="选择打坐方式"><button aria-pressed={draft.mode === 'free'} onClick={() => update({ mode: 'free' })}><Feather size={17} />自由专注</button><button aria-pressed={draft.mode === 'reading'} onClick={() => update({ mode: 'reading' })}><BookOpen size={17} />读书打坐</button></div>
      {draft.mode === 'reading' && <label className="focus-book-picker">带一卷书入座<select aria-label="选择打坐书籍" value={chosenId} onChange={e => setBookId(e.target.value)}>{!available.length && <option value="">书架还没有可读的书</option>}{available.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>}
      <label className="focus-intent">此刻，想专心做什么？<input aria-label="本次专注事项" placeholder="可不填，静静坐一会儿也好…" maxLength={60} value={draft.intent} onChange={e => update({ intent: e.target.value })} /></label>
      <label>一程之后，歇<select aria-label="休息分钟" value={draft.restMinutes} onChange={e => update({ restMinutes: Number(e.target.value) })}>{[5, 10, 15].map(n => <option key={n} value={n}>{n} 分钟</option>)}</select></label>
      <p className="focus-capability-note">到时轻铃可在画面右上角开启，仅在芸窗前台播放。锁屏后返回按实际时间接回进度。</p>
      {message && <div className="focus-error" role="alert">{message}</div>}
      <div className="focus-settings-actions"><button className="btn" onClick={() => setSettingsOpen(false)}>完成设定</button><button className="btn btn-primary" disabled={pending || !ready || !artReady} onClick={() => start()}><Feather size={16} />开始打坐</button></div>
    </div></InkDialog>}
    {historyOpen && <InkDialog title="山间行迹" label="打坐行迹" onClose={() => setHistoryOpen(false)} className="focus-history-dialog"><div className="focus-stats"><div><strong>{formatFocusDuration(stats.elapsedMs)}</strong><span>今日专注</span></div><div><strong>{stats.completed}<small> 程</small></strong><span>今日完成</span></div></div><div className="focus-history">{records.length ? <><ol>{records.slice(0, 30).map(row => <li key={row.id}><span className={'focus-history-dot ' + row.outcome} /><div><strong>{row.intent || (row.bookTitle ? '读《' + row.bookTitle + '》' : '自由专注')}</strong><time dateTime={new Date(row.endedAt).toISOString()}>{new Date(row.endedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {row.outcome === 'completed' ? '已完成' : '提前收功'}</time></div><span>{formatFocusDuration(row.elapsedMs)}</span></li>)}</ol>{records.length > 30 && <p>此处显示最近 30 程，全部记录随备份保留。</p>}</> : <p className="focus-no-history">还没有行迹。从这一程开始，慢慢积累。</p>}<p className="focus-history-note">专注记录随整库备份保存；阅读进度与专注时长分开记录。</p></div></InkDialog>}
    {ending && session && <InkDialog title={resting ? '结束这段休息？' : '现在收功？'} onClose={() => setEnding(false)}><div className="focus-end-dialog"><p>{resting ? '休息随时可以结束，再开始由你决定。' : '已经专注 ' + formatFocusDuration(elapsedFocus(session, now)) + '。提前结束也会保存实际时间。'}</p>{error && <p className="focus-error" role="alert">暂未收功：{error}。可以重试保存。</p>}<div><button className="btn" onClick={() => setEnding(false)}><RotateCcw size={15} />再坐一会儿</button><button className="btn btn-primary" disabled={pending} onClick={async () => { if (await act({ type: 'end', sessionId: session.id })) setEnding(false) }}>{resting ? '结束休息' : '收功并保存'}</button></div></div></InkDialog>}
  </div>
}
