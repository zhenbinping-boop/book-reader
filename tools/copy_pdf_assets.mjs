// 和 Vite 一样仅依赖 Node，避免首次启动/构建漏掉中文 PDF 资源。
import { cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
for (const name of ['cmaps', 'standard_fonts']) {
  const source = fileURLToPath(new URL(`node_modules/pdfjs-dist/${name}/`, root))
  const target = fileURLToPath(new URL(`public/${name}/`, root))
  await mkdir(target, { recursive: true })
  await cp(source, target, { recursive: true })
  console.log(`pdf.js ${name} 已就绪`)
}
