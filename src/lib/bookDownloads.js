export const MAX_BOOK_DOWNLOAD_BYTES = 200 * 1024 * 1024
const TYPES = { epub: 'application/epub+zip', pdf: 'application/pdf', txt: 'text/plain' }

export function safeDownloadName(name) {
  const clean = String(name || '下载的图书').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim() || '下载的图书'
  if (clean.length <= 180) return clean
  const suffix = clean.match(/\.(epub|pdf|txt|text)$/i)?.[0] || ''
  return clean.slice(0, 180 - suffix.length) + suffix
}

export function nativeDownloadPath(event) {
  const path = String(event.path || '')
  // Only accept native download events, never arbitrary URLs from a web page.
  if (!path.startsWith('/') || !/\/(?:inappbrowser-downloads|InAppBrowserDownloads)\/(?:[\da-f-]{36}\/)?[^/]+$/i.test(path) || /(?:^|\/)\.\.(?:\/|$)/.test(path)) {
    throw new Error('下载文件的位置无效，请重新下载')
  }
  return path
}

export async function downloadedBookFile(blob, { fileName, mimeType } = {}) {
  if (!blob.size) throw new Error('下载的文件为空，请回到书源重试')
  if (blob.size > MAX_BOOK_DOWNLOAD_BYTES) throw new Error('这本书超过 200 MB，请通过本地文件导入')
  const name = safeDownloadName(fileName)
  const mime = String(mimeType || blob.type || '').split(';')[0].toLowerCase().trim()
  const prefix = new Uint8Array(await blob.slice(0, 1024).arrayBuffer())
  const encoding = prefix[0] === 0xff && prefix[1] === 0xfe ? 'utf-16le' : prefix[0] === 0xfe && prefix[1] === 0xff ? 'utf-16be' : 'utf-8'
  const text = new TextDecoder(encoding).decode(prefix).replace(/^\uFEFF/, '').trimStart()
  if (/html|xhtml/.test(mime) || /^<(?:!doctype\s+html|html\b|head\b|body\b)/i.test(text)) {
    throw new Error('下载到的是网页，可能需要登录或完成验证，请回到书源重试')
  }
  const ext = name.match(/\.(epub|pdf|txt|text)$/i)?.[1]?.toLowerCase()
  let format = ext === 'text' ? 'txt' : ext
  if (!format) format = Object.keys(TYPES).find(key => TYPES[key] === mime)
  if (!format) throw new Error('暂不支持这个下载格式，请选择 EPUB、PDF 或 TXT')
  if (format === 'pdf' && !text.includes('%PDF-')) throw new Error('下载的内容不是有效的 PDF 文件')
  if (format === 'epub' && !(prefix[0] === 0x50 && prefix[1] === 0x4b && prefix[2] === 3 && prefix[3] === 4)) {
    throw new Error('下载的内容不是有效的 EPUB 文件')
  }
  return new File([blob], ext ? name : `${name}.${format}`, { type: TYPES[format] })
}

// Both local imports and downloads share this queue: concurrent fingerprint
// checks must not insert two copies of the same new book.
export function createImportQueue(importer) {
  let tail = Promise.resolve()
  return (...args) => {
    const job = tail.then(() => importer(...args))
    tail = job.catch(() => {})
    return job
  }
}

/** Persistent inbox. Native transport is separate from parsing and IndexedDB.
 * A saved native file remains retryable until the book transaction succeeds.
 * Completed bytes in a cache directory are never treated as an imported book.
 */
