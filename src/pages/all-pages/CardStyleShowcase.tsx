import { Feather, MapPin, Stamp, StickyNote, type HandDrawnIcon } from '../../components/HandDrawnIcons'
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
          <h2 id="card-style-title">先留两种手感</h2>
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
