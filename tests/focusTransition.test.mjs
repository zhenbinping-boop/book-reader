import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { FOCUS_ENTER_MS, FOCUS_LEAVE_MS, FOCUS_POSES, focusTransitionSample, poseBlend, poseAtlasPosition } from '../src/lib/focusTransition.js'

test('enter gives UI time to fade before the first knee movement, then reaches the seated pose', () => {
  const from = { camera: 0, pose: 0 }
  assert.deepEqual(focusTransitionSample(from, 1, 0, FOCUS_ENTER_MS), { camera: 0, pose: 0, done: false })
  const early = focusTransitionSample(from, 1, 500, FOCUS_ENTER_MS)
  assert.equal(early.pose, 0)
  assert.ok(early.camera > 0)
  const middle = focusTransitionSample(from, 1, 1800, FOCUS_ENTER_MS)
  assert.ok(Math.abs(middle.pose - .5) < .001)
  const settled = focusTransitionSample(from, 1, 2800, FOCUS_ENTER_MS)
  assert.equal(settled.pose, 1)
  assert.ok(settled.camera < 1)
  assert.deepEqual(focusTransitionSample(from, 1, FOCUS_ENTER_MS, FOCUS_ENTER_MS), { camera: 1, pose: 1, done: true })
})

test('exit is continuous from seated to standing, with exact final endpoints even after background suspension', () => {
  const from = { camera: 1, pose: 1 }
  let last = from
  for (let elapsed = 0; elapsed <= FOCUS_LEAVE_MS; elapsed += 100) {
    const next = focusTransitionSample(from, 0, elapsed, FOCUS_LEAVE_MS)
    assert.ok(next.pose <= last.pose && next.camera <= last.camera)
    last = next
  }
  assert.deepEqual(focusTransitionSample(from, 0, 60000, FOCUS_LEAVE_MS), { camera: 0, pose: 0, done: true })
})

test('reversing an unfinished entry begins from its actual pose and camera without snapping', () => {
  const from = focusTransitionSample({ pose: 0, camera: 0 }, 1, 2100, FOCUS_ENTER_MS)
  const next = focusTransitionSample(from, 0, 0, FOCUS_LEAVE_MS)
  assert.equal(next.pose, from.pose)
  assert.equal(next.camera, from.camera)
})

test('atlas blending never skips to a nonadjacent pose or reads beyond the final tile', () => {
  assert.deepEqual(poseBlend(0), { first: 0, second: 1, mix: 0 })
  assert.equal(FOCUS_POSES, 32)
  assert.deepEqual(poseBlend(1), { first: 31, second: 31, mix: 0 })
  assert.deepEqual(poseBlend(.5), { first: 15, second: 16, mix: .5 })
  for (let value = 0; value < 1; value += .013) {
    const { first, second, mix } = poseBlend(value)
    assert.equal(second - first, 1); assert.ok(mix >= 0 && mix < 1)
  }
})

test('the 32-pose grid crosses each row at the correct tile and ends at the last pose', () => {
  assert.deepEqual(poseAtlasPosition(0), { x: 0, y: 0 })
  assert.deepEqual(poseAtlasPosition(7), { x: 100, y: 0 })
  assert.deepEqual(poseAtlasPosition(8), { x: 0, y: 100 / 3 })
  assert.deepEqual(poseAtlasPosition(16), { x: 0, y: 200 / 3 })
  assert.deepEqual(poseAtlasPosition(31), { x: 100, y: 100 })
})

test('the shipped artwork really contains 32 nonempty different frames', async () => {
  const sharp = (await import('sharp')).default
  const { createHash } = await import('node:crypto')
  const { data, info } = await sharp(fileURLToPath(new URL('../public/art/focus/wuxia-sit-sequence-32.webp', import.meta.url))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, 3072); assert.equal(info.height, 1536)
  const hashes = new Set()
  for (let frame = 0; frame < 32; frame++) {
    const hash = createHash('sha256'); let opaque = 0
    const x = (frame % 8) * 384, y = Math.floor(frame / 8) * 384
    for (let line = 0; line < 384; line++) {
      const offset = ((y + line) * info.width + x) * 4
      const row = data.subarray(offset, offset + 384 * 4)
      hash.update(row)
      for (let p = 3; p < row.length; p += 4) if (row[p] > 128) opaque++
    }
    assert.ok(opaque > 1000, 'pose ' + frame + ' is empty')
    hashes.add(hash.digest('hex'))
  }
  assert.equal(hashes.size, 32)
})
