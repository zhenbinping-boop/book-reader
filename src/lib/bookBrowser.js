import { Capacitor } from '@capacitor/core'
import { db } from '../db'
import { importFile } from './importer'
import { bookBrowserOptions, normalizeBookUrl, rememberBookPage } from './bookSources'
import { createDownloadInbox, createImportQueue, MAX_BOOK_DOWNLOAD_BYTES } from './bookDownloads'

export const enqueueBookImport = createImportQueue(importFile)
let browser, setup, opening, activeId
const pages = new Map()
const emitError = error => window.dispatchEvent(new CustomEvent('reader:browser-error', { detail: error?.message || '找书功能暂时不可用' }))

export function bookBrowserAvailability() {
  if (!Capacitor.isNativePlatform()) return 'web'
  return Capacitor.isPluginAvailable('CapgoInAppBrowser') ? 'available' : 'update'
}

export const bookDownloadInbox = createDownloadInbox({
  list: () => db.downloads.toArray(), save: row => db.downloads.put(row), remove: id => db.downloads.delete(id),
  importFile: enqueueBookImport,
  async loadFile(row) {
    const { Filesystem } = await import('@capacitor/filesystem')
    let stat
    try { stat = await Filesystem.stat({ path: row.path }) }
    catch { throw new Error('下载缓存已被清理，请回到书源重新下载') }
    if (stat.size > MAX_BOOK_DOWNLOAD_BYTES) throw new Error('这本书超过 200 MB，请通过本地文件导入')
    const fileUrl = `file://${row.path.split('/').map(encodeURIComponent).join('/')}`
    const response = await fetch(Capacitor.convertFileSrc(fileUrl))
    if (!response.ok) throw new Error('读取下载文件失败，请重新下载')
    const blob = await response.blob()
    if (blob.size !== stat.size) throw new Error('下载文件读取不完整，请重试入库')
    return blob
  },
  async cleanup(row) {
    const { Filesystem } = await import('@capacitor/filesystem')
    await Filesystem.deleteFile({ path: row.path })
    const parent = row.path.slice(0, row.path.lastIndexOf('/'))
    if (/\/(?:inappbrowser-downloads|InAppBrowserDownloads)\/[\da-f-]{36}$/i.test(parent)) {
      try { await Filesystem.rmdir({ path: parent }) } catch { /* Non-empty directories remain untouched. */ }
    }
  },
  async onImported(row) {
    window.dispatchEvent(new CustomEvent('reader:book-imported', { detail: row }))
    const otherDownloads = bookDownloadInbox.getSnapshot().some(item => item.browserId === row.browserId &&
      ['downloading', 'downloaded', 'importing'].includes(item.status))
    if (row.browserId && row.browserId === activeId && !otherDownloads) {
      try { await browser.close({ id: activeId }) } catch { /* The user may already have closed it. */ }
    }
  },
  onError: emitError,
})

const withPage = event => ({ ...event, returnUrl: pages.get(event.id) || '' })
const run = promise => promise.catch(emitError)

export function setupBookBrowser() {
  if (setup) return setup
  setup = (async () => {
    await bookDownloadInbox.initialize()
    if (bookBrowserAvailability() !== 'available') return
    const { InAppBrowser } = await import('@capgo/capacitor-inappbrowser')
    browser = InAppBrowser
    const handles = []
    try {
      // Register before opening, so fast redirects/downloads cannot race setup.
      handles.push(await browser.addListener('bookDownloadProgress', event => run(bookDownloadInbox.progress(withPage(event)))))
      handles.push(await browser.addListener('downloadCompleted', event => run((async () => {
        const row = await bookDownloadInbox.receive(withPage(event))
        if (row.status === 'failed') {
          const active = bookDownloadInbox.getSnapshot().some(item => item.browserId === event.id &&
            ['downloading', 'downloaded', 'importing'].includes(item.status))
          if (event.id === activeId && !active) {
            try { await browser.close({ id: event.id }) } catch { /* May already be closed. */ }
          }
          emitError(new Error(row.error))
        }
      })())))
      handles.push(await browser.addListener('downloadFailed', event => run(bookDownloadInbox.fail(withPage(event)))))
      handles.push(await browser.addListener('urlChangeEvent', event => {
        try {
          const url = normalizeBookUrl(event.url)
          pages.set(event.id, url)
          rememberBookPage(url)
          window.dispatchEvent(new Event('reader:book-history'))
        } catch { /* Ignore internal previews and non-web navigation. */ }
      }))
      handles.push(await browser.addListener('closeEvent', event => {
        if (activeId === event.id) activeId = null
        pages.delete(event.id)
        run(bookDownloadInbox.interrupt(event.id))
      }))
      await bookDownloadInbox.recover()
    } catch (error) {
      await Promise.allSettled(handles.map(handle => handle.remove()))
      throw error
    }
  })().catch(error => { setup = null; throw error })
  return setup
}

export function openBookBrowser(url) {
  if (opening) return opening
  opening = (async () => {
    if (bookBrowserAvailability() !== 'available') throw new Error('请使用带有寻书功能的新版安装包')
    const options = bookBrowserOptions(url, window.matchMedia('(prefers-color-scheme: dark)').matches)
    await setupBookBrowser()
    const result = await browser.openWebView(options)
    activeId = result.id
    pages.set(result.id, options.url)
    try { rememberBookPage(options.url) } catch { /* History storage cannot prevent browsing. */ }
    window.dispatchEvent(new Event('reader:book-history'))
    return result
  })().finally(() => { opening = null })
  return opening
}
