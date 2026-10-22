/** PDF 页内比例与像素位置互换；缩放/旋屏后仍能恢复到同一页的同一位置。 */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export function readPdfPosition(offsets, sizes, scale, scrollTop) {
  let index = 0
  for (let i=1; i<offsets.length && offsets[i]<=scrollTop; i++) index=i
  const height = (sizes[index]?.height || 1) * scale
  return { scrollPage: index+1, pageOffset: clamp((scrollTop-(offsets[index]||0))/Math.max(1,height),0,1) }
}
export function pdfScrollTop(position, offsets, sizes, scale) {
  const page = Number.isFinite(position.scrollPage) ? Math.round(position.scrollPage) : 1
  const index = clamp(page-1,0,Math.max(0,offsets.length-1))
  const fraction = Number.isFinite(position.pageOffset) ? clamp(position.pageOffset,0,1) : 0
  return (offsets[index]||0) + (sizes[index]?.height||0)*scale*fraction
}
