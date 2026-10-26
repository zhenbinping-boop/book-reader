/** Rebuild platform icons from the approved generated seal; no artwork is redrawn.
 * npm run icons — source, prompts and mask checks: docs/BRAND.md.
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const paper = '#f6f0e3'
const source = join(root, 'assets/brand/qidu-seal-cutout.png')
const sourceMeta = await sharp(source).metadata()
if (!sourceMeta.hasAlpha) throw new Error('Seal source must retain real transparency')
const artwork = await sharp(source).trim({ threshold: 16 }).png().toBuffer()
const raw = await sharp(artwork).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const pixels = Buffer.alloc(raw.info.width * raw.info.height * 4)
// Spot-color separation for Android themed icons: carved paper becomes a hole.
for (let offset = 0; offset < pixels.length; offset += 4) {
  const [r, g, b, a] = raw.data.subarray(offset, offset + 4)
  pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255
  pixels[offset + 3] = r > g * 1.25 && r > b * 1.25 ? a : 0
}
const monochrome = await sharp(pixels, { raw: raw.info }).png().toBuffer()

async function tile(size, fraction, { transparent = false, mono = false, round = false } = {}) {
  const side = Math.round(size * fraction)
  const resized = await sharp(mono ? monochrome : artwork)
    .resize(side, side, { fit: 'contain', background: '#00000000' }).png().toBuffer()
  let result = await sharp({ create: { width: size, height: size, channels: 4,
    background: transparent ? '#00000000' : paper } })
    .composite([{ input: resized, gravity: 'centre' }]).png().toBuffer()
  if (round) result = await sharp(result).composite([{ input: Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`),
    blend: 'dest-in' }]).png().toBuffer()
  return transparent || round ? result : sharp(result).removeAlpha().png().toBuffer()
}

async function save(path, input) {
  const target = join(root, path)
  await mkdir(dirname(target), { recursive: true })
  await sharp(input).png({ compressionLevel: 9 }).toFile(target)
  console.log(path)
}

// Dedicated maskable artwork stays inside the central 80% diameter safe circle.
for (const [name, size, fraction] of [
  ['icon-192.png', 192, .62], ['icon-512.png', 512, .62],
  ['icon-maskable-512.png', 512, .54], ['apple-touch-icon.png', 180, .62],
  ['favicon-32.png', 32, .72],
]) await save(`public/${name}`, await tile(size, fraction))
await save('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', await tile(1024, .62))
for (const [suffix, scale] of [['-2', 1], ['-1', 2], ['', 3]]) {
  await save(`ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732${suffix}.png`, await tile(128 * scale, .62, { transparent: true }))
}

// Legacy icons are 48dp; adaptive layers are 108dp. A 42% square fits inside
// the 66dp diameter adaptive safe circle, including the square's corners.
for (const [density, scale] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
  const directory = `android/app/src/main/res/mipmap-${density}`
  await save(`${directory}/ic_launcher.png`, await tile(48 * scale, .62))
  await save(`${directory}/ic_launcher_round.png`, await tile(48 * scale, .62, { round: true }))
  await save(`${directory}/ic_launcher_foreground.png`, await tile(108 * scale, .42, { transparent: true }))
  await save(`${directory}/ic_launcher_monochrome.png`, await tile(108 * scale, .42, { transparent: true, mono: true }))
}

// Verify actual nontransparent pixels, not just the nominal content box.
const adaptive = await sharp(await tile(432, .42, { transparent: true }))
  .raw().toBuffer({ resolveWithObject: true })
let outsideSafeArea = 0
for (let y = 0; y < 432; y++) for (let x = 0; x < 432; x++) {
  if (adaptive.data[(y * 432 + x) * 4 + 3] > 16 && Math.hypot(x + .5 - 216, y + .5 - 216) > 132) outsideSafeArea++
}
if (outsideSafeArea) throw new Error(`${outsideSafeArea} pixels exceed Android's 66dp safe circle`)
console.log('Icons ready: opaque iOS/PWA artwork; adaptive and themed Android layers stay inside the safe circle.')
