/**
 * 最小 ZIP 读取器 —— 只做 EPUB 需要的三件事：列条目、读条目、解压。
 *
 * 为什么自己写而不引 JSZip：EPUB 用到的只是 ZIP 的一个很窄的子集
 * （stored + deflate，无加密、无 ZIP64），而浏览器自带的
 * `DecompressionStream('deflate-raw')` 已经把解压这段包了 —— 剩下的
 * 「扫中央目录 + 定位数据区」不到 150 行。省一个 100 KB 级的依赖，
 * 与 `txtText.js` 自研编码探测是同一个取舍（见 DESIGN.md 的依赖约束）。
 *
 * 结构（一定要按这个顺序读，不能直接顺着本地头往下走）：
 *   [本地头 + 数据] × N … [中央目录] [EOCD]
 * 本地头的 extra field 长度和中央目录里的**可以不一样**，所以只有从中央目录
 * 拿到 `localOff` 再回头读一次本地头，才能算出数据真正的起点。顺序扫本地头
 * 的做法遇到 data descriptor（bit 3，很多工具会写）就会错位。
 */

import { decodeBytes } from './txtText'

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50

export class ZipError extends Error {}

/** 按 UTF-8 → gb18030 → latin1 依次尝试解码条目名（老工具会用 GBK 写中文名） */
function decodeName(bytes, utf8Flag) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (utf8Flag) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(u8)
    } catch {
      /* 标了 UTF-8 其实是别的编码，继续往下试 */
    }
  }
  for (const enc of ['utf-8', 'gb18030']) {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(u8)
    } catch {
      /* 换下一个 */
    }
  }
  return new TextDecoder('latin1').decode(u8)
}

function findEocd(dv, len) {
  const floor = Math.max(0, len - 66000)
  let loose = -1
  for (let i = len - 22; i >= floor; i--) {
    if (dv.getUint32(i, true) !== SIG_EOCD) continue
    // 注释长度必须刚好补满到文件末尾 —— 否则可能是在被压缩的数据里
    // 撞见了一串长得像签名的字节。先记下来，找不到严格的再用宽松的。
    if (i + 22 + dv.getUint16(i + 20, true) === len) return i
    if (loose < 0) loose = i
  }
  return loose
}

/**
 * 打开一个 ZIP。
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ names:string[], size:number, has(n:string):boolean,
 *             read(n:string):Promise<Uint8Array|null>, text(n:string):Promise<string|null> }}
 */
