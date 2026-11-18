import { useMemo, useState } from 'react'
import { ChevronRight, Paintbrush } from 'lucide-react'
import useBackClose from '../hooks/useBackClose'
import useReadingProfile from '../hooks/useReadingProfile'
import { READING_RANKS, formatReadingTime } from '../lib/readingExperience'
import { HOUR_MS, SEAL_MATERIALS, STUDY_OBJECTS, loadStudyDecor, rankAchievementDays, saveStudyDecor, studyFocusHistory, studyMonths } from '../lib/studyProgress'
import { useFocus } from './FocusProvider'
import { InkDialog } from './InkUI'

const art = file => import.meta.env.BASE_URL + 'art/study/' + file + '.webp'
const sealArt = id => art('seal-' + id)
const EMPTY_FOCUS = { records: [], ready: true, historyError: '' }

function useStudyFocus() {
  const { records, ready, historyError } = useFocus() || EMPTY_FOCUS
  const rows = useMemo(() => studyFocusHistory(records), [records])
  const elapsedMs = useMemo(() => rows.reduce((sum, row) => sum + row.elapsedMs, 0), [rows])
  return { rows, elapsedMs, ready, error: historyError }
}

export function StudyEntry({ onEnter }) {
  const { profile, loading, error } = useReadingProfile()
  const focus = useStudyFocus()
  const [decor, setDecor] = useState(loadStudyDecor)
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  useBackClose(open, close, 'shelf-seals')
  const subtitle = loading || !focus.ready ? '正在读取行迹…' :
    error || focus.error ? '查看书斋与行迹' : `${profile.rank.name} · 累计专注 ${formatReadingTime(focus.elapsedMs)}`
  return <section className="study-entries" aria-label="书斋与功名">
    <a className="study-entry" href="#/study" onClick={onEnter}>
      <img className="study-entry-art" src={art('study-thumb')} alt="" width="100" height="100" />
      <span className="study-entry-text"><strong>我的书斋</strong><span>{subtitle}</span></span>
      <ChevronRight size={16} aria-hidden="true" />
    </a>
    <button type="button" className="shelf-seal-entry" onClick={() => setOpen(true)} disabled={loading || !!error}>
      <img src={sealArt(profile.rank.id)} alt="" width="34" height="38" />
      <span className="study-entry-text"><strong>功名印谱</strong><span>{profile.rank.name}</span></span>
    </button>
    {open && <SealCollectionDialog profile={profile} decor={decor} onChange={setDecor} onClose={close} />}
  </section>
}

function equippedSeal(profile, decor) {
  return READING_RANKS.find(rank => rank.id === decor.seal && profile.xp >= rank.xp) || profile.rank
}

function SealCollectionDialog({ profile, decor, onChange, onClose }) {
  const [error, setError] = useState('')
  const onEquip = seal => {
    try {
      onChange(saveStudyDecor({ ...decor, seal }))
      setError('')
    } catch { setError('暂时无法保存展出设置，请重试。') }
  }
  return <InkDialog title="功名印谱" className="private-study-dialog private-study-seals" onClose={onClose}>
    <SealCollection profile={profile} equipped={equippedSeal(profile, decor)} onEquip={onEquip} />
    {error && <p className="modal-error" role="alert">{error}</p>}
  </InkDialog>
}

