import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { READING_RANKS, READING_RULES, formatReadingTime } from '../lib/readingExperience'
import useReadingProfile from '../hooks/useReadingProfile'
import useBackClose from '../hooks/useBackClose'
import { InkDialog } from './InkUI'

export function ReadingIndicator() {
  const [status, setStatus] = useState(null)
  useEffect(() => {
    const update = event => setStatus(event.detail)
    window.addEventListener('reader:experience-status', update)
    return () => window.removeEventListener('reader:experience-status', update)
  }, [])
  if (!status) return null
  const labels = { reading: status.effectiveMs < READING_RULES.minimumMs ? '满 5 分钟计入经验' : '阅读经验积累中', paused: '经验计时暂停', idle: '计时已停 · 轻触正文继续', elsewhere: '等待另一窗口结束计时', error: '经验暂未保存 · 正在重试' }
  return <span className="reading-xp-status" data-state={status.state}>{labels[status.state]}</span>
}

export default function ReadingGrowth() {
  const { profile, loading, error } = useReadingProfile()
  const [open, setOpen] = useState(false)
  useBackClose(open, () => setOpen(false), 'reading-growth')
  return <section className="reading-growth" aria-label="读书功名">
    <button className="reading-growth-summary" onClick={() => setOpen(true)} disabled={loading || !!error}>
      <span className="reading-rank-seal" aria-hidden="true"><img src={import.meta.env.BASE_URL + `art/study/seal-${profile.rank.id}.webp`} alt="" width="28" height="32" style={{ objectFit: 'contain' }} /></span>
      <span className="reading-growth-main"><span className="reading-growth-heading">读书功名 <strong>{profile.rank.name}</strong></span><span className="reading-growth-copy">{error || (loading ? '正在读取…' : profile.next ? `距${profile.next.name}还需 ${formatReadingTime(profile.remainingXp * 60_000)}` : '金榜题名，学无止境')}</span></span>
      <span className="reading-growth-total"><b>{profile.xp.toLocaleString()} <small>经验</small></b><span>今日 {profile.todayXp} / 180</span></span><ChevronRight size={17} />
    </button>
    <div className="reading-growth-track" role="progressbar" aria-label={profile.next ? `晋升${profile.next.name}` : '已达状元'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(profile.progress * 100)}><i style={{ width: `${profile.progress * 100}%` }} /></div>
    {open && <InkDialog title="读书功名" onClose={() => setOpen(false)} className="reading-growth-dialog">
      <p className="reading-growth-intro">一分耕读，一分积累。当前为<strong>{profile.rank.name}</strong>，已获 {profile.xp.toLocaleString()} 点经验。</p>
      <div className="reading-growth-stats"><span>累计有效阅读<b>{formatReadingTime(profile.effectiveMs)}</b></span><span>今日经验<b>{profile.todayXp} / 180</b></span></div>
      <ol className="reading-rank-list">{READING_RANKS.map(rank => <li key={rank.id} data-unlocked={profile.xp >= rank.xp} aria-current={rank.id === profile.rank.id ? 'step' : undefined}><span>{rank.name}{rank.id === profile.rank.id && <small>当前</small>}</span><span>{rank.hours ? `${rank.hours.toLocaleString()} 小时 · ${rank.xp.toLocaleString()} 经验` : '启程'}</span></li>)}</ol>
      <div className="reading-growth-rules"><h3>积学有时，功不唐捐</h3><ul><li>每有效阅读 1 分钟积 1 点经验，不足一分钟保留，累计结算。</li><li>每次打开书籍后，有效阅读累计满 5 分钟，才计入本次全部时长；未满退出不计经验。</li><li>当日最多计入 3 小时，即 180 点经验。超过后仍可阅读，次日继续积累。</li><li>仅正文就绪且处于前台时计时。切后台、锁屏、打开设置或阅读面板时暂停。</li><li>超过 3 分钟无翻页、滚动或触控即暂停；继续操作正文即可恢复。移动鼠标不延长计时。</li><li>多个窗口只允许一个计时。打坐本身不加阅读经验；读书打坐进入正文后按相同规则累计。</li></ul><p>段位借用明清科举称谓作成长设计；探花、榜眼、状元在历史上是殿试名次。</p></div>
    </InkDialog>}
  </section>
}
