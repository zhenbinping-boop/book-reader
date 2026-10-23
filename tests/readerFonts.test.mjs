import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareReaderFonts } from '../src/lib/readerFonts.js'

const withDocument = (t, value) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value })
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document)
}

test('request the offline reading font before waiting for layout fonts', async t => {
  const events = []
  withDocument(t, { fonts: {
    load: async descriptor => { events.push(descriptor) },
    get ready() { events.push('ready'); return Promise.resolve() },
  } })
  await prepareReaderFonts()
  assert.deepEqual(events, ['18px ReaderSong', 'ready'])
})

test('font loading failure permits system fallback after fonts settle', async t => {
  let settled = false
  withDocument(t, { fonts: {
    load: async () => { throw new Error('offline font unavailable') },
    get ready() { settled = true; return Promise.resolve() },
  } })
  await prepareReaderFonts()
  assert.equal(settled, true)
})

test('platforms without the font loading API still open the reader', async t => {
  withDocument(t, {})
  await assert.doesNotReject(prepareReaderFonts())
})
