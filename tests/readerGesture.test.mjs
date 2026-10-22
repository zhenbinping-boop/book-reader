import test from 'node:test'
import assert from 'node:assert/strict'
import { createReaderGesture } from '../src/lib/readerGesture.js'

const touch = (x, y = 100, identifier = 7) => ({ clientX: x, clientY: y, identifier })
function fixture() {
  let time = 0
  const gesture = createReaderGesture({ now: () => time })
  return { gesture, tick: (ms) => { time += ms } }
}
for (const [label, start, end, result] of [['左滑下一页', 250, 100, 1], ['右滑上一页', 100, 250, -1]]) {
  test(label, () => {
    const { gesture, tick } = fixture()
    gesture.start([touch(start)])
    tick(100)
    gesture.move([touch(end)])
    assert.equal(gesture.end([], [touch(end)]), result)
    assert.equal(gesture.end([], [touch(end)]), 0, '同一手势不能重复翻页')
    assert.equal(gesture.shouldIgnoreClick(), true, '滑动后的合成点击不切换工具栏')
    tick(351)
    assert.equal(gesture.shouldIgnoreClick(), false)
  })
}
test('轻点、小抖动不翻页', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(100)]); tick(80)
  assert.equal(gesture.end([], [touch(120)]), 0)
})
test('竖向滚动后拐向横向不能翻页', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(250, 250)])
  tick(30); gesture.move([touch(250, 160)])
  tick(50)
  assert.equal(gesture.end([], [touch(80, 200)]), 0)
})
test('斜向拖动不被轻微横向优势误判', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(250, 250)]); tick(100)
  assert.equal(gesture.end([], [touch(150, 160)]), 0)
})
test('长按后拖动即使选区瞬间折叠也不能翻页', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(250)]); tick(400)
  gesture.move([touch(100)]); tick(30)
  assert.equal(gesture.end([], [touch(80)]), 0)
})
test('慢拖超过时间上限不翻页', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(250)]); tick(50); gesture.move([touch(220)])
  tick(700); assert.equal(gesture.end([], [touch(80)]), 0)
})
test('选区或操作栏存在时阻止翻页', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(250)], { blocked: true }); tick(100)
  assert.equal(gesture.end([], [touch(80)]), 0)
  gesture.start([touch(250)]); tick(100)
  assert.equal(gesture.end([], [touch(80)], { blocked: true }), 0)
})
test('手势中出现选区，之后选区消失也不恢复翻页资格', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(250)]); tick(30)
  gesture.move([touch(200)], { blocked: true })
  tick(100); assert.equal(gesture.end([], [touch(80)]), 0)
})
test('双指开始或单指中途加第二指均不翻页', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(250), touch(300, 100, 8)]); tick(100)
  assert.equal(gesture.end([], [touch(80)]), 0)
  gesture.start([touch(250)]); tick(20)
  gesture.move([touch(220), touch(300, 100, 8)])
  tick(50); gesture.move([touch(140)])
  assert.equal(gesture.end([], [touch(80)]), 0)
})
test('touchcancel 后残留的 touchend 不翻页，下一次手势正常', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(250)]); gesture.cancel(); tick(100)
  assert.equal(gesture.end([], [touch(80)]), 0)
  gesture.start([touch(250)]); tick(100)
  assert.equal(gesture.end([], [touch(80)]), 1)
})
test('结束事件必须对应原来的手指', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(250)]); tick(100)
  assert.equal(gesture.end([], [touch(80, 100, 8)]), 0)
})
test('滚动模式始终不执行翻页或越界换章', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(250, 300)], { mode: 'scroll' }); tick(100)
  gesture.move([touch(50, 80)])
  assert.equal(gesture.end([], [touch(50, 80)], { mode: 'scroll' }), 0)
})
test('手势过程中切换版式后不执行旧翻页', () => {
  const { gesture, tick } = fixture()
  gesture.start([touch(250)]); tick(100)
  assert.equal(gesture.end([], [touch(80)], { mode: 'scroll' }), 0)
})
