import { Link } from 'react-router'
import { Feather, MapPin, StickyNote, type HandDrawnIcon } from './HandDrawnIcons'
import bookshopMotifImage from '../assets/postcard-motifs/bookshop-ticket.png'
import riverMotifImage from '../assets/postcard-motifs/river-light.png'
import foundPostmarkImage from '../assets/postmarks/found.png'
import springPostmarkImage from '../assets/postmarks/spring.png'
import stickyPinImage from '../assets/sticky-pin.svg'
import type { EchoObjectCard } from '../domain/dailyCuration'

export type StickyObjectCardData = {
  title: string
  meta: string
  body: string
  tone?: string
  icon?: HandDrawnIcon
}

export type PostcardObjectCardData = {
  place: string
  date: string
  dateTime: string
  title: string
  body: string
  tone?: string
  image?: string
  imageAlt?: string
  stampImage?: string
  motifImage?: string
  connection?: string
  href?: string
}

export type PolaroidObjectCardData = {
  title: string
  date: string
  dateTime: string
  place: string
  temperature: string
  caption: string
  excerpt: string
  image?: string
  imageAlt?: string
  tone?: string
  href?: string
}

export type LibraryObjectCardData = {
  archiveNo: string
  shelf: string
  title: string
  author: string
  cardNo: string
  dueDate: string
  rows: Array<{
    date: string
    dateTime?: string
    borrower: string
    note: string
  }>
}

export type ReceiptObjectCardData = {
  shop: string
  label: string
  date: string
  dateTime: string
  time: string
  cashier: string
  orderNo: string
  items: Array<{ name: string; qty: string }>
  subtotal: string
  discount: string
  tax: string
  total: string
  payment: string
  change: string
  footer: string
}

export type MovieTicketObjectCardData = {
  cinema: string
  badge: string
  title: string
  subtitle: string
  date: string
  dateTime: string
  time: string
  hall: string
  row: string
  seat: string
  mood: string
  genre: string
  rating: string
  cast: string[]
  note: string
  ticketNo: string
  screen: string
  action?: {
    label: string
    to: string
  }
}

export function StickyObjectCard({ note }: { note: StickyObjectCardData }) {
  const Icon = note.icon ?? StickyNote

  return (
    <article className={`journal-sticky-card is-${note.tone ?? 'honey'}`}>
      <span className="journal-sticky-pin" aria-hidden="true">
        <img alt="" src={stickyPinImage} />
      </span>
      <div className="journal-sticky-meta">
        <Icon aria-hidden="true" size={17} strokeWidth={2.12} />
        <span>{note.meta}</span>
      </div>
      <h3>{note.title}</h3>
      <p>{note.body}</p>
    </article>
  )
}

export function PostcardObjectCard({ postcard }: { postcard: PostcardObjectCardData }) {
  const tone = postcard.tone ?? 'river'
  const motifImage = postcard.motifImage ?? (tone === 'bookshop' ? bookshopMotifImage : riverMotifImage)
  const stampImage = postcard.stampImage ?? (tone === 'bookshop' ? foundPostmarkImage : springPostmarkImage)
  const content = (
    <article className={`journal-postcard is-${tone}`}>
      <img alt="" aria-hidden="true" className="journal-postcard-motif" src={motifImage} />
      <div className={`journal-postcard-photo ${postcard.image ? '' : 'is-empty'}`}>
        {postcard.image ? (
          <img alt={postcard.imageAlt ?? postcard.title} className="journal-postcard-image" src={postcard.image} />
        ) : (
          <div className="journal-postcard-image journal-postcard-placeholder" aria-hidden="true">
            <strong>{postcard.date.slice(5, 10)}</strong>
          </div>
        )}
        <span aria-hidden="true">FILM</span>
      </div>
      <div className="journal-postcard-divider" aria-hidden="true" />
      <div className="journal-postcard-copy">
        <div className="journal-postcard-topline">
          <div>
            <div className="journal-postcard-place">
              <MapPin aria-hidden="true" size={16} strokeWidth={2.1} />
              <span>{postcard.place}</span>
            </div>
            <time dateTime={postcard.dateTime}>{postcard.date}</time>
          </div>
          <img alt="" aria-hidden="true" className="journal-postcard-stamp" src={stampImage} />
        </div>
        <span className="journal-postcard-kicker">POST CARD</span>
        <h3>{postcard.title}</h3>
        <p>{postcard.body}</p>
        {postcard.connection ? <small className="journal-postcard-connection">{postcard.connection}</small> : null}
        <div className="journal-postcard-address" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="journal-postcard-code" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </article>
  )

  return postcard.href ? (
    <Link aria-label={`打开 ${postcard.dateTime} 的日记`} to={postcard.href}>
      {content}
    </Link>
  ) : content
}

