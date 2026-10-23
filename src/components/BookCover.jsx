import { coverVariant } from '../lib/library'

export default function BookCover({ book, className = '' }) {
  const original = book.cover && !book.artCover
  return <span data-script={/\p{Script=Han}/u.test(book.title) ? 'han' : 'latin'} className={`book-cover-art ${original ? 'original-cover' : 'generated-cover'} cover-variant-${coverVariant(book)} ${className}`}>
    {original ? <img src={book.cover} alt="" /> : <>
      <span className="book-title-slip"><span>{book.title || '未命名'}</span></span>
      <span className="book-cover-author">{book.author || '私人藏书'}</span>
    </>}
  </span>
}
