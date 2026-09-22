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

const DEFAULTS = {
  /** null 表示「跟随系统」，与 CSS 的 prefers-color-scheme 默认行为一致 */
  readerTheme: null,
  /** 字号 px，档位见 DESIGN.md §4.2 */
  readerSize: 18,
  /** 行高倍率 */
  readerLeading: 1.7,
  /** 段间距 em */
  readerParaGap: 0.5,
  /** 页边距 px */
  readerPad: 24,
}

/** 系统当前的亮暗倾向，仅用作首次默认值，不作为持续约束（DESIGN.md §3.1） */
export function systemReaderTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'paper'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'paper'
}

export function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(KEY)
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : null) }
  } catch {
    // 隐私模式 / 存储被禁时读不到，用默认值即可，不影响阅读
    return { ...DEFAULTS }
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
