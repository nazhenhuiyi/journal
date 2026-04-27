import { useState } from 'react'
import { BookOpen, Feather, MapPin, Stamp, StickyNote, type HandDrawnIcon } from '../../components/HandDrawnIcons'
import bookshopMotifImage from '../../assets/postcard-motifs/bookshop-ticket.png'
import riverMotifImage from '../../assets/postcard-motifs/river-light.png'
import bookshopTicketImage from '../../assets/postcards/bookshop-ticket.png'
import riverLightImage from '../../assets/postcards/river-light.png'
import foundPostmarkImage from '../../assets/postmarks/found.png'
import springPostmarkImage from '../../assets/postmarks/spring.png'
import stickyPinImage from '../../assets/sticky-pin.svg'

const stickyNotes: Array<{
  title: string
  meta: string
  body: string
  tone: string
  icon: HandDrawnIcon
}> = [
  {
    title: '一句话',
    meta: '碎碎念 · 08:24',
    body: '今天的风把窗帘吹得很轻，像有人在旁边翻书。',
    tone: 'honey',
    icon: StickyNote,
  },
  {
    title: '待安放',
    meta: '灵感 · 午后',
    body: '把那张车票和咖啡杯旁边的照片放在同一页。',
    tone: 'mist',
    icon: Feather,
  },
  {
    title: '回头看',
    meta: '提醒 · 周末',
    body: '整理三月的照片，挑出三张真的想留下的。',
    tone: 'leaf',
    icon: StickyNote,
  },
]

const postcards: Array<{
  place: string
  date: string
  dateTime: string
  title: string
  body: string
  stampImage: string
  motifImage: string
  tone: string
  image: string
  imageAlt: string
}> = [
  {
    place: '苏州河边',
    date: '2025.04.12',
    dateTime: '2025-04-12',
    title: '水面有一层碎光',
    body: '桥下有人吹口琴，傍晚慢慢落到杯沿上。',
    stampImage: springPostmarkImage,
    motifImage: riverMotifImage,
    tone: 'river',
    image: riverLightImage,
    imageAlt: '傍晚河面上有一束碎金色的反光',
  },
  {
    place: '旧书店',
    date: '2024.11.03',
    dateTime: '2024-11-03',
    title: '夹在书页里的票根',
    body: '封底写着别人的名字，像一段被悄悄寄来的天气。',
    stampImage: foundPostmarkImage,
    motifImage: bookshopMotifImage,
    tone: 'bookshop',
    image: bookshopTicketImage,
    imageAlt: '旧书页间夹着一张泛黄票根',
  },
]

const cdTracks = ['出门前又找了一遍钥匙', '便利店的灯比雨天更亮', '没发出去的那条消息', '回家后把杯子洗干净']

