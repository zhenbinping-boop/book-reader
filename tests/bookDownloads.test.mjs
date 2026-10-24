import test from 'node:test'
import assert from 'node:assert/strict'
import { createDownloadInbox, createImportQueue, downloadedBookFile, MAX_BOOK_DOWNLOAD_BYTES, nativeDownloadPath } from '../src/lib/bookDownloads.js'
import { bookBrowserOptions, cleanBookSource, loadBookHistory, loadBookSources, normalizeBookUrl, rememberBookPage, saveBookSources } from '../src/lib/bookSources.js'

const event = (name = '好书.txt') => ({ id: 'browser-1', path: `/cache/inappbrowser-downloads/${name}`, fileName: name,
  mimeType: 'text/plain', sourceUrl: 'https://books.example/download?id=1', returnUrl: 'https://books.example/book/1' })
const textBook = () => new Blob(['第一章\n这是一本用于验证下载入库的书。'], { type: 'text/plain' })
function fixture(patch = {}) {
  const rows = new Map(), calls = []
  const deps = {
    list: async () => [...rows.values()], save: async row => { rows.set(row.id, structuredClone(row)) },
    remove: async id => rows.delete(id), loadFile: async () => textBook(),
    importFile: async file => { calls.push(['import', file.name]); return { id: 7, title: '好书', status: 'added' } },
    cleanup: async row => calls.push(['cleanup', row.id]), onImported: async row => calls.push(['notice', row.bookId]), ...patch,
  }
  return { rows, calls, deps, inbox: createDownloadInbox(deps) }
}
function memoryStorage() {
  const map = new Map()
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
}

test('book sources accept HTTPS addresses and reject credentials, scripts and malformed URLs', () => {
  assert.equal(normalizeBookUrl('kgbook.com'), 'https://kgbook.com/')
  assert.equal(normalizeBookUrl('books.example:8443'), 'https://books.example:8443/')
  assert.equal(normalizeBookUrl('https://books.example/?q=%E4%B9%A6'), 'https://books.example/?q=%E4%B9%A6')
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://books.example', 'https://u:p@books.example', 'https://', 'not a url']) {
    assert.throws(() => normalizeBookUrl(url))
  }
  assert.throws(() => cleanBookSource({ name: ' ', url: 'https://books.example' }))
})

test('book source preferences and bounded history survive reload without accepting corrupt records', () => {
  const storage = memoryStorage()
  saveBookSources([cleanBookSource({ name: '我的书源', url: 'books.example' })], storage)
  assert.equal(loadBookSources(storage)[0].name, '我的书源')
  for (let n = 0; n < 15; n++) rememberBookPage(`https://books.example/${n}`, storage)
  rememberBookPage('https://books.example/14', storage)
  assert.equal(loadBookHistory(storage).length, 12)
  assert.equal(loadBookHistory(storage)[0].url, 'https://books.example/14')
  storage.setItem('reader.bookSources', '{broken')
  assert.deepEqual(loadBookSources(storage), [])
})

test('native browsing enables managed downloads without bypassing TLS or opening external app links', () => {
  const options = bookBrowserOptions('books.example')
  assert.equal(options.handleDownloads, true)
  assert.equal(options.openBlankTargetInWebView, true)
  assert.equal(options.preventDeeplink, true)
  assert.equal(options.ignoreUntrustedSSLError, false)
  assert.equal(options.persistWebViewData, true)
  assert.equal(options.useSharedDataStore, false)
})

