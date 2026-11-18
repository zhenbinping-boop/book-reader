import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { decodeFocusMotion, fillFocusVertices, focusMeshIndices } from '../src/lib/focusMesh.js'

test('real motion data decodes the registered 32-pose grid and rejects corrupt twins', async () => {
  const bytes = await readFile(new URL('../public/art/focus/wuxia-motion-v1.bin', import.meta.url))
  const clean = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const data = decodeFocusMotion(clean)
  const report = JSON.parse(await readFile(new URL('../assets/focus/motion-mesh-report.json', import.meta.url), 'utf8'))
  const atlas = await readFile(new URL('../public/art/focus/wuxia-sit-sequence-32.webp', import.meta.url))
  assert.equal(createHash('sha256').update(atlas).digest('hex'), report.atlasSha256, 'rebuild motion data after changing the pose atlas')
  assert.equal(bytes.byteLength, report.bytes)
  assert.deepEqual([data.size, data.side, data.frames], [384, 33, 32])
  assert.equal(data.vectors.length, 31 * 2 * 33 * 33 * 2)
  assert.ok(data.vectors.some(value => Math.abs(value) > 1))
  assert.throws(() => decodeFocusMotion(clean.slice(0, -2)), /length/)
  const wrongMagic = clean.slice(0); new Uint8Array(wrongMagic)[0] = 0
  assert.throws(() => decodeFocusMotion(wrongMagic), /Unsupported/)
  const wrongGrid = clean.slice(0); new DataView(wrongGrid).setUint16(6, 32, true)
  assert.throws(() => decodeFocusMotion(wrongGrid), /grid/)
  const badVector = clean.slice(0); new DataView(badVector).setInt16(16, 32767, true)
  assert.throws(() => decodeFocusMotion(badVector), /range/)
})

test('known translation moves geometry continuously while leaving source UVs fixed', () => {
  const vectors = new Float32Array(2 * 3 * 3 * 2)
  for (let i = 0; i < 9; i++) { vectors[i * 2] = 16; vectors[(9 + i) * 2] = -16 }
  const motion = { size: 64, side: 3, frames: 2, vectors }
  const a = new Float32Array(9 * 4), b = new Float32Array(9 * 4)
  fillFocusVertices(a, motion, 0, 0, .5, 2, 1)
  fillFocusVertices(b, motion, 1, 1, .5, 2, 1)
  assert.equal(a[0], 8); assert.equal(b[0], -8)
  assert.equal(a[1], 0); assert.equal(b[1], 0)
  assert.equal(a[2], .5 / 128); assert.equal(b[2], 64.5 / 128)
  const zero = new Float32Array(9 * 4)
  fillFocusVertices(zero, motion, 0, 0, 0, 2, 1)
  assert.equal(zero[0], 0); assert.equal(zero[4 * 4], 32)
})

test('mesh triangles cover the grid without reading beyond its vertices', () => {
  const indices = focusMeshIndices(33)
  assert.equal(indices.length, 32 * 32 * 6)
  assert.equal(Math.max(...indices), 33 * 33 - 1)
  assert.deepEqual([...focusMeshIndices(2)], [0, 2, 1, 1, 2, 3])
})