type ReceiptVariant = {
  id: string
  tabLabel: string
  actionLabel: string
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

const dailyReceipts: ReceiptVariant[] = [
  {
    id: 'literal',
    tabLabel: '日常',
    actionLabel: '今日结算',
    shop: 'JOURNAL MART',
    label: 'DAILY RECEIPT',
    date: '2026.04.27',
    dateTime: '2026-04-27',
    time: '23:48',
    cashier: 'self',
    orderNo: '0427-2348',
    items: [
      { name: '早上犹豫了一会儿', qty: '1' },
      { name: '热咖啡前的勇气', qty: '2' },
      { name: '未读消息', qty: '5' },
      { name: '小小松一口气', qty: '1' },
      { name: '没有戴耳机的散步', qty: '1' },
      { name: '差点说出口的话', qty: '1' },
    ],
    subtotal: '漫长的一天',
    discount: '一句好听的话',
    tax: '想太多',
    total: '还在这里',
    payment: '注意力',
    change: '明天',
    footer: 'Thank you for staying.',
  },
  {
    id: 'emotional',
    tabLabel: '情绪',
    actionLabel: '情绪结算',
    shop: 'MOOD COUNTER',
    label: 'EMOTIONAL RECEIPT',
    date: '2026.04.27',
    dateTime: '2026-04-27',
    time: '23:49',
    cashier: 'heart',
    orderNo: 'MOOD-427',
    items: [
      { name: '焦虑库存', qty: '7' },
      { name: '突然开心', qty: '1' },
      { name: '想念但没说', qty: '3' },
      { name: '被一句话救到', qty: '1' },
      { name: '过度复盘', qty: '4' },
      { name: '晚风补偿', qty: '2' },
    ],
    subtotal: '情绪很贵',
    discount: '朋友回了一句',
    tax: '反复想',
    total: '可以睡了',
    payment: '诚实',
    change: '六分钟安静',
    footer: 'No refund on feelings.',
  },
  {
    id: 'quiet',
    tabLabel: '安静',
    actionLabel: '低声结算',
    shop: 'QUIET STORE',
    label: 'SOFT RECEIPT',
    date: '2026.04.27',
    dateTime: '2026-04-27',
    time: '23:51',
    cashier: 'window',
    orderNo: 'SOFT-051',
    items: [
      { name: '灯下坐了一会儿', qty: '1' },
      { name: '洗干净的杯子', qty: '1' },
      { name: '没再追问自己', qty: '1' },
      { name: '窗外的车声', qty: '6' },
      { name: '早一点关掉屏幕', qty: '1' },
      { name: '把今天放回今天', qty: '1' },
    ],
    subtotal: '很轻的一页',
    discount: '没有催自己',
    tax: '一点疲惫',
    total: '够了',
    payment: '呼吸',
    change: '一个好梦',
    footer: 'Come back when ready.',
  },
]

const receiptStamps = ['SAVED', 'SURVIVED', 'VOID']

const movieTicket = {
  cinema: '暮色日记放映所',
  badge: 'ADMIT ONE',
  title: '雨停以后',
  subtitle: '去买一杯热咖啡',
  date: '2026.04.27',
  dateTime: '2026-04-27',
  time: '20:16',
  hall: '窗边 3 号厅',
  row: 'B',
  seat: '07',
  mood: '平静 / 有点累',
  genre: '城市散步',
  rating: 'PG-13',
  cast: ['我', '雨后的路灯', '一条没发出去的消息'],
  note: '下班后没有马上回家，沿着便利店和梧桐树走了一小段。杯子很烫，心里慢慢安静下来。',
  ticketNo: 'JRNL-0427-2016',
  screen: 'MEMORY 03',
}

const libraryCard = {
  archiveNo: 'MEM-2024-1103',
  shelf: '旧回忆 / 城市散步',
  title: '旧书店门口等雨停',
  author: '2024.11.03 · 平江路旁',
  cardNo: 'CARD 017',
  dueDate: '下次下雨时',
  rows: [
    {
      date: '15:42',
      dateTime: '2024-11-03T15:42',
      borrower: '旧书店',
      note: '买了一本薄薄的散文集',
    },
    {
      date: '16:18',
      dateTime: '2024-11-03T16:18',
      borrower: '门口雨棚',
      note: '鞋尖湿了，塑料袋一直响',
    },
    {
      date: '17:06',
      dateTime: '2024-11-03T17:06',
      borrower: '46 路公交',
      note: '车窗起雾，票根夹在第 27 页',
    },
  ],
}

function StickyNoteCard({ note }: { note: (typeof stickyNotes)[number] }) {
  const Icon = note.icon

  return (
    <article className={`journal-sticky-card is-${note.tone}`}>
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

function PostcardCard({ postcard }: { postcard: (typeof postcards)[number] }) {
  return (
    <article className={`journal-postcard is-${postcard.tone}`}>
      <img alt="" aria-hidden="true" className="journal-postcard-motif" src={postcard.motifImage} />
      <div className="journal-postcard-photo">
        <img alt={postcard.imageAlt} className="journal-postcard-image" src={postcard.image} />
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
          <img alt="" aria-hidden="true" className="journal-postcard-stamp" src={postcard.stampImage} />
        </div>
        <span className="journal-postcard-kicker">POST CARD</span>
        <h3>{postcard.title}</h3>
        <p>{postcard.body}</p>
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
}

function MovieTicketCard({ ticket }: { ticket: typeof movieTicket }) {
  return (
    <article className="journal-movie-ticket" aria-labelledby="movie-ticket-title">
      <div className="journal-movie-ticket-main">
        <div className="journal-movie-ticket-topline">
          <span>{ticket.cinema}</span>
          <span>{ticket.badge}</span>
        </div>

        <div className="journal-movie-marquee">
          <span>NOW SHOWING</span>
          <h4 id="movie-ticket-title">{ticket.title}</h4>
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
        <small>{ticket.ticketNo}</small>
      </aside>
    </article>
  )
}

function LibraryBorrowCard({ card }: { card: typeof libraryCard }) {
  return (
    <article className="journal-library-card" aria-labelledby="library-card-title">
      <div className="journal-library-card-header">
        <div>
          <span>回忆借阅卡</span>
          <h4 id="library-card-title">{card.title}</h4>
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
            <time dateTime={row.dateTime} role="cell">
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

function DailyReceiptCard({
  receipt,
  stamp,
  isTorn,
  printKey,
}: {
  receipt: ReceiptVariant
  stamp: string
  isTorn: boolean
  printKey: number
}) {
  return (
    <article
      className={`journal-receipt ${isTorn ? 'is-torn' : ''}`}
      aria-labelledby="daily-receipt-title"
      data-print-key={printKey}
    >
      <div className="journal-receipt-tear" aria-hidden="true" />

      <header className="journal-receipt-header">
        <span>{receipt.shop}</span>
        <h4 id="daily-receipt-title">{receipt.label}</h4>
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

function DailyReceiptExperience() {
  const [receiptIndex, setReceiptIndex] = useState(0)
  const [stamp, setStamp] = useState(receiptStamps[0])
  const [isTorn, setIsTorn] = useState(false)
  const [printKey, setPrintKey] = useState(0)
  const receipt = dailyReceipts[receiptIndex]

  function handleSetReceipt(nextIndex: number) {
    setReceiptIndex(nextIndex)
    setPrintKey((current) => current + 1)
  }

  function handleRecalculate() {
    setReceiptIndex((current) => (current + 1) % dailyReceipts.length)
    setPrintKey((current) => current + 1)
  }

  return (
    <div className="journal-receipt-console">
      <div className="journal-receipt-controls" aria-label="今日小票交互">
        <div className="journal-receipt-control-group">
          <span>结算</span>
          <div className="journal-receipt-tabs">
            {dailyReceipts.map((option, index) => (
              <button
                aria-pressed={index === receiptIndex}
                className={index === receiptIndex ? 'is-active' : ''}
                key={option.id}
                onClick={() => handleSetReceipt(index)}
                type="button"
              >
                {option.tabLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="journal-receipt-control-group">
          <span>盖章</span>
          <div className="journal-receipt-stamp-options">
            {receiptStamps.map((option) => (
              <button
                aria-pressed={option === stamp}
                className={option === stamp ? 'is-active' : ''}
                key={option}
                onClick={() => setStamp(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="journal-receipt-actions">
          <button onClick={handleRecalculate} type="button">
            重新结算
          </button>
          <button onClick={() => setPrintKey((current) => current + 1)} type="button">
            打印
          </button>
          <button aria-pressed={isTorn} onClick={() => setIsTorn((current) => !current)} type="button">
            {isTorn ? '复原' : '撕下'}
          </button>
        </div>

        <p>{receipt.actionLabel}</p>
      </div>

      <div className="journal-receipt-print-slot" key={printKey}>
        <DailyReceiptCard receipt={receipt} stamp={stamp} isTorn={isTorn} printKey={printKey} />
      </div>
    </div>
  )
}

function RetroCdPlayerCard() {
  return (
    <article className="journal-cd-player journal-cd-player-retro" aria-labelledby="retro-cd-title">
      <div className="journal-cd-player-topline">
        <span>日记光盘</span>
        <span>2026.04.27 周一</span>
      </div>

      <div className="journal-cd-retro-body">
        <div className="journal-cd-window" aria-hidden="true">
          <div className="journal-cd-disc">
            <span />
          </div>
        </div>

        <div className="journal-cd-retro-panel">
          <div>
            <p>正在展示</p>
            <h4 id="retro-cd-title">雨停在十点半</h4>
            <div className="journal-cd-retro-notes">
              <span>窗台还有一点潮气</span>
              <span>回家路上没有绕远</span>
            </div>
          </div>
          <div className="journal-cd-progress" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>

      <div className="journal-cd-controls" aria-hidden="true">
        <span>片段 02</span>
        <span className="is-main">回看中</span>
        <span>共 04 段</span>
        <small>02:18 / 04:27</small>
      </div>
    </article>
  )
}

function MinimalCdPanelCard() {
  return (
    <article className="journal-cd-player journal-cd-player-minimal" aria-labelledby="minimal-cd-title">
      <div className="journal-cd-mini-rail" aria-hidden="true">
        <div className="journal-cd-mini-disc">
          <span />
        </div>
        <div className="journal-cd-meta-strip">
          <span>2026.04.27</span>
          <span>小雨转阴</span>
          <span>低电量 / 平静</span>
        </div>
      </div>

      <div className="journal-cd-screen">
        <div className="journal-cd-screen-topline">
          <span>今日片段</span>
          <span>第 04 页</span>
        </div>
        <h4 id="minimal-cd-title">今天没发生大事</h4>
        <ol>
          {cdTracks.map((track, index) => (
            <li key={track}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <span>{track}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="journal-cd-minimal-footer" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </article>
  )
}

function CardStyleShowcase() {
  return (
    <section aria-labelledby="card-style-title" className="all-pages-card-lab">
      <div className="all-pages-card-lab-inner">
        <div className="all-pages-card-lab-header">
          <p>卡片样张</p>
          <h2 id="card-style-title">先留几种手感</h2>
        </div>

        <div className="journal-card-style-grid">
          <div className="journal-card-family">
            <div className="journal-card-family-title">
              <StickyNote aria-hidden="true" size={19} strokeWidth={2.15} />
              <h3>便利贴</h3>
            </div>
            <div className="journal-sticky-stack">
              {stickyNotes.map((note) => (
                <StickyNoteCard key={`${note.meta}-${note.title}`} note={note} />
              ))}
            </div>
          </div>

          <div className="journal-card-family">
            <div className="journal-card-family-title">
              <Stamp aria-hidden="true" size={19} strokeWidth={2.15} />
              <h3>明信片</h3>
            </div>
            <div className="journal-postcard-stack">
              {postcards.map((postcard) => (
                <PostcardCard key={`${postcard.date}-${postcard.place}`} postcard={postcard} />
              ))}
            </div>
          </div>
        </div>

        <div className="journal-movie-showcase">
          <div className="journal-card-family-title">
            <span className="journal-movie-title-icon" aria-hidden="true" />
            <h3>电影票</h3>
          </div>

          <MovieTicketCard ticket={movieTicket} />
        </div>

        <div className="journal-library-showcase">
          <div className="journal-card-family-title">
            <BookOpen aria-hidden="true" size={19} strokeWidth={2.15} />
            <h3>回忆借阅卡</h3>
          </div>

          <LibraryBorrowCard card={libraryCard} />
        </div>

        <div className="journal-receipt-showcase">
          <div className="journal-card-family-title">
            <span className="journal-receipt-title-icon" aria-hidden="true" />
            <h3>今日小票</h3>
          </div>

          <DailyReceiptExperience />
        </div>

        <div className="journal-cd-showcase">
          <div className="journal-card-family-title">
            <span className="journal-cd-title-icon" aria-hidden="true" />
            <h3>CD 播放器</h3>
          </div>

          <div className="journal-cd-concept-grid">
            <div className="journal-cd-concept">
              <p>A · 复古实物感</p>
              <RetroCdPlayerCard />
            </div>
            <div className="journal-cd-concept">
              <p>B · 极简播放器面板</p>
              <MinimalCdPanelCard />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default CardStyleShowcase