function SealCollection({ profile, equipped, onEquip }) {
  const [selectedId, setSelectedId] = useState(equipped.id)
  const index = READING_RANKS.findIndex(rank => rank.id === selectedId)
  const selected = READING_RANKS[index]
  const unlocked = profile.xp >= selected.xp
  const dates = useMemo(() => rankAchievementDays(profile.days), [profile.days])
  return <>
    <p className="study-dialog-copy">当前功名 {profile.rank.name} · {profile.xp.toLocaleString()} 经验
      {profile.next && <span> · 距{profile.next.name} {formatReadingTime(profile.remainingXp * 60_000)}</span>}
    </p>
    <ul className="study-seals">
      {READING_RANKS.map(rank => <li key={rank.id}>
        <button type="button" aria-pressed={rank.id === selectedId} onClick={() => setSelectedId(rank.id)} className="study-seal-cell">
          <img src={sealArt(rank.id)} alt="" width="48" height="52" />
          <span><strong>{rank.name}</strong><small>{profile.xp < rank.xp ? '未获得' : equipped.id === rank.id ? '展出中' : '已获得'}</small></span>
        </button>
      </li>)}
    </ul>
    <div className="study-seal-detail" aria-live="polite">
      <h3>{selected.name} · {SEAL_MATERIALS[index]}</h3>
      <p>{selected.hours ? `计入经验的阅读时间 ${selected.hours.toLocaleString()} 小时` : '初入书斋时获得'}</p>
      {unlocked && dates[selected.id] && <p>达成日期 <time dateTime={dates[selected.id]}>{dates[selected.id]}</time></p>}
      {unlocked && equipped.id !== selectedId && <button type="button" className="btn btn-primary" onClick={() => onEquip(selectedId)}>设为展示</button>}
    </div>
  </>
}

function StudyDecorControls({ elapsedMs, draft, setDraft, onSave }) {
  return <>
    <p className="study-dialog-copy">累计专注 {formatReadingTime(elapsedMs)} · 可预览已获得的物件</p>
    <ul className="study-objects">
      {STUDY_OBJECTS.map(item => {
        const remaining = Math.max(0, item.hours * HOUR_MS - elapsedMs)
        const needed = Math.ceil(remaining / 60_000) * 60_000
        return <li key={item.id}>
          <img src={art(item.id === 'moon' ? 'study-moonlight' : 'study-' + item.id)} alt="" width="52" height="55" />
          <div><strong>{item.name}</strong><small>{remaining ? `还差 ${formatReadingTime(needed)}` : item.description}</small></div>
          <button type="button" className="btn" disabled={remaining > 0} aria-pressed={draft[item.id]}
            aria-label={`${draft[item.id] ? '收起' : '预览'}${item.name}`}
            onClick={() => setDraft(current => ({ ...current, [item.id]: !current[item.id] }))}>
            {remaining ? '未解锁' : draft[item.id] ? '收起' : '预览'}
          </button>
        </li>
      })}
    </ul>
    {draft.scroll && elapsedMs >= 50 * HOUR_MS && <label className="study-caption-input">
      <span>挂轴题字</span><input value={draft.caption} maxLength={24} placeholder="静以修身"
        onChange={event => {
          const caption = [...event.target.value].slice(0, 12).join('')
          setDraft(current => ({ ...current, caption }))
        }} />
    </label>}
    <button type="button" className="btn btn-primary study-save" onClick={onSave}>保存布置</button>
  </>
}