export function PolaroidObjectCard({
  snapshot,
  isFlipped = false,
}: {
  snapshot: PolaroidObjectCardData
  isFlipped?: boolean
}) {
  const content = (
    <article
      className={`journal-polaroid-card is-${snapshot.tone ?? 'paper'} ${isFlipped ? 'is-flipped' : ''}`}
      aria-labelledby={`polaroid-card-title-${slugText(snapshot.title)}`}
    >
      <div className="journal-polaroid-card-inner">
        <div className="journal-polaroid-face journal-polaroid-front">
          <div className={`journal-polaroid-photo ${snapshot.image ? '' : 'is-empty'}`}>
            {snapshot.image ? (
              <img alt={snapshot.imageAlt ?? snapshot.title} draggable="false" src={snapshot.image} />
            ) : (
              <div className="journal-polaroid-placeholder" aria-hidden="true">
                <strong>{snapshot.date.slice(5, 10)}</strong>
              </div>
            )}
            <span aria-hidden="true" className="journal-polaroid-develop" />
          </div>
          <div className="journal-polaroid-caption">
            <div>
              <h4 id={`polaroid-card-title-${slugText(snapshot.title)}`}>{snapshot.title}</h4>
              <p>{snapshot.caption}</p>
            </div>
            <time dateTime={snapshot.dateTime}>{snapshot.date}</time>
          </div>
        </div>

        <div className="journal-polaroid-face journal-polaroid-back" aria-hidden={!isFlipped}>
          <span>MEMORY SNAPSHOT</span>
          <p>{snapshot.excerpt}</p>
          <dl>
            <div>
              <dt>地点</dt>
              <dd>{snapshot.place}</dd>
            </div>
            <div>
              <dt>色温</dt>
              <dd>{snapshot.temperature}</dd>
            </div>
          </dl>
        </div>
      </div>
    </article>
  )

  return snapshot.href ? (
    <Link aria-label={`打开 ${snapshot.dateTime} 的日记`} to={snapshot.href}>
      {content}
    </Link>
  ) : content
}

export function LibraryObjectCard({ card }: { card: LibraryObjectCardData }) {
  return (
    <article className="journal-library-card" aria-labelledby={`library-card-title-${slugText(card.title)}`}>
      <div className="journal-library-card-header">
        <div>
          <span>回忆借阅卡</span>
          <h4 id={`library-card-title-${slugText(card.title)}`}>{card.title}</h4>
          <p>{card.author}</p>
        </div>
        <strong>{card.cardNo}</strong>
      </div>

      <div className="journal-library-card-meta">
        <span>馆藏号 {card.archiveNo}</span>
        <span>书架 {card.shelf}</span>
      </div>

      <div className="journal-library-ledger" role="table" aria-label="借阅记录">
        <div className="journal-library-ledger-head" role="row">
          <span role="columnheader">时间</span>
          <span role="columnheader">片段</span>
          <span role="columnheader">备注</span>
        </div>
        {card.rows.map((row) => (
          <div className="journal-library-ledger-row" role="row" key={`${row.date}-${row.borrower}`}>
            <time dateTime={row.dateTime ?? row.date} role="cell">
              {row.date}
            </time>
            <span role="cell">{row.borrower}</span>
            <span role="cell">{row.note}</span>
          </div>
        ))}
      </div>

      <div className="journal-library-card-footer">
        <div className="journal-library-pocket" aria-hidden="true">
          <span>回看提示</span>
          <strong>{card.dueDate}</strong>
        </div>
        <div className="journal-library-stamp" aria-hidden="true">
          <span>已收录</span>
          <span>旧日可借</span>
        </div>
      </div>
    </article>
  )
}

