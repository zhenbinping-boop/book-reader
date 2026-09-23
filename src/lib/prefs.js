/**
 * 设备级外观偏好（阅读主题 / 字号 / 行高 / 段距 / 页边距）。
 *
 * 为什么不用 IndexedDB：这些偏好描述的是「这台设备上怎么显示」，
 * 不是书籍数据，不需要跨设备同步，也不需要和 blob 一起管理。
 * localStorage 语义更准确，还能省掉一次异步读取。
 * 将来若要做云同步，只有书级数据（进度 / 笔记）需要走同步层。
 *
 * 规范见 DESIGN.md §3.4 与 §4.2。
 */

const KEY = 'book-reader:prefs'

/** 四套阅读主题，顺序即切换顺序 */
export const READER_THEMES = ['paper', 'sepia', 'night', 'oled']

export const THEME_LABELS = {
  paper: '暖纸',
  sepia: '护眼',
  night: '夜间',
  oled: '纯黑',
}

/**
 * 正文排版的四张档位表（DESIGN.md §4.2）。
 *
 * 为什么必须是数组、而不是滑杆的 min/max：**滑杆是这些值的唯一入口**，
 * 值只有永远落在档位上，「滑杆 / 双指缩放 / 手改 localStorage / 恢复默认」
 * 四条路径才不会各说各话（滑到 19、捏一下跳回 20 这种）。
 */
export const READER_SIZES = [15, 16, 18, 20, 22, 24, 28]
export const READER_LEADINGS = [1.5, 1.7, 1.9]
export const READER_PARA_GAPS = [0, 0.5, 1]
export const READER_PADS = [16, 24, 40]

/** 把任意值吸附到最近的档位。持平取表里靠前的那个 */
export function snapTo(ladder, v) {
  let best = ladder[0]
  let dist = Math.abs(v - best)
  for (const s of ladder) {
    const d = Math.abs(v - s)
    if (d < dist) {
      best = s
      dist = d
    }
  }
  return best
}

/** 字号吸附。双指缩放给的是连续值，必须收回来 */
export const snapReaderSize = (size) => snapTo(READER_SIZES, size)

/** 按方向走一档。返回 null 表示已经在两端 */
export function stepReaderSize(size, dir) {
  const i = READER_SIZES.indexOf(snapReaderSize(size))
  const j = Math.min(READER_SIZES.length - 1, Math.max(0, i + dir))
  return j === i ? null : READER_SIZES[j]
}

/** 出厂默认值。外观面板的「恢复默认」与首次加载都用它。四项都必须落在档位上 */
export const DEFAULT_PREFS = {
  /** null 表示「跟随系统」，与 CSS 的 prefers-color-scheme 默认行为一致 */
  readerTheme: null,
  /** 字号 px，只能取 READER_SIZES 里的档位 */
  readerSize: 18,
  /** 行高倍率，READER_LEADINGS */
  readerLeading: 1.7,
  /** 段间距 em，READER_PARA_GAPS */
  readerParaGap: 0.5,
  /** 页边距 px，READER_PADS */
  readerPad: 24,
  /**
   * 阅读时常亮。这个偏好要持久化 —— 想常亮的人每次都想常亮，
   * 不该每进一本书重新点一次。申请成败由浏览器决定，失败静默降级。
   */
  readerKeepAwake: false,
}

const DEFAULTS = DEFAULT_PREFS

/** 系统当前的亮暗倾向，仅用作首次默认值，不作为持续约束（DESIGN.md §3.1） */
export function systemReaderTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'paper'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'paper'
}

export function loadPrefs() {
  let raw = null
  try {
    const s = window.localStorage.getItem(KEY)
    raw = s ? JSON.parse(s) : null
  } catch {
    // 隐私模式 / 存储被禁 / JSON 坏了 —— 用默认值即可，不影响阅读
    raw = null
  }
  const p = { ...DEFAULTS, ...(raw || null) }
  // 读回来先吸附到档位。早期版本的滑杆是连续区间，用户存过 1.6 / 50 这种值，
  // 不吸附的话滑杆的 indexOf 取不到下标、双指步进也会乱跳。
  return {
    ...p,
    readerSize: snapTo(READER_SIZES, p.readerSize),
    readerLeading: snapTo(READER_LEADINGS, p.readerLeading),
    readerParaGap: snapTo(READER_PARA_GAPS, p.readerParaGap),
    readerPad: snapTo(READER_PADS, p.readerPad),
  }
}

export function savePrefs(patch) {
  const next = { ...loadPrefs(), ...patch }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* 写不进去就只在本次会话生效，不打断用户 */
  }
  return next
}

/** 用户实际生效的主题：显式选择优先，否则跟随系统 */
export function resolveTheme(prefs) {
  return prefs.readerTheme || systemReaderTheme()
}

/** 循环切到下一个主题，返回新主题名 */
export function nextTheme(current) {
  const i = READER_THEMES.indexOf(current)
  return READER_THEMES[(i + 1) % READER_THEMES.length]
}
