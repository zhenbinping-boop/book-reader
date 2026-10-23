// Request the local reading font before measuring columns. fonts.ready alone
// can resolve before any visible element has requested ReaderSong.
export async function prepareReaderFonts() {
  if (!document.fonts) return
  try { await document.fonts.load('18px ReaderSong') } catch { /* System serif remains usable. */ }
  await document.fonts.ready
}
