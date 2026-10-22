import test from 'node:test'
import assert from 'node:assert/strict'
import { handleNativeBack, exportNativeBlob } from '../src/lib/nativeActions.js'

function fixture(patch = {}) {
  const calls = []
  return { calls, args: { state: null, hash: '#/', selection: null,
    back: () => calls.push('back'), shelf: () => calls.push('shelf'),
    minimize: () => calls.push('minimize'), pause: () => calls.push('pause'), ...patch } }
}
test('Android back closes a text selection before changing the route', () => {
  const { calls, args } = fixture({ hash: '#/read/1', selection: {
    isCollapsed: false, removeAllRanges() { calls.push('selection') },
  } })
  handleNativeBack(args)
  assert.deepEqual(calls, ['selection'])
})
test('Android back delegates an open overlay to existing history handling', () => {
  const { calls, args } = fixture({ hash: '#/read/1', state: { __backClose: 'notes' } })
  handleNativeBack(args)
  assert.deepEqual(calls, ['back'])
})
test('Android back returns a reader to the shelf', () => {
  const { calls, args } = fixture({ hash: '#/read/1' })
  handleNativeBack(args)
  assert.deepEqual(calls, ['shelf'])
})
test('Android back at the shelf checkpoints before minimizing', () => {
  const { calls, args } = fixture()
  handleNativeBack(args)
  assert.deepEqual(calls, ['pause', 'minimize'])
})
test('Android export preserves Unicode and shares the written file URI', async () => {
  const content = '中文笔记📖'
  const calls = []
  await exportNativeBlob(new Blob([content]), '笔记.md', {
    async write(name, data) {
      assert.equal(Buffer.from(data, 'base64').toString(), content)
      calls.push(name)
      return { uri: 'file:///cache/exports/note.md' }
    },
    async share(uri, name) { calls.push([uri, name]) },
  })
  assert.deepEqual(calls, ['笔记.md', ['file:///cache/exports/note.md', '笔记.md']])
})
test('Android export propagates write and share failures to UI error handling', async () => {
  let shared = false
  await assert.rejects(exportNativeBlob(new Blob(['x']), 'x.md', {
    write: async () => { throw Error('storage full') },
    share: async () => { shared = true },
  }), /storage full/)
  assert.equal(shared, false)
  await assert.rejects(exportNativeBlob(new Blob(['x']), 'x.md', {
    write: async () => ({ uri: 'file:///x' }),
    share: async () => { throw Error('cancelled') },
  }), /cancelled/)
})