export function ReceiptObjectCard({
  receipt,
  stamp = 'SAVED',
  isTorn = false,
  printKey = 0,
}: {
  receipt: ReceiptObjectCardData
  stamp?: string
  isTorn?: boolean
  printKey?: number
}) {
  return (
    <article
      className={`journal-receipt ${isTorn ? 'is-torn' : ''}`}
      aria-labelledby={`daily-receipt-title-${slugText(receipt.label)}`}
      data-print-key={printKey}
    >
      <div className="journal-receipt-tear" aria-hidden="true" />

      <header className="journal-receipt-header">
        <span>{receipt.shop}</span>
        <h4 id={`daily-receipt-title-${slugText(receipt.label)}`}>{receipt.label}</h4>
        <p>生活结算单 / day end close</p>
      </header>

      <dl className="journal-receipt-meta">
        <div>
          <dt>DATE</dt>
          <dd>
            <time dateTime={receipt.dateTime}>{receipt.date}</time>
          </dd>
        </div>
        <div>
          <dt>TIME</dt>
          <dd>{receipt.time}</dd>
        </div>
        <div>
          <dt>CASHIER</dt>
          <dd>{receipt.cashier}</dd>
        </div>
        <div>
          <dt>ORDER #</dt>
          <dd>{receipt.orderNo}</dd>
        </div>
      </dl>

      <div className="journal-receipt-rule" aria-hidden="true" />

      <div className="journal-receipt-items" role="table" aria-label="今日小票条目">
        <div className="journal-receipt-row is-head" role="row">
          <span role="columnheader">ITEM</span>
          <span role="columnheader">QTY</span>
        </div>
        {receipt.items.map((item) => (
          <div className="journal-receipt-row" role="row" key={item.name}>
            <span role="cell">{item.name}</span>
            <span role="cell">{item.qty}</span>
          </div>
        ))}
      </div>

      <div className="journal-receipt-rule" aria-hidden="true" />

      <dl className="journal-receipt-totals">
        <div>
          <dt>SUBTOTAL</dt>
          <dd>{receipt.subtotal}</dd>
        </div>
        <div>
          <dt>DISCOUNT</dt>
          <dd>{receipt.discount}</dd>
        </div>
        <div>
          <dt>TAX</dt>
          <dd>{receipt.tax}</dd>
        </div>
        <div className="is-total">
          <dt>TOTAL</dt>
          <dd>{receipt.total}</dd>
        </div>
        <div>
          <dt>PAYMENT</dt>
          <dd>{receipt.payment}</dd>
        </div>
        <div>
          <dt>CHANGE</dt>
          <dd>{receipt.change}</dd>
        </div>
      </dl>

      <p className="journal-receipt-footer">{receipt.footer}</p>
      <span className="journal-receipt-stamp" aria-label={`当前盖章 ${stamp}`}>
        {stamp}
      </span>
      <div className="journal-receipt-tear is-bottom" aria-hidden="true" />
    </article>
  )
}

export function MovieTicketObjectCard({ ticket }: { ticket: MovieTicketObjectCardData }) {
  return (
    <article className="journal-movie-ticket" aria-labelledby={`movie-ticket-title-${slugText(ticket.title)}`}>
      <div className="journal-movie-ticket-main">
        <div className="journal-movie-ticket-topline">
          <span>{ticket.cinema}</span>
          <span>{ticket.badge}</span>
        </div>

        <div className="journal-movie-marquee">
          <span>NOW SHOWING</span>
          <h4 id={`movie-ticket-title-${slugText(ticket.title)}`}>{ticket.title}</h4>
          <em>{ticket.subtitle}</em>
          <p>{ticket.note}</p>
        </div>

        <dl className="journal-movie-ticket-grid">
          <div>
            <dt>DATE</dt>
            <dd>
              <time dateTime={ticket.dateTime}>{ticket.date}</time>
            </dd>
          </div>
          <div>
            <dt>TIME</dt>
            <dd>{ticket.time}</dd>
          </div>
          <div>
            <dt>THEATER</dt>
            <dd>{ticket.hall}</dd>
          </div>
          <div>
            <dt>MOOD</dt>
            <dd>{ticket.mood}</dd>
          </div>
          <div>
            <dt>GENRE</dt>
            <dd>{ticket.genre}</dd>
          </div>
          <div>
            <dt>RATING</dt>
            <dd>{ticket.rating}</dd>
          </div>
        </dl>

        <div className="journal-movie-cast">
          <span>STARRING</span>
          <p>{ticket.cast.join(' / ')}</p>
        </div>
      </div>

      <div className="journal-movie-ticket-seam" aria-hidden="true" />

      <aside className="journal-movie-ticket-stub" aria-label="电影票副券">
        <span className="journal-movie-stub-kicker">KEEP STUB</span>
        <div>
          <span>ROW</span>
          <strong>{ticket.row}</strong>
        </div>
        <div>
          <span>SEAT</span>
          <strong>{ticket.seat}</strong>
        </div>
        <div>
          <span>SCREEN</span>
          <strong>{ticket.screen}</strong>
        </div>
        {ticket.action ? (
          <Link className="journal-movie-ticket-action" to={ticket.action.to}>
            {ticket.action.label}
          </Link>
        ) : (
          <small>{ticket.ticketNo}</small>
        )}
      </aside>
    </article>
  )
}