test('download validation rejects login HTML, empty files, unsupported formats and corrupt PDF/EPUB bytes', async () => {
  for (const [blob, metadata] of [
    [new Blob(['<!DOCTYPE html><html>Login</html>']), { fileName: 'book.txt' }],
    [new Blob(['denied'], { type: 'text/html' }), { fileName: 'book.epub' }],
    [new Blob([]), { fileName: 'empty.txt' }],
    [new Blob(['not a PDF']), { fileName: 'book.pdf' }],
    [new Blob(['not an EPUB']), { fileName: 'book.epub' }],
    [new Blob(['legacy']), { fileName: 'book.azw3' }],
  ]) await assert.rejects(downloadedBookFile(blob, metadata))
  await assert.rejects(downloadedBookFile({ size: MAX_BOOK_DOWNLOAD_BYTES + 1 }, { fileName: 'huge.pdf' }), /200 MB/)
  const file = await downloadedBookFile(textBook(), { fileName: '../中文书.txt' })
  assert.equal(file.name, '中文书.txt')
  assert.equal(await file.text(), await textBook().text())
  assert.equal((await downloadedBookFile(new Blob(['%PDF-1.7\n']), { fileName: 'download', mimeType: 'application/pdf' })).name, 'download.pdf')
  assert.ok((await downloadedBookFile(textBook(), { fileName: '书'.repeat(200) + '.txt' })).name.endsWith('.txt'))
  await assert.rejects(downloadedBookFile(new Blob([Buffer.from('\ufeff', 'utf16le'), Buffer.from('<html>Login</html>', 'utf16le')]), { fileName: 'login.txt' }))
})

test('native receipts cannot be used to read arbitrary files or remote URLs', () => {
  for (const path of ['https://books.example/a.epub', '/etc/passwd', '/cache/inappbrowser-downloads/../secrets.txt', '/cache/inappbrowser-downloads/a/b.txt']) {
    assert.throws(() => nativeDownloadPath({ path }))
  }
  assert.equal(nativeDownloadPath({ path: '/private/tmp/InAppBrowserDownloads/a.epub' }), '/private/tmp/InAppBrowserDownloads/a.epub')
  assert.equal(nativeDownloadPath({ path: '/cache/inappbrowser-downloads/ab1a0334-a624-41bd-a6e7-ed1ab968025c/a.epub' }), '/cache/inappbrowser-downloads/ab1a0334-a624-41bd-a6e7-ed1ab968025c/a.epub')
})

test('a completed native download enters the library before temporary-file cleanup and notification', async () => {
  const f = fixture()
  const result = await f.inbox.receive(event())
  assert.equal(result.status, 'completed')
  assert.equal(f.rows.get(event().path).bookId, 7)
  assert.deepEqual(f.calls, [['import', '好书.txt'], ['cleanup', event().path], ['notice', 7]])
  await f.inbox.receive(event())
  assert.equal(f.calls.filter(row => row[0] === 'import').length, 1)
})

test('a temporarily unavailable inbox can initialize again without restarting the app', async () => {
  let attempts = 0
  const f = fixture({ list: async () => { if (++attempts === 1) throw Error('temporary storage failure'); return [] } })
  await assert.rejects(f.inbox.initialize(), /temporary/)
  await f.inbox.initialize()
  assert.equal(attempts, 2)
})

test('duplicate native callbacks share one import and late progress cannot overwrite a completed receipt', async () => {
  const f = fixture()
  await Promise.all([f.inbox.receive(event()), f.inbox.receive(event())])
  await f.inbox.progress({ ...event(), receivedBytes: 1, totalBytes: 100 })
  assert.equal(f.calls.filter(row => row[0] === 'import').length, 1)
  assert.equal(f.inbox.getSnapshot()[0].status, 'completed')
})

test('two separate downloads with the same filename have independent receipts', async () => {
  const f = fixture()
  for (const key of ['ab1a0334-a624-41bd-a6e7-ed1ab968025c', 'bb1a0334-a624-41bd-a6e7-ed1ab968025c']) {
    await f.inbox.receive({ ...event(), path: `/cache/inappbrowser-downloads/${key}/好书.txt` })
  }
  assert.equal(f.inbox.getSnapshot().length, 2)
  assert.equal(f.calls.filter(row => row[0] === 'import').length, 2)
})

