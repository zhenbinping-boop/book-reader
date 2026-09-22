import { useCallback, useEffect, useRef, useState } from 'react'
import {
  exportBackup,
  restoreBackup,
  readBackupFile,
  storageInfo,
  requestPersistent,
  formatBytes,
} from '../lib/backup'

/**
 * 备份面板。放在书架层，因为这里才是「我的数据」的入口。
 *
 * 只做本地文件读写：导出一个 JSON 下载，恢复时读本地文件，
 * 全程不经过网络 —— 和「文件不出本机」的承诺保持一致。
 */
export default function BackupPanel({ onClose, onRestored }) {
  const [info, setInfo] = useState(null)
  const [includeFiles, setIncludeFiles] = useState(false)
  const [busy, setBusy] = useState('')
  const [tip, setTip] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null)
  const [report, setReport] = useState(null)
  const fileRef = useRef(null)

  const refreshInfo = useCallback(() => {
    storageInfo().then(setInfo)
  }, [])

  useEffect(refreshInfo, [refreshInfo])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const run = async (label, fn) => {
    setBusy(label)
    setError('')
    try {
      return await fn()
    } catch (err) {
      setError(err?.message || '操作失败')
      return null
    } finally {
      setBusy('')
    }
  }

  const onExport = () =>
    run('正在导出…', async () => {
      setTip('')
      const r = await exportBackup({ includeFiles })
      setTip(
        `已导出 ${r.filename}（${formatBytes(r.bytes)}）：${r.books} 本书、` +
          `${r.highlights} 条高亮、${r.progress} 条进度${r.files ? `、${r.files} 个原文件` : ''}`
      )
      refreshInfo()
    })

  const onPickFile = async (file) => {
    if (!file) return
    setTip('')
    setReport(null)
    const data = await run('正在读取备份…', () => readBackupFile(file))
    if (data) setPending(data)
  }

  const onConfirmRestore = () =>
    run('正在恢复…', async () => {
      const r = await restoreBackup(pending)
      setPending(null)
      setReport(r)
      refreshInfo()
      onRestored?.()
      return r
    })

  const onPersist = () =>
    run('正在申请…', async () => {
      const ok = await requestPersistent()
      refreshInfo()
      setTip(
        ok === null
          ? '这个浏览器不支持持久化存储申请，请依赖导出备份'
          : ok
            ? '已获得持久化存储授权，浏览器不会自动清理本站数据'
            : '浏览器暂时没有批准。多使用几次后通常会自动批准，也可以先手动导出备份'
      )
    })

  const pct = info?.quota ? Math.min(100, Math.round((info.usage / info.quota) * 100)) : 0

  return (
    <>
      <div className="modal-mask" onClick={() => !busy && onClose()} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="备份与恢复">
        <div className="modal-card">
          <div className="drawer-head">
            <strong className="modal-title">备份与恢复</strong>
            <button className="btn btn-sm" onClick={onClose} disabled={!!busy}>
              关闭
            </button>
          </div>

          <div className="modal-body">
            <p className="modal-note">
              进度、笔记、高亮都存在这台设备的浏览器里，
              <strong>换设备、清缓存或系统回收都会丢</strong>。
              导出一份备份文件存到别处，是最可靠的保险。备份只在本机生成，不会上传。
            </p>

            {/* ---- 存储状态 ---- */}
            <section className="modal-sec">
              <h3>存储状态</h3>
              {info?.supported ? (
                <>
                  <div className="bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <div className="modal-row">
                    <span>
                      已用 {formatBytes(info.usage)}
                      {info.quota ? ` / 约 ${formatBytes(info.quota)}` : ''}
                    </span>
                    <span className={`pill${info.persisted ? ' ok' : ' warn'}`}>
                      {info.persisted === null
                        ? '无法查询'
                        : info.persisted
                          ? '已持久化'
                          : '未持久化'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="modal-row">
                  <span>这个浏览器不支持查询存储用量</span>
                </div>
              )}
              {info?.persisted === false && (
                <button className="btn btn-sm" onClick={onPersist} disabled={!!busy}>
                  申请持久化存储，防止被自动清理
                </button>
              )}
            </section>

            {/* ---- 导出 ---- */}
            <section className="modal-sec">
              <h3>导出备份</h3>
              <label className="modal-check">
                <input
                  type="checkbox"
                  checked={includeFiles}
                  onChange={(e) => setIncludeFiles(e.target.checked)}
                  disabled={!!busy}
                />
                <span>
                  连 PDF 原文件一起导出
                  <em>（不勾选体积小；勾选后一个文件就能在别的设备完整还原，几十 MB 的书会比较慢）</em>
                </span>
              </label>
              <button className="btn btn-primary" onClick={onExport} disabled={!!busy}>
                导出备份文件（.json）
              </button>
            </section>

            {/* ---- 恢复 ---- */}
            <section className="modal-sec">
              <h3>从备份恢复</h3>
              <p className="modal-note">
                恢复是<strong>按加法合并</strong>，不会清空现有数据。同一本书按内容指纹对上，
                已有笔记按位置去重。
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  onPickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <button
                className="btn"
                onClick={() => fileRef.current?.click()}
                disabled={!!busy}
              >
                选择备份文件…
              </button>
            </section>

            {/* ---- 恢复前确认 ---- */}
            {pending && (
              <section className="modal-sec pending">
                <h3>确认恢复？</h3>
                <div className="modal-row">
                  <span>
                    {pending.books.length} 本书 · {pending.highlights?.length ?? 0} 条高亮 ·{' '}
                    {pending.progress?.length ?? 0} 条进度
                    {pending.includeFiles ? ` · 含 ${pending.files?.length ?? 0} 个原文件` : ' · 不含原文件'}
                  </span>
                </div>
                <div className="modal-row">
                  <span className="modal-dim">
                    导出于{' '}
                    {pending.exportedAt ? new Date(pending.exportedAt).toLocaleString('zh-CN') : '未知时间'}
                  </span>
                </div>
                <div className="modal-actions">
                  <button className="btn btn-primary" onClick={onConfirmRestore} disabled={!!busy}>
                    确认恢复
                  </button>
                  <button className="btn" onClick={() => setPending(null)} disabled={!!busy}>
                    取消
                  </button>
                </div>
              </section>
            )}

            {/* ---- 恢复结果 ---- */}
            {report && (
              <section className="modal-sec result">
                <h3>恢复完成</h3>
                <ul className="modal-list">
                  <li>新增书目：{report.addedBooks} 本</li>
                  <li>并入已有书：{report.mergedBooks} 本</li>
                  <li>恢复高亮：{report.highlights} 条（跳过重复 {report.skippedHighlights} 条）</li>
                  <li>恢复进度：{report.progress} 条</li>
                  {report.bookmarks > 0 && <li>恢复书签：{report.bookmarks} 条</li>}
                  {report.files > 0 && <li>恢复原文件：{report.files} 个</li>}
                </ul>
                {report.orphanTitles?.length > 0 && (
                  <p className="modal-note">
                    有 {report.orphanTitles.length} 本书在备份里没有指纹（旧版导出的），
                    会先以「待重新导入」状态出现。重新导入同一个 PDF 即可自动接回笔记。
                  </p>
                )}
              </section>
            )}

            {busy && (
              <div className="modal-busy">
                <span className="spin" />
                {busy}
              </div>
            )}
            {tip && <div className="modal-tip">{tip}</div>}
            {error && <div className="modal-error">{error}</div>}
          </div>
        </div>
      </div>
    </>
  )
}
