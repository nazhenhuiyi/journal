import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Cloud,
  GitBranch,
  Image as ImageIcon,
  Map,
  MessageCircle,
  PenLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const productScreens = [
  {
    title: "早上先留一句",
    eyebrow: "今日",
    description:
      "不必先想好标题。等公交、喝茶、走到街口的时候，先把一句话和当下的天气留下来。",
    image: "/product/ios-today.png",
    alt: "且留此刻 iOS 今日页，正在记录一条关于成都清晨的碎碎念",
    icon: MessageCircle,
  },
  {
    title: "下午看见路线",
    eyebrow: "照片地图",
    description:
      "成都、都江堰、峨眉山、雅安、康定和乐山的照片与碎碎念，会在地图上连成自己的四川轨迹。",
    image: "/product/ios-photo-map.png",
    alt: "且留此刻 iOS 照片地图，显示四川内的照片和文字记录",
    icon: Map,
  },
  {
    title: "晚上回到那一天",
    eyebrow: "日记回看",
    description:
      "点开某一天，文字、照片、地点和时间留在同一个页面里，像把当天重新摊开看一遍。",
    image: "/product/ios-review-day.png",
    alt: "且留此刻 iOS 日记详情页，展示一日文字、照片和位置记录",
    icon: CalendarClock,
  },
];

const productPillars = [
  {
    title: "记录从一秒钟开始",
    description:
      "长文、碎碎念和照片都算记录。它不要求你每天完成一篇漂亮文章，只把入口放得足够轻。",
    icon: PenLine,
  },
  {
    title: "地图记得身体去过哪里",
    description:
      "照片定位和手动位置都能进入照片地图；这组演示数据专注四川，让路线更像真实生活。",
    icon: Map,
  },
  {
    title: "桌面和移动读同一套日记",
    description:
      "Electron 桌面端和 Expo 移动端共享 Markdown 结构，回到电脑前也能继续写。",
    icon: Cloud,
  },
  {
    title: "同步留在自己的仓库",
    description:
      "通过 GitHub 私有仓库同步，日记、media 和 manifest 都保留清楚的文件约定。",
    icon: ShieldCheck,
  },
];

const moments = [
  "人民公园茶社的一杯盖碗茶",
  "都江堰南桥边的水声",
  "峨眉山雾里的一段石阶",
  "康定傍晚吹过折多河的风",
];

const principles = ["不催打卡", "空白也算数", "少一点管理感", "多一点在场感"];