export function openZip(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input)
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const len = u8.byteLength

  const eocd = findEocd(dv, len)
  if (eocd < 0) throw new ZipError('这不是一个 ZIP 文件（找不到中央目录）')

  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  if (p === 0xffffffff) throw new ZipError('暂不支持 ZIP64 格式的压缩包')

  const entries = new Map()
  // 条目数上限 65535 在超大压缩包里会溢出（EOCD 里记的是 0xffff），
  // 所以不用 count 做循环条件，而是扫到签名不匹配为止。
  for (let i = 0; i < 0xffff && p + 46 <= len; i++) {
    if (dv.getUint32(p, true) !== SIG_CENTRAL) break
    const flags = dv.getUint16(p + 8, true)
    const method = dv.getUint16(p + 10, true)
    const csize = dv.getUint32(p + 20, true)
    const usize = dv.getUint32(p + 24, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const cmtLen = dv.getUint16(p + 32, true)
    const localOff = dv.getUint32(p + 42, true)
    const name = decodeName(u8.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0)
    entries.set(name, {
      name,
      method,
      csize,
      usize,
      localOff,
      encrypted: (flags & 1) !== 0,
    })
    p += 46 + nameLen + extraLen + cmtLen
  }

  if (!entries.size) throw new ZipError('ZIP 里没有任何文件')

  // 条目名可能是 `OEBPS/./text/a.xhtml`，而 href 解析出来是 `OEBPS/text/a.xhtml`，
  // 所以查找要能容忍 `./`、大小写、以及 URL 转义三种差异。
  const exact = new Map()
  const lower = new Map()
  for (const [name, e] of entries) {
    const clean = name.replace(/^\.?\//, '')
    if (!exact.has(clean)) exact.set(clean, e)
    const lk = clean.toLowerCase()
    if (!lower.has(lk)) lower.set(lk, e)
  }

  function lookup(name) {
    if (!name) return null
    const tries = []
    const raw = String(name).replace(/^\.?\//, '')
    tries.push(raw)
    try {
      const dec = decodeURIComponent(raw)
      if (dec !== raw) tries.push(dec)
    } catch {
      /* 名字里有裸 % 号，忽略 */
    }
    for (const t of tries) {
      if (exact.has(t)) return exact.get(t)
      const l = lower.get(t.toLowerCase())
      if (l) return l
    }
    return null
  }

  async function inflateRaw(bytes) {
    // deflate-raw = 没有 zlib 头尾的裸 deflate，正是 ZIP 用的那种
    const ds = new DecompressionStream('deflate-raw')
    const stream = new Blob([bytes]).stream().pipeThrough(ds)
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }

  const cache = new Map()

  async function readRaw(entry) {
    if (entry.encrypted) throw new ZipError(`「${entry.name}」被加密了，无法读取`)
    const q = entry.localOff
    if (dv.getUint32(q, true) !== SIG_LOCAL) {
      throw new ZipError(`「${entry.name}」的位置信息不完整（文件可能被截断）`)
    }
    const nameLen = dv.getUint16(q + 26, true)
    const extraLen = dv.getUint16(q + 28, true)
    const start = q + 30 + nameLen + extraLen
    const data = u8.subarray(start, start + entry.csize)
    if (entry.method === 0) return data.slice()
    if (entry.method === 8) return inflateRaw(data)
    throw new ZipError(`「${entry.name}」用了不支持的压缩方式（method=${entry.method}）`)
  }

  async function read(name) {
    const entry = lookup(name)
    if (!entry) return null
    if (!cache.has(entry.name)) cache.set(entry.name, readRaw(entry))
    return cache.get(entry.name)
  }

  async function text(name) {
    const bytes = await read(name)
    if (!bytes) return null
    // 复用 TXT 那套解码（BOM / UTF-16 / 严格 UTF-8 / gb18030 兜底）。
    // XHTML 按规范必须是 UTF-8，但总有工具不守规矩，多一层兜底没坏处。
    return decodeBytes(bytes).text
  }

  return {
    names: [...entries.keys()],
    size: len,
    has: (n) => lookup(n) !== null,
    read,
    text,
  }
}

/**
 * 把 href 相对某个基准路径解析成压缩包内的绝对路径，并拆出 fragment。
 * 例：resolveZipPath('OEBPS/text/', '../images/a.png') → 'OEBPS/images/a.png'
 */
export function resolveZipPath(base, href) {
  const s = String(href ?? '').trim()
  const hash = s.indexOf('#')
  const path = hash < 0 ? s : s.slice(0, hash)
  const fragment = hash < 0 ? '' : s.slice(hash + 1)

  let raw = path
  try {
    // href 里的中文 / 空格通常是百分号转义的，而压缩包条目名是字面量
    raw = decodeURIComponent(path)
  } catch {
    /* 忽略转义错误 */
  }

  const baseDir = String(base ?? '').replace(/[^/]*$/, '')
  const parts = (raw.startsWith('/') ? raw.slice(1) : baseDir + raw).split('/')
  const out = []
  for (const seg of parts) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return { path: out.join('/'), fragment }
}

/** 取目录部分（含末尾斜杠）。base='OEBPS/content.opf' → 'OEBPS/' */
export function dirOf(path) {
  const s = String(path ?? '')
  const i = s.lastIndexOf('/')
  return i < 0 ? '' : s.slice(0, i + 1)
}

/**
 * 以「某个文件」为基准解析链接，比 resolveZipPath 多一层语义：
 * `#note1` 这种只有锚点的链接指向的是**这个文件本身**，不是它所在的目录。
 *
 * @param {string} baseFile 基准文件在包内的路径（如 'OEBPS/text/ch2.xhtml'）
 * @returns {{ path:string, fragment:string }}
 */
export function resolveHref(baseFile, href) {
  const s = String(href ?? '').trim()
  const hash = s.indexOf('#')
  const path = hash < 0 ? s : s.slice(0, hash)
  const fragment = hash < 0 ? '' : s.slice(hash + 1)
  if (!path) return { path: String(baseFile ?? ''), fragment }
  return { path: resolveZipPath(dirOf(baseFile), path).path, fragment }
}