function StudyHistory({ readingDays, rows }) {
  const periods = useMemo(() => studyMonths(readingDays, rows), [readingDays, rows])
  const [selected, setSelected] = useState(periods[0].month)
  const period = periods.find(item => item.month === selected) || periods[0]
  return <>
    <label className="study-month-label">月度回顾 <select value={period.month} onChange={event => setSelected(event.target.value)}>
      {periods.map(item => <option key={item.month} value={item.month}>{item.month.replace('-', ' 年 ')} 月</option>)}
    </select></label>
    <dl className="study-totals">
      <div><dt>有效阅读</dt><dd>{formatReadingTime(period.readingMs)}</dd></div>
      <div><dt>累计专注</dt><dd>{formatReadingTime(period.focusMs)}</dd></div>
    </dl>
    {period.rows.length ? <ol className="study-history-list">
      {period.rows.map(row => <li key={row.id}>
        <span><strong>{row.intent || row.bookTitle || (row.mode === 'reading' ? '读书打坐' : '自由专注')}</strong>
          <small>{new Date(row.endedAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}</small></span>
        <span>{row.elapsedMs < 60_000 ? '不足 1 分钟' : formatReadingTime(row.elapsedMs)}</span>
      </li>)}
    </ol> : <p className="study-dialog-copy">这个月还没有专注行迹。</p>}
  </>
}

export default function PrivateStudy() {
  const { profile, loading, error } = useReadingProfile()
  const focus = useStudyFocus()
  const [decor, setDecor] = useState(loadStudyDecor)
  const [draft, setDraft] = useState(decor)
  const [panel, setPanel] = useState(null)
  const [saveError, setSaveError] = useState('')
  const close = () => { setPanel(null); setSaveError('') }
  useBackClose(!!panel, close, 'private-study')

  const equipped = equippedSeal(profile, decor)
  const scene = panel === 'decor' ? draft : decor
  const has = id => scene[id] && focus.elapsedMs >= STUDY_OBJECTS.find(item => item.id === id).hours * HOUR_MS
  const moon = has('moon'), lamp = has('lamp'), scroll = has('scroll')
  const ready = !loading && focus.ready
  const show = name => {
    setSaveError('')
    if (name === 'decor') setDraft(decor)
    setPanel(name)
  }
  const persist = (next, done) => {
    try {
      setDecor(saveStudyDecor(next))
      setSaveError('')
      done?.()
    } catch { setSaveError('暂时无法保存布置，请重试。') }
  }

  return <div className="private-study">
    <div className="study-scene" data-light={moon ? 'moon' : 'day'} data-preview={panel === 'decor' || undefined}>
      <img className="study-scene-bg" src={art(moon ? 'study-moonlight' : 'study-daylight')} width="1122" height="1402"
        alt={moon ? '月光落进木窗，窗外松山层叠' : '阳光照进木窗，书案对着松山'} fetchPriority="high" />
      {lamp && <img className="study-lamp" src={art('study-lamp')} alt="案头灯" />}
      {scroll && <div className="study-scroll">
        <img src={art('study-scroll')} alt="" />
        <span>{scene.caption.trim() || '静以修身'}</span>
      </div>}
      <button type="button" className="btn study-decor-button" onClick={() => show('decor')} disabled={!focus.ready || !!focus.error}>
        <Paintbrush size={16} aria-hidden="true" />布置
      </button>
    </div>
    <dl className="study-totals" aria-label="累计时长">
      <div><dt>累计有效阅读</dt><dd>{loading ? '…' : error ? '暂不可用' : formatReadingTime(profile.effectiveMs)}</dd></div>
      <div><dt>累计专注</dt><dd>{!focus.ready ? '…' : focus.error ? '暂不可用' : formatReadingTime(focus.elapsedMs)}</dd></div>
    </dl>
    <div className="study-links">
      <button type="button" className="study-display-seal" onClick={() => show('seals')} disabled={loading || !!error}>
        <img src={sealArt(equipped.id)} alt="" width="34" height="38" />
        <span>功名印谱 <small>展出 · {equipped.name}</small></span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button type="button" onClick={() => show('history')} disabled={!ready || !!error || !!focus.error}>专注行迹 <ChevronRight size={18} aria-hidden="true" /></button>
    </div>
    {(error || focus.error) && <p className="study-dialog-copy" role="status">{error || '专注行迹暂时无法读取'}</p>}
    {panel === 'seals' && <SealCollectionDialog profile={profile} decor={decor} onChange={setDecor} onClose={close} />}
    {panel && panel !== 'seals' && <InkDialog title={{ decor: '布置书斋', history: '专注行迹' }[panel]}
      className={`private-study-dialog private-study-${panel}`} onClose={close}>
      {panel === 'decor' && <StudyDecorControls elapsedMs={focus.elapsedMs} draft={draft} setDraft={setDraft}
        onSave={() => persist(draft, close)} />}
      {panel === 'history' && <StudyHistory readingDays={profile.days} rows={focus.rows} />}
      {saveError && <p className="modal-error" role="alert">{saveError}</p>}
    </InkDialog>}
  </div>
}
