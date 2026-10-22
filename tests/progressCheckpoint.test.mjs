import test from 'node:test'
import assert from 'node:assert/strict'
import { createProgressCheckpoint } from '../src/lib/progressCheckpoint.js'

function clock() {
  let time = 0, id = 0
  const timers = new Map()
  return {
    setTimer(fn, delay) { const key = ++id; timers.set(key, { fn, at: time + delay }); return key },
    clearTimer(key) { timers.delete(key) },
    advance(ms) {
      const end = time + ms
      for (;;) {
        const next = [...timers].sort((a,b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > end) break
        time = next[1].at; timers.delete(next[0]); next[1].fn()
      }
      time = end
    },
    count: () => timers.size,
  }
}
function fixture() {
  const timer = clock(), writes = [], errors = []
  let position = { chapterIndex: 1, charOffset: 100 }
  const checkpoint = createProgressCheckpoint({ ...timer, read: () => position,
    write: async (snapshot) => { writes.push(snapshot) }, onError: (error) => errors.push(error) })
  return { checkpoint, timer, writes, errors, position: (next) => { position = next } }
}
test('防抖到期读取最新位置，不保留安排保存时的旧快照', async () => {
  const { checkpoint, timer, writes, position } = fixture()
  checkpoint.schedule(); timer.advance(500)
  position({ chapterIndex: 1, charOffset: 950 })
  timer.advance(100); await checkpoint.flush()
  assert.deepEqual(writes, [{ chapterIndex: 1, charOffset: 950 }])
})
test('持续滚动同一段也在最大等待时间内保存', async () => {
  const { checkpoint, timer, writes, position } = fixture()
  for (let i=0; i<10; i++) {
    position({ chapterIndex: 1, charOffset: i*100 })
    checkpoint.schedule(); timer.advance(200)
  }
  await Promise.resolve(); await Promise.resolve()
  assert.ok(writes.length > 0, '不能无限防抖到停止阅读才保存')
  assert.ok(writes[0].charOffset >= 600)
  await checkpoint.flush()
  assert.equal(writes.at(-1).charOffset, 900)
})
test('切后台或退出时立刻保存最近位置，并取消旧计时器', async () => {
  const { checkpoint, timer, writes, position } = fixture()
  checkpoint.schedule()
  position({ chapterIndex: 2, charOffset: 1400 })
  await checkpoint.flush(true)
  assert.equal(timer.count(), 0)
  timer.advance(5000)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].charOffset, 1400)
})
test('恢复未完成不能用章首覆盖原进度', async () => {
  const { checkpoint, timer, writes, position } = fixture()
  position(null); checkpoint.schedule(); timer.advance(2000)
  await checkpoint.flush(true)
  assert.equal(writes.length, 0)
  position({ chapterIndex: 4, charOffset: 8000 })
  await checkpoint.flush()
  assert.equal(writes[0].charOffset, 8000)
})
test('未置脏标志时最终退出仍然保存', async () => {
  const { checkpoint, writes } = fixture()
  await checkpoint.flush(true)
  assert.equal(writes.length, 1)
})
test('没有待保存数据时不重复写入', async () => {
  const { checkpoint, writes } = fixture()
  await checkpoint.flush(); await checkpoint.flush()
  assert.equal(writes.length, 0)
})
test('写入失败显式报告并保留重试机会', async () => {
  const errors=[], writes=[]
  let fail = true, offset = 100
  const checkpoint=createProgressCheckpoint({ read: () => ({ charOffset: offset }),
    write: async (row) => { if(fail)throw new Error('quota'); writes.push(row) }, onError: (e) => errors.push(e) })
  checkpoint.schedule(); await checkpoint.flush()
  assert.equal(errors.length, 1)
  fail=false; offset=200
  await checkpoint.flush()
  assert.deepEqual(writes, [{ charOffset: 200 }])
})
test('慢写入期间的新检查点按顺序落库，不让旧写入晚到覆盖新位置', async () => {
  let release, offset=100
  const writes=[]
  const checkpoint=createProgressCheckpoint({ read: () => ({ charOffset: offset }), write: async(row) => {
    if(row.charOffset===100)await new Promise((resolve) => { release=resolve })
    writes.push(row.charOffset)
  } })
  const first=checkpoint.flush(true)
  await Promise.resolve()
  offset=900; const second=checkpoint.flush(true)
  release(); await Promise.all([first,second])
  assert.deepEqual(writes, [100,900])
})
