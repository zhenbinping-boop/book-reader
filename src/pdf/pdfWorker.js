import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

const base = import.meta.env.BASE_URL || '/'

// 中文 PDF 的 CMap 与标准字体必须走本地资源，否则缺字/乱码
export const pdfOptions = {
  cMapUrl: `${base}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${base}standard_fonts/`,
  isEvalSupported: false,
}

export { pdfjsLib }
