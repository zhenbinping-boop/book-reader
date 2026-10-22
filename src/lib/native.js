import { Capacitor } from '@capacitor/core'
import { handleNativeBack, exportNativeBlob } from './nativeActions'

export const isNative = () => Capacitor.isNativePlatform()
const pause = () => window.dispatchEvent(new Event('reader:pause'))

export async function setupNativeApp() {
  if (!isNative()) return
  const { App } = await import('@capacitor/app')
  await App.addListener('appStateChange', ({ isActive }) => { if (!isActive) pause() })
  await App.addListener('backButton', () => handleNativeBack({
    state: history.state, hash: location.hash, selection: window.getSelection(),
    back: () => history.back(), shelf: () => { location.hash = '#/' },
    minimize: () => App.minimizeApp(), pause,
  }))
}

export async function nativeExport(blob, filename) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'), import('@capacitor/share'),
  ])
  return exportNativeBlob(blob, filename, {
    write: (path, data) => Filesystem.writeFile({ path: `exports/${path}`, data,
      directory: Directory.Cache, recursive: true }),
    share: (uri, title) => Share.share({ title, files: [uri], dialogTitle: '导出文件' }),
  })
}