export function createDownloadInbox({ list, save, remove, loadFile, importFile, cleanup = async () => {}, onImported = () => {}, onError = () => {} }) {
  let snapshot = []
  const listeners = new Set()
  const processing = new Map()
  let ready, writes = Promise.resolve(), imports = Promise.resolve()
  const publish = rows => {
    snapshot = [...rows].sort((a, b) => b.createdAt - a.createdAt)
    listeners.forEach(fn => fn())
  }
  const mutate = fn => {
    const job = writes.then(fn)
    writes = job.catch(() => {})
    return job
  }
  const put = (id, patch) => mutate(async () => {
    const prev = snapshot.find(row => row.id === id)
    const change = typeof patch === 'function' ? patch(prev) : patch
    if (!change) return prev
    const row = { createdAt: Date.now(), ...prev, ...change, id, updatedAt: Date.now() }
    await save(row)
    publish([...snapshot.filter(item => item.id !== id), row])
    return row
  })
  const initialize = () => {
    if (!ready) ready = (async () => {
      publish(await list())
      for (const row of snapshot.filter(row => row.status === 'downloading')) {
        await put(row.id, { status: 'interrupted', error: '上次下载未完成，请重新访问书源下载' })
      }
    })().catch(error => { ready = null; throw error })
    return ready
  }
  const process = row => {
    if (processing.has(row.id)) return processing.get(row.id)
    // Limit full-size native reads as well as parsing: several recovered large
    // books must not all be loaded into a phone's memory simultaneously.
    const job = imports.then(async () => {
      try {
        await put(row.id, { status: 'importing', retryable: true, error: '' })
        const blob = await loadFile(row)
        const file = await downloadedBookFile(blob, row)
        const result = await importFile(file)
        // Persist the library identity before removing the temporary file.
        const done = await put(row.id, { status: 'completed', bookId: result.id, title: result.title,
          resultStatus: result.status, receivedBytes: file.size, totalBytes: file.size, error: '' })
        try { await cleanup(row) } catch { /* The book is durable; cache cleanup can be retried later. */ }
        try { await onImported(done) } catch (error) { onError(error) }
        return done
      } catch (error) {
        return put(row.id, { status: 'failed', retryable: true, error: error?.message || '入库失败，请重试' })
      }
    }).finally(() => processing.delete(row.id))
    imports = job.catch(() => {})
    processing.set(row.id, job)
    return job
  }
  return {
    initialize,
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    async recover() {
      await initialize()
      // Repeating an import is safe: the existing importer matches fingerprints.
      return Promise.all(snapshot.filter(row => ['downloaded', 'importing'].includes(row.status)).map(process))
    },
    async progress(event) {
      await initialize()
      const path = nativeDownloadPath(event)
      return put(path, prev => !prev || prev.status === 'downloading' ? {
        path, fileName: safeDownloadName(event.fileName), mimeType: event.mimeType || '',
        browserId: event.id, sourceUrl: event.sourceUrl || '', returnUrl: event.returnUrl || '', status: 'downloading',
        receivedBytes: Math.max(0, Number(event.receivedBytes) || 0), totalBytes: Math.max(0, Number(event.totalBytes) || 0),
      } : null)
    },
    async receive(event) {
      await initialize()
      const path = nativeDownloadPath(event)
      if (processing.has(path)) return processing.get(path)
      const existing = snapshot.find(row => row.id === path)
      if (existing?.status === 'completed') return existing
      const row = await put(path, { path, fileName: safeDownloadName(event.fileName), mimeType: event.mimeType || '',
        browserId: event.id || existing?.browserId, sourceUrl: event.sourceUrl || existing?.sourceUrl || '',
        returnUrl: event.returnUrl || existing?.returnUrl || '', status: 'downloaded', error: '' })
      return process(row)
    },
    async fail(event) {
      await initialize()
      const active = snapshot.filter(row => row.status === 'downloading' && row.browserId === event.id &&
        (!event.sourceUrl || row.sourceUrl === event.sourceUrl))
      const targets = active.length ? active : [{ id: `failed-${crypto.randomUUID()}` }]
      return Promise.all(targets.map(row => put(row.id, { status: 'failed', fileName: safeDownloadName(event.fileName || row.fileName),
        returnUrl: event.returnUrl || row.returnUrl || '', browserId: event.id, sourceUrl: event.sourceUrl || row.sourceUrl || '', retryable: false,
        error: '下载失败，请检查网络或登录状态，然后回到书源重试' })))
    },
    async interrupt(browserId) {
      await initialize()
      return Promise.all(snapshot.filter(row => row.browserId === browserId && row.status === 'downloading').map(row =>
        put(row.id, prev => prev?.status === 'downloading' ? { status: 'interrupted', error: '找书窗口已关闭；如未完成，请重新下载' } : null)))
    },
    async retry(id) {
      await initialize()
      const row = snapshot.find(item => item.id === id)
      if (!row?.path || !row.retryable || !['failed', 'downloaded', 'importing'].includes(row.status)) return
      return process(row)
    },
    async dismiss(id) {
      await initialize()
      const row = snapshot.find(item => item.id === id)
      if (!row || ['downloading', 'downloaded', 'importing'].includes(row.status) || processing.has(id)) return
      if (row.path) { try { await cleanup(row) } catch { /* Cache may have been removed by the OS. */ } }
      await mutate(async () => { await remove(id); publish(snapshot.filter(item => item.id !== id)) })
    },
  }
}
