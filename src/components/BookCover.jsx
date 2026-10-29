import { coverTitle, coverVariant } from '../lib/library'

export default function BookCover({ book, className = '' }) {
  const original = book.cover && !book.artCover
  const title = coverTitle(book.title)
  const titleSize = Math.min(11, (title.isHan ? 70 : 120) / Math.max(title.length, 1))
  return <span data-script={title.isHan ? 'han' : 'latin'} style={{ '--cover-title-size': `${titleSize}cqw` }} className={`book-cover-art ${original ? 'original-cover' : 'generated-cover'} cover-variant-${coverVariant(book)} ${className}`}>
    {original ? <img src={book.cover} alt="" /> : <>
      <span className="book-title-slip"><span>{title.text}</span></span>
      <span className="book-cover-author">{book.author || '私人藏书'}</span>
    </>}
  </span>
}