export function EchoObjectCardRenderer({
  object,
  resolveImageSrc = (src) => src,
}: {
  object: EchoObjectCard
  resolveImageSrc?: (src: string) => string
}) {
  if (object.style === 'sticky') {
    return (
      <StickyObjectCard
        note={{
          body: object.body,
          icon: object.tone === 'mist' ? Feather : StickyNote,
          meta: object.meta ?? '轻连接',
          title: object.title,
          tone: object.tone,
        }}
      />
    )
  }

  if (object.style === 'postcard') {
    return (
      <PostcardObjectCard
        postcard={{
          body: object.body,
          date: formatObjectCardDate(object.date ?? object.source?.date),
          dateTime: object.date ?? object.source?.date ?? '',
          href: object.source ? `/calendar?date=${encodeURIComponent(object.source.date)}` : undefined,
          image: object.image ? resolveImageSrc(object.image.src) : undefined,
          imageAlt: object.image?.alt,
          connection: object.connection ?? object.caption,
          place: object.place ?? object.meta ?? '旧日记',
          title: object.title,
          tone: object.tone,
        }}
      />
    )
  }

  if (object.style === 'polaroid') {
    return (
      <PolaroidObjectCard
        snapshot={{
          caption: object.caption ?? object.connection ?? '这张旧页今天又显影了一点。',
          date: formatObjectCardDate(object.date ?? object.source?.date),
          dateTime: object.date ?? object.source?.date ?? '',
          excerpt: object.source?.excerpt ?? object.body,
          href: object.source ? `/calendar?date=${encodeURIComponent(object.source.date)}` : undefined,
          image: object.image ? resolveImageSrc(object.image.src) : undefined,
          imageAlt: object.image?.alt,
          place: object.place ?? object.meta ?? '旧日记',
          temperature: object.meta ?? '旧光',
          title: object.title,
          tone: object.tone,
        }}
      />
    )
  }

  if (object.style === 'library-card') {
    return (
      <LibraryObjectCard
        card={{
          archiveNo: object.meta?.replace(/^馆藏号\s*/, '') ?? 'MEMORY',
          author: object.source ? `${formatObjectCardDate(object.source.date)} · ${object.source.title}` : '今日回声',
          cardNo: 'CARD',
          dueDate: '今天再借一次',
          rows:
            object.rows?.map((row) => ({
              borrower: row.value,
              date: row.label,
              dateTime: row.dateTime,
              note: row.note,
            })) ?? [],
          shelf: object.place ?? '今日回声',
          title: object.title,
        }}
      />
    )
  }

  if (object.style === 'receipt') {
    return (
      <ReceiptObjectCard
        receipt={{
          cashier: 'self',
          change: object.items?.find((item) => item.label === '找零')?.value ?? '一点旧光',
          date: formatObjectCardDate(object.date),
          dateTime: object.date ?? '',
          discount: object.items?.find((item) => item.label === '天气')?.value ?? '今日天气',
          footer: 'Thank you for keeping a page.',
          items: (object.items ?? []).map((item) => ({ name: item.label, qty: item.value })),
          label: object.title,
          orderNo: object.meta ?? 'ECHO-01',
          payment: '注意力',
          shop: 'ECHO MART',
          subtotal: object.items?.find((item) => item.label === '今天')?.value ?? '今天',
          tax: '一点回看',
          time: 'today',
          total: object.items?.find((item) => item.label === '回声')?.value ?? object.body,
        }}
      />
    )
  }

  return (
    <MovieTicketObjectCard
      ticket={{
        action: object.action,
        badge: 'ADMIT ONE',
        cast: [object.source?.title ?? '旧页', '今天', '一句回应'],
        cinema: '回声放映所',
        date: formatObjectCardDate(object.date),
        dateTime: object.date ?? '',
        genre: '继续写',
        hall: '窗边 1 号厅',
        mood: '轻轻接住',
        note: object.body,
        rating: 'G',
        row: 'A',
        screen: 'ECHO',
        seat: '01',
        subtitle: '把旧页递回来',
        ticketNo: object.meta ?? 'ECHO-TICKET',
        time: 'today',
        title: object.title,
      }}
    />
  )
}

function formatObjectCardDate(date: string | undefined) {
  return date ? date.replace(/-/g, '.') : '今日'
}

function slugText(value: string) {
  return value.replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '') || 'card'
}