export default function Home() {
  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <section
        id="top"
        aria-labelledby="hero-title"
        className="relative flex min-h-[78svh] flex-col overflow-hidden bg-stone-950 text-white"
      >
        <Image
          className="absolute inset-0 z-0 object-cover object-[72%_50%]"
          src="/product/ios-photo-map.png"
          alt=""
          fill
          priority
          sizes="100vw"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 bg-[linear-gradient(90deg,rgb(12_10_9/0.96)_0%,rgb(12_10_9/0.88)_32%,rgb(12_10_9/0.28)_72%),linear-gradient(180deg,rgb(12_10_9/0.18)_0%,rgb(12_10_9/0.10)_58%,var(--color-background)_100%)] max-sm:bg-[linear-gradient(180deg,rgb(12_10_9/0.88)_0%,rgb(12_10_9/0.76)_52%,rgb(12_10_9/0.42)_100%)]"
        />

        <header className="relative z-20 mx-auto flex w-[min(1120px,calc(100%-48px))] items-center justify-between gap-6 py-5 max-sm:w-[calc(100%-32px)]">
          <a
            className="inline-flex shrink-0 items-center gap-2.5 text-base font-bold text-white"
            href="#top"
            aria-label="且留此刻首页"
          >
            <Image
              className="rounded-md"
              src="/brand/qieliu-logo.png"
              alt=""
              width={40}
              height={40}
              priority
            />
            <span>且留此刻</span>
          </a>
          <nav
            className="flex items-center justify-center gap-7 text-sm font-semibold text-white/72 max-md:hidden"
            aria-label="官网导航"
          >
            <a className="transition-colors hover:text-white" href="#story">
              使用场景
            </a>
            <a className="transition-colors hover:text-white" href="#screens">
              产品截图
            </a>
            <a className="transition-colors hover:text-white" href="#sync">
              数据与同步
            </a>
            <Link className="transition-colors hover:text-white" href="/blog">
              Blog
            </Link>
          </nav>
          <a
            className="inline-flex size-10 items-center justify-center rounded-full border border-white/20 bg-white/12 text-white backdrop-blur-md transition-colors hover:bg-white/20"
            href="#sync"
            aria-label="查看私有同步"
          >
            <GitBranch size={18} aria-hidden="true" />
          </a>
        </header>

        <div className="relative z-20 mx-auto flex w-[min(1120px,calc(100%-48px))] flex-1 items-center py-14 pb-24 max-sm:w-[calc(100%-32px)] max-sm:items-start max-sm:pt-14">
          <div className="max-w-[650px]">
            <p className="text-sm font-bold text-teal-50/82">
              一个用户的四川记录
            </p>
            <h1
              id="hero-title"
              className="mt-5 font-serif text-7xl font-bold leading-[1.03] text-white max-md:text-6xl max-sm:text-5xl"
            >
              且留此刻
            </h1>
            <p className="mt-5 text-2xl font-bold leading-relaxed text-white max-sm:text-xl">
              我不想管理人生，只想把今天轻轻留下。
            </p>
            <p className="mt-4 max-w-xl text-[1.06rem] leading-8 text-white/76 max-sm:text-base">
              从成都的一句碎碎念，到峨眉山路上的一张照片，再到康定傍晚的位置。
              且留此刻把文字、照片和地图放回同一段真实生活里。
            </p>
            <div
              className="mt-8 flex flex-wrap gap-3 max-sm:flex-col"
              aria-label="官网主要入口"
            >
              <a
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-white shadow-[0_16px_32px_rgb(0_120_111/0.24)] transition hover:-translate-y-0.5 hover:bg-primary-hover"
                href="#screens"
              >
                <ImageIcon size={19} aria-hidden="true" />
                <span>看真实截图</span>
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/18 bg-white/12 px-5 text-sm font-bold text-white backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/18"
                href="#story"
              >
                <Sparkles size={18} aria-hidden="true" />
                <span>看使用故事</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="story" className="bg-background py-24 max-sm:py-18">
        <div className="mx-auto grid w-[min(1120px,calc(100%-48px))] items-start gap-14 md:grid-cols-[minmax(0,0.84fr)_minmax(320px,0.58fr)] max-sm:w-[calc(100%-32px)]">
          <div>
            <p className="text-sm font-bold text-primary">使用场景</p>
            <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
              一天里不完整的片刻，最后会自己连起来。
            </h2>
            <p className="mt-5 text-base leading-8 text-stone-600">
              我早上在人民公园写下一句话，中午把南桥的水声配上一张照片，
              晚上才想起还有一段路没有定位。且留不会把这些东西逼成一篇文章，
              只让它们保持当时的样子。
            </p>
          </div>

          <div className="grid gap-2.5" aria-label="四川记录片段">
            {moments.map((moment, index) => (
              <div
                className="grid grid-cols-[40px_1fr] items-center gap-3 rounded-lg border border-border bg-surface p-4"
                key={moment}
              >
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary-soft text-sm font-extrabold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-bold leading-6 text-stone-800">
                  {moment}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="screens"
        className="border-y border-border/70 bg-[linear-gradient(180deg,var(--color-stone-50),var(--color-background))] py-24 max-sm:py-18"
      >
        <div className="mx-auto w-[min(1120px,calc(100%-48px))] max-sm:w-[calc(100%-32px)]">
          <div className="mb-10 grid items-end gap-x-14 gap-y-7 md:grid-cols-[minmax(0,0.74fr)_minmax(280px,0.48fr)]">
            <div>
              <p className="text-sm font-bold text-primary">真实产品截图</p>
              <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
                这些画面来自 iOS 模拟器里的真实应用。
              </h2>
            </div>
            <p className="text-base leading-8 text-stone-600">
              截图使用一组看似真实的四川演示数据：文字、照片和坐标都写进移动端日记目录，
              再从 App 页面中直接截取。
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {productScreens.map((screen) => (
              <ProductScreen key={screen.title} screen={screen} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-background py-24 max-sm:py-18">
        <div className="mx-auto w-[min(1120px,calc(100%-48px))] max-sm:w-[calc(100%-32px)]">
          <div className="mb-9 max-w-3xl">
            <p className="text-sm font-bold text-primary">产品能力</p>
            <h2 className="mt-3 font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
              温柔的外表下面，是可迁移的数据结构。
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {productPillars.map((pillar) => {
              const Icon = pillar.icon;

              return (
                <article
                  className="min-h-62 rounded-lg border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(12_10_9/0.03)] max-sm:min-h-0"
                  key={pillar.title}
                >
                  <span className="inline-flex size-10 items-center justify-center rounded-full border border-primary/20 bg-primary-soft text-primary">
                    <Icon size={21} aria-hidden="true" />
                  </span>
                  <h3 className="mt-7 text-lg font-bold leading-snug text-stone-900">
                    {pillar.title}
                  </h3>
                  <p className="mt-3 text-[0.96rem] leading-7 text-stone-600">
                    {pillar.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="sync"
        className="bg-[linear-gradient(135deg,rgb(12_10_9/0.94),rgb(0_120_111/0.86))] py-24 text-white max-sm:py-18"
      >
        <div className="mx-auto grid w-[min(1120px,calc(100%-48px))] items-center gap-16 md:grid-cols-[minmax(0,0.86fr)_minmax(360px,0.74fr)] max-sm:w-[calc(100%-32px)]">
          <div>
            <p className="text-sm font-bold text-teal-50/80">数据与同步</p>
            <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight max-sm:text-3xl">
              我写下来的东西，应该留在自己的路径里。
            </h2>
            <p className="mt-5 text-base leading-8 text-white/75">
              且留用共享核心读写 Markdown，并通过 Git 同步核心在桌面端和移动端之间保持一致。
              同步不是云服务黑盒，而是一条可以解释、可以追踪、可以验收的路径。
            </p>
          </div>

          <div className="grid gap-3" aria-label="同步路径">
            {[
              ["01", "本地写入", "日记、碎碎念、照片和 manifest 先落在本机。"],
              ["02", "核心调度", "共享同步包处理待同步路径、冲突边界和状态回流。"],
              ["03", "私有仓库", "通过 GitHub 私有仓库，把记录带到另一台设备。"],
            ].map(([step, title, description]) => (
              <div
                className="rounded-lg border border-white/15 bg-white/10 p-5"
                key={step}
              >
                <span className="text-xs font-extrabold text-teal-50/65">
                  {step}
                </span>
                <strong className="mt-2.5 block text-base font-bold text-white">
                  {title}
                </strong>
                <p className="mt-2 text-sm leading-7 text-white/75">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(180deg,var(--color-background),var(--color-stone-50))] py-24 text-center max-sm:py-18">
        <div className="mx-auto w-[min(900px,calc(100%-48px))] max-sm:w-[calc(100%-32px)]">
          <p className="text-sm font-bold text-primary">且留的判断</p>
          <h2 className="mx-auto mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
            记录不是为了管理人生，而是确认自己曾经真实地在场。
          </h2>
          <div
            className="mt-8 flex flex-wrap justify-center gap-2.5"
            aria-label="产品原则"
          >
            {principles.map((principle) => (
              <span
                className="inline-flex min-h-9 items-center rounded-full border border-border bg-white px-4 text-sm font-bold text-stone-700"
                key={principle}
              >
                {principle}
              </span>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex w-[min(1120px,calc(100%-48px))] items-center justify-between gap-6 py-6 max-sm:w-[calc(100%-32px)] max-sm:flex-col max-sm:items-start">
          <a
            className="inline-flex items-center gap-2.5 text-base font-bold text-stone-900"
            href="#top"
            aria-label="回到且留此刻首页"
          >
            <Image
              className="rounded-md"
              src="/brand/qieliu-logo.png"
              alt=""
              width={34}
              height={34}
            />
            <span>且留此刻</span>
          </a>
          <p className="text-sm text-muted-foreground">万物有迹，心事且留。</p>
        </div>
      </footer>
    </main>
  );
}

function ProductScreen({
  screen,
}: {
  screen: (typeof productScreens)[number];
}) {
  const Icon = screen.icon;

  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-[0_16px_50px_rgb(28_25_23/0.06)]">
      <div className="relative aspect-[393/852] overflow-hidden rounded-lg border border-stone-900/10 bg-stone-100">
        <Image
          className="object-cover"
          src={screen.image}
          alt={screen.alt}
          fill
          sizes="(min-width: 768px) 31vw, 92vw"
        />
      </div>
      <div className="pt-5">
        <span className="inline-flex items-center gap-2 text-xs font-extrabold text-primary">
          <Icon size={16} aria-hidden="true" />
          {screen.eyebrow}
        </span>
        <h3 className="mt-2 text-lg font-bold leading-snug text-stone-900">
          {screen.title}
        </h3>
        <p className="mt-3 text-[0.96rem] leading-7 text-stone-600">
          {screen.description}
        </p>
      </div>
    </article>
  );
}
