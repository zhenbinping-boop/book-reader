import test from 'node:test'
import assert from 'node:assert/strict'
import {readPdfPosition,pdfScrollTop} from '../src/lib/pdfPosition.js'
const sizes=[{height:800},{height:1000},{height:600}]
test('PDF 记录同一页内的连续位置，不只记页码',()=>{
  assert.deepEqual(readPdfPosition([12,824,1836],sizes,1,1324),{scrollPage:2,pageOffset:.5})
})
test('PDF 同倍率编码后恢复同一像素位置',()=>{
  const offsets=[12,824,1836]
  const saved=readPdfPosition(offsets,sizes,1,1324)
  assert.equal(pdfScrollTop(saved,offsets,sizes,1),1324)
})
test('PDF 缩放和旋屏按页内比例恢复',()=>{
  const saved=readPdfPosition([12,824,1836],sizes,1,1324)
  assert.equal(pdfScrollTop(saved,[12,424,936],sizes,.5),674)
})
test('旧版只有页码时默认恢复页首',()=>{
  assert.equal(pdfScrollTop({scrollPage:2},[12,824,1836],sizes,1),824)
})
test('PDF 无效的页号和比例被限制在文档范围内',()=>{
  assert.equal(pdfScrollTop({scrollPage:999,pageOffset:2},[12,824,1836],sizes,1),2436)
  assert.equal(pdfScrollTop({scrollPage:NaN,pageOffset:NaN},[12,824,1836],sizes,1),12)
})
