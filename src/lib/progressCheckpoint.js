/** 有最大等待时间的进度写回；flush 时才读取位置，避免保存滚动前的快照。 */
export function createProgressCheckpoint({ read, write, onError = () => {}, delay = 600,
  maxWait = 1500, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let debounce = null
  let deadline = null
  let dirty = false
  let writes = Promise.resolve()
  const clear = () => {
    clearTimer(debounce)
    clearTimer(deadline)
    debounce = deadline = null
  }
  const flush = (force = false) => {
    clear()
    if (!dirty && !force) return writes
    const snapshot = read()
    // 恢复 / 重排期间不能把起始位置覆盖到旧进度上。
    if (!snapshot) return writes
    dirty = false
    writes = writes.then(() => write(snapshot)).catch((error) => {
      dirty = true // 写入失败保留重试机会，不产生未处理拒绝。
      onError(error)
    })
    return writes
  }
  return {
    flush,
    schedule() {
      dirty = true
      clearTimer(debounce)
      debounce = setTimer(() => flush(), delay)
      if (deadline === null) deadline = setTimer(() => flush(), maxWait)
    },
  }
}
