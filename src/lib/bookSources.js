// Device-local browsing preferences; never include cookies or reading data.
export const DEFAULT_BOOK_SOURCES = [
  { id: 'haodoo', name: '好读', url: 'https://haodoo.net/', description: '中文文学 · EPUB', mark: '读' },
  { id: 'kgbook', name: '苦瓜书盘', url: 'https://kgbook.com/', description: '简体书籍 · 多种格式', mark: '卷' },
  { id: 'shuge', name: '书格', url: 'https://www.shuge.org/', description: '古籍善本 · 高清 PDF', mark: '古' },
]

export function normalizeBookUrl(value) {
  const input = String(value || '').trim()
  if (!input || input.length > 4096 || /[\u0000-\u0020\u007f]/.test(input)) throw new Error('请输入有效的网址')
  let url
  try { url = new URL(/^[a-z][\w+.-]*:\/\//i.test(input) ? input : `https://${input}`) }
  catch { throw new Error('请输入有效的网址') }
  if (url.protocol !== 'https:') throw new Error('请使用 https:// 开头的书源网址')
  if (!url.hostname.includes('.') || url.username || url.password) throw new Error('请输入不含账号密码的完整网站地址')
  return url.href
}

export function cleanBookSource({ name, url, id } = {}) {
  const title = String(name || '').trim().slice(0, 40)
  if (!title) throw new Error('请填写书源名称')
  return { id: id || crypto.randomUUID(), name: title, url: normalizeBookUrl(url), description: '我的书源', mark: '藏' }
}

export function loadBookSources(storage = globalThis.localStorage) {
  try {
    const rows = JSON.parse(storage.getItem('reader.bookSources') || '[]')
    return Array.isArray(rows) ? rows.slice(0, 30).flatMap(row => {
      try { return [cleanBookSource(row)] } catch { return [] }
    }) : []
  } catch { return [] }
}

export function saveBookSources(rows, storage = globalThis.localStorage) {
  storage.setItem('reader.bookSources', JSON.stringify(rows.map(cleanBookSource).slice(0, 30)))
}

export function loadBookHistory(storage = globalThis.localStorage) {
  try {
    const rows = JSON.parse(storage.getItem('reader.bookHistory') || '[]')
    return Array.isArray(rows) ? rows.slice(0, 12).flatMap(row => {
      try { return [{ url: normalizeBookUrl(row.url), visitedAt: Number(row.visitedAt) || 0 }] } catch { return [] }
    }) : []
  } catch { return [] }
}

export function rememberBookPage(url, storage = globalThis.localStorage) {
  const normalized = normalizeBookUrl(url)
  const rows = [{ url: normalized, visitedAt: Date.now() }, ...loadBookHistory(storage).filter(row => row.url !== normalized)].slice(0, 12)
  storage.setItem('reader.bookHistory', JSON.stringify(rows))
  return rows
}

export function bookBrowserOptions(url, dark = false) {
  return {
    url: normalizeBookUrl(url), title: '寻书', toolbarType: 'navigation',
    toolbarColor: dark ? '#1b211d' : '#faf6ec', toolbarTextColor: dark ? '#e6e0d2' : '#285b47',
    backgroundColor: dark ? 'black' : 'white', showReloadButton: true, visibleTitle: true,
    isPresentAfterPageLoad: false, activeNativeNavigationForWebview: true,
    enabledSafeTopMargin: true, enabledSafeBottomMargin: true,
    persistWebViewData: true, useSharedDataStore: false,
    preventDeeplink: true, openBlankTargetInWebView: true,
    handleDownloads: true, ignoreUntrustedSSLError: false,
    // Remote pages receive no access to the reader's database or filesystem.
    allowWebViewJsVisibilityControl: false, allowScreenshotsFromWebPage: false,
  }
}
