// The platform-independent part stays injectable for unit acceptance.
export function handleNativeBack({ state, hash, selection, back, shelf, minimize, pause }) {
  if (selection && !selection.isCollapsed) {
    selection.removeAllRanges()
    return
  }
  if (state?.__backClose) return back()
  if (/^#\/(read\/|notes|settings|discover)/.test(hash)) return shelf()
  pause()
  return minimize()
}

export async function exportNativeBlob(blob, filename, { write, share }) {
  // Cache avoids broad storage permissions. The native share sheet lets the user
  // choose where to save/send a backup; never report success before it completes.
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768))
  }
  const { uri } = await write(filename, btoa(binary))
  await share(uri, filename)
}
