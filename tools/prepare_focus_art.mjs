/** Register the generated immersive atlas; never repaint the character.
 * Reuses Sharp (already in this project); icon generation does not register
 * pose frames, so this command records the source rows and common baseline.
 * Run: node tools/prepare_focus_art.mjs. Sources are preserved in assets/focus.
 * Default: 32 poses; --legacy-16 rebuilds the preserved old atlas.
 * --study registers the close rear-view scroll sequence; --study-v1 retains
 * the historical side-view study preparation.
 * Verify: distinct nonempty frames, lower seated pose, common floor in JSON,
 * then inspect the real enter/exit animation at phone size.
 */
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'

const legacy = process.argv.includes('--legacy-16')
const studyV1 = process.argv.includes('--study-v1')
const study = process.argv.includes('--study') || studyV1
const studyBack = study && !studyV1
const config = study
  ? studyBack
    ? { source: 'wuxia-scroll-back-v2-source', output: 'wuxia-scroll-back-v2', layout: 'scroll-atlas-v2-layout', width: 1774, height: 887, columns: 8, rows: [0, 222, 444, 666, 887] }
    : { source: 'wuxia-scroll-sequence-source', output: 'wuxia-scroll-sequence', layout: 'scroll-atlas-layout', width: 1774, height: 887, columns: 8, rows: [0, 232, 456, 678, 887] }
  : legacy
  ? { source: 'wuxia-sit-sequence-source', output: 'wuxia-sit-sequence', layout: 'pose-atlas-layout', width: 1254, height: 1254, columns: 4, rows: [0, 351, 688, 985, 1254] }
  : { source: 'wuxia-sit-sequence-32-source', output: 'wuxia-sit-sequence-32', layout: 'pose-atlas-32-layout', width: 1774, height: 887, columns: 8, rows: [0, 243, 481, 696, 887] }
const directory = study ? 'study' : 'focus'
const source = 'assets/' + directory + '/' + config.source + '.png'
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
// The generated atlas has four rows but uneven transparent gutters. These
// cuts are inside verified empty bands; normalize to a regular runtime grid.
const rows = config.rows, columns = config.columns, frameCount = columns * (rows.length - 1)
if (info.width !== config.width || info.height !== config.height) throw Error('Atlas source changed; inspect its grid before preparing it')
const size = 384, floor = 353, entries = [], composite = []
let scale = 1
const hashes = new Set()
for (let frame = 0; frame < frameCount; frame++) {
  const row = Math.floor(frame / columns), col = frame % columns
  const left = Math.round(col * info.width / columns), right = Math.round((col + 1) * info.width / columns)
  let x0 = right, y0 = rows[row + 1], x1 = left, y1 = rows[row]
  for (let y = rows[row]; y < rows[row + 1]; y++) for (let x = left; x < right; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 48) continue
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  if (x1 < x0 || y1 < y0) throw Error(`Empty pose ${frame}`)
  const sourceWidth = x1 - x0 + 1, sourceHeight = y1 - y0 + 1
  if (!legacy && frame === 0) scale = (study ? 300 : 323) / sourceHeight // One scale for the entire sequence, not per-pose fitting.
  const width = Math.round(sourceWidth * scale), height = Math.round(sourceHeight * scale)
  if (height > floor || width > size - 10) throw Error(`Pose ${frame} cannot fit the registered tile`)
  // A waving robe changes the bounding-box center. Anchor the upper head/back
  // axis instead, so cloth spreading does not slide the whole person sideways.
  let weightedX = 0, weight = 0
  if (!legacy && !studyV1) for (let y = y0 + Math.round(sourceHeight * .04); y < y0 + Math.round(sourceHeight * .2); y++) for (let x = x0; x <= x1; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3]
    if (alpha >= 128) { weightedX += x * alpha; weight += alpha }
  }
  const anchorX = weight ? weightedX / weight : x0 + sourceWidth / 2
  const input = await sharp(source).extract({ left: x0, top: y0, width: sourceWidth, height: sourceHeight }).resize(width, height).png().toBuffer()
  const hash = await crypto.subtle.digest('SHA-256', input)
  const key = Buffer.from(hash).toString('hex')
  if (hashes.has(key)) throw Error(`Repeated artwork at pose ${frame}`)
  hashes.add(key)
  // The study desk's right edge and floor are static registration anchors;
  // unlike meditation, lowering the head must not shift the desk sideways.
  const x = studyV1 ? size - 26 - width : Math.round(size / 2 - (anchorX - x0) * scale), y = floor - height
  if (x < 0 || x + width > size) throw Error(`Pose ${frame} crosses its cell after registration`)
  composite.push({ input, left: col * size + x, top: row * size + y })
  entries.push({ frame, source: { left: x0, top: y0, width: sourceWidth, height: sourceHeight, anchorX }, output: { x, y, width, height, floor }, sha256: key })
}
if (!study && entries.at(-1).output.height >= entries[0].output.height * .8) throw Error('Seated pose must be visibly lower than standing')
await sharp({ create: { width: size * columns, height: size * (rows.length - 1), channels: 4, background: '#00000000' } })
  .composite(composite).webp({ quality: 88, alphaQuality: 100 }).toFile('public/art/' + directory + '/' + config.output + '.webp')
const background = studyBack ? 'study-window-v2' : study ? 'study-room' : 'pine-vista-portrait'
await sharp('assets/' + directory + '/' + background + '-source.png').resize({ width: 960, withoutEnlargement: true })
  .webp({ quality: 86 }).toFile('public/art/' + directory + '/' + background + '.webp')
if (studyV1) await sharp('assets/study/study-room-wide-source.png').resize({ width: 1600, withoutEnlargement: true })
  .webp({ quality: 86 }).toFile('public/art/study/study-room-wide.webp')
let idleMaster
if (studyBack) {
  const idleSource = 'assets/study/wuxia-back-idle-v2-source.png'
  const idle = await sharp(idleSource).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = idle.info.width, top = idle.info.height, right = 0, bottom = 0
  for (let y = 0; y < idle.info.height; y++) for (let x = 0; x < idle.info.width; x++) {
    if (idle.data[(y * idle.info.width + x) * 4 + 3] < 48) continue
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  if (right <= left || bottom <= top) throw Error('Empty high-resolution waiting portrait')
  const ratio = 1024 / size, pose = entries[0].output
  const destination = { left: Math.round(pose.x * ratio), top: Math.round(pose.y * ratio), width: Math.round(pose.width * ratio), height: Math.round(pose.height * ratio) }
  const cut = { left, top, width: right - left + 1, height: bottom - top + 1 }
  const input = await sharp(idleSource).extract(cut).resize(destination.width, destination.height, { fit: 'fill' }).png().toBuffer()
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } }).composite([{ input, left: destination.left, top: destination.top }])
    .webp({ quality: 93, alphaQuality: 100 }).toFile('public/art/study/wuxia-back-idle-v2.webp')
  idleMaster = { source: idleSource, crop: cut, tile: 1024, destination }
}
await writeFile('assets/' + directory + '/' + config.layout + '.json', JSON.stringify({ source, sourceSize: [info.width, info.height], rows, grid: [columns, rows.length - 1], tile: size, floor, scale, entries, idleMaster }, null, 2) + '\n')
console.log(`Prepared ${directory}: ${frameCount} distinct poses; first ${entries[0].output.height}px → last ${entries.at(-1).output.height}px; shared floor ${floor}px.`)