test('failed imports retain the downloaded file and can retry without redownloading', async () => {
  let attempts = 0
  const f = fixture({ importFile: async () => { if (++attempts === 1) throw Error('存储空间不足'); return { id: 8, title: '好书', status: 'added' } } })
  await f.inbox.receive(event())
  assert.equal(f.inbox.getSnapshot()[0].status, 'failed')
  assert.equal(f.calls.length, 0)
  await f.inbox.retry(event().path)
  assert.equal(f.inbox.getSnapshot()[0].bookId, 8)
  assert.equal(attempts, 2)
})

test('HTML disguised as a TXT is never handed to the importer or announced as a book', async () => {
  const f = fixture({ loadFile: async () => new Blob(['<html>Sign in</html>']) })
  await f.inbox.receive(event())
  assert.equal(f.inbox.getSnapshot()[0].status, 'failed')
  assert.match(f.inbox.getSnapshot()[0].error, /网页/)
  assert.deepEqual(f.calls, [])
})

test('download failures do not offer import of a partial file', async () => {
  const f = fixture()
  await f.inbox.progress({ ...event(), receivedBytes: 10, totalBytes: 100 })
  await f.inbox.fail(event())
  const row = f.inbox.getSnapshot()[0]
  assert.equal(row.status, 'failed')
  assert.equal(row.retryable, false)
  await f.inbox.retry(row.id)
  assert.deepEqual(f.calls, [])
})

test('restart marks incomplete transfers interrupted and recovers saved files through the existing importer', async () => {
  const f = fixture()
  const saved = { ...event(), id: event().path, createdAt: 1, status: 'importing' }
  f.rows.set(saved.id, saved)
  f.rows.set('partial', { ...event('partial.txt'), id: 'partial', status: 'downloading', createdAt: 2 })
  await f.inbox.recover()
  assert.equal(f.inbox.getSnapshot().find(row => row.id === 'partial').status, 'interrupted')
  assert.equal(f.inbox.getSnapshot().find(row => row.id === saved.id).status, 'completed')
  assert.equal(f.calls.filter(row => row[0] === 'import').length, 1)
})

test('storage failures do not delete the only downloaded copy or publish false success', async () => {
  const f = fixture()
  f.deps.save = async row => { if (row.status === 'completed') throw Error('写入失败'); f.rows.set(row.id, row) }
  const inbox = createDownloadInbox(f.deps)
  await inbox.receive(event())
  assert.equal(inbox.getSnapshot()[0].status, 'failed')
  assert.equal(f.calls.filter(row => row[0] === 'cleanup' || row[0] === 'notice').length, 0)
})

test('the import queue serializes fingerprint checks and recovers after a rejected import', async () => {
  const order = []
  const queue = createImportQueue(async n => { order.push(`start${n}`); await new Promise(resolve => setTimeout(resolve, 2)); order.push(`end${n}`); if (n === 1) throw Error('broken'); return n })
  const results = await Promise.allSettled([queue(1), queue(2)])
  assert.deepEqual(order, ['start1', 'end1', 'start2', 'end2'])
  assert.equal(results[0].status, 'rejected')
  assert.equal(results[1].value, 2)
})

test('simultaneous native receipts do not read multiple full-size books into memory', async () => {
  let release
  const first = new Promise(resolve => { release = resolve })
  const reads = []
  const f = fixture({ loadFile: async row => { reads.push(row.fileName); return textBook() },
    importFile: async file => { if (file.name === 'one.txt') await first; return { id: 1, title: file.name, status: 'added' } } })
  const pending = [f.inbox.receive(event('one.txt')), f.inbox.receive(event('two.txt'))]
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(reads, ['one.txt'])
  release()
  await Promise.all(pending)
  assert.deepEqual(reads, ['one.txt', 'two.txt'])
})

test('removing a receipt cleans its cache without deleting its imported library book', async () => {
  const f = fixture()
  await f.inbox.receive(event())
  await f.inbox.dismiss(event().path)
  assert.deepEqual(f.inbox.getSnapshot(), [])
  assert.equal(f.rows.size, 0)
  assert.equal(f.calls.filter(row => row[0] === 'import').length, 1)
})
