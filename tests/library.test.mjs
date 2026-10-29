import test from 'node:test'
import assert from 'node:assert/strict'
import { readingState, progressPercent, filterLibrary, normalizeBookDetails, normalizeNote, coverVariant, coverTitle } from '../src/lib/library.js'

test('new imports stay unread even when they have a placeholder page', () => {
 const book={pageCount:10,progress:{page:1,started:false}}
 assert.equal(readingState(book),'unread');assert.equal(progressPercent(book),0)
})
test('real reading and manual completed status use consistent filters and percentages', () => {
 const book={pageCount:10,progress:{page:3,started:true}}
 assert.equal(readingState(book),'reading');assert.equal(progressPercent(book),30)
 assert.equal(progressPercent({...book,readingStatus:'finished'}),100)
 assert.equal(readingState({...book,readingStatus:'__proto__'}),'reading')
 assert.equal(progressPercent({...book,missingFile:true}),0)
})
test('book search combines author/title/group matches with reading-state and collection filters', () => {
 const books=[{id:1,title:'浮生六记',author:'沈复',collection:'文学',readingStatus:'reading'},
 {id:2,title:'English Reader',author:'LUCY',collection:'语言',readingStatus:'unread'}]
 assert.deepEqual(filterLibrary(books,{query:'沈复',collection:'文学',status:'reading'}).map(b=>b.id),[1])
 assert.deepEqual(filterLibrary(books,{query:'lucy'}).map(b=>b.id),[2])
 assert.equal(filterLibrary(books,{query:'沈复',status:'finished'}).length,0)
 assert.equal(filterLibrary(books,{collection:'语言'}).length,1)
 assert.equal(filterLibrary(books,{query:'   '}).length,2)
})
test('book edit validates its public fields without accepting storage identity or file changes', () => {
 assert.deepEqual(normalizeBookDetails({title:'  浮生六记 ',author:' 沈复 ',collection:' 文学 ',readingStatus:'reading',id:999,format:'pdf'}),
 {title:'浮生六记',author:'沈复',collection:'文学',readingStatus:'reading',artCover:false})
 assert.throws(()=>normalizeBookDetails({title:' ',readingStatus:'reading'}),/书名/)
 assert.throws(()=>normalizeBookDetails({title:'书',readingStatus:'__proto__'}),/状态/)
})
test('note editing preserves prose and creates unique, bounded searchable tags', () => {
 assert.deepEqual(normalizeNote('第一行\n第二行','生活， 读书,生活'),{note:'第一行\n第二行',tags:['生活','读书']})
 assert.equal(normalizeNote('x'.repeat(12000),Array.from({length:20},(_,i)=>'tag'+i)).note.length,10000)
 assert.equal(normalizeNote('',Array.from({length:20},(_,i)=>'tag'+i)).tags.length,12)
})
test('generated book cover selection survives database ID changes after backup restore', () => {
 assert.equal(coverVariant({id:1,fileHash:'sha256:abc',title:'书'}),coverVariant({id:999,fileHash:'sha256:abc',title:'书'}))
 assert.equal(coverVariant({id:1,title:'浮生六记'}),coverVariant({id:999,title:'浮生六记'}))
})
test('cover title omits balanced bracketed extras without changing book metadata', () => {
 assert.equal(coverTitle('明朝那些事儿(增补版)(套装共9册)').text,'明朝那些事儿')
 assert.equal(coverTitle('浮生六记（修订版【珍藏】）').text,'浮生六记')
 assert.equal(coverTitle('A Tale [Illustrated] (2026)').text,'A Tale')
 assert.equal(coverTitle('未闭合(标题').text,'未闭合(标题')
 assert.equal(coverTitle('（唯一书名）').text,'（唯一书名）')
 assert.equal(coverTitle('漫长标题一二三四五六七八九十十一十二').text,'漫长标题一二三四五六七…')
 const original={title:'明朝那些事儿(增补版)',readingStatus:'reading'}
 coverTitle(original.title)
 assert.equal(normalizeBookDetails(original).title,original.title)
})
test('explicit cover style stays within the four available art designs', () => {
 assert.equal(coverVariant({coverStyle:2,fileHash:'sha256:any'}),2)
 assert.ok(coverVariant({coverStyle:99,title:'书'})<4)
})
test('restoring notes merges newer edits but preserves newer local thoughts', async () => {
 const {restoredNotePatch}=await import('../src/lib/library.js')
 const local={note:'本地感想',tags:['生活'],color:'yellow',createdAt:1,updatedAt:20}
 assert.equal(restoredNotePatch(local,{note:'旧备份',updatedAt:10}),null)
 assert.deepEqual(restoredNotePatch(local,{note:'新备份',tags:['读书'],color:'blue',updatedAt:30}),
 {note:'新备份',tags:['读书'],color:'blue',updatedAt:30})
})
