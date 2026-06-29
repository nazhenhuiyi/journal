import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Image as ImageIcon,
  Map,
  MessageCircle,
  PenLine,
  ShieldCheck,
} from "lucide-react";

const productScreens = [
  {
    title: "早上先留一句",
    eyebrow: "今日",
    description:
      "不必先想好标题。等公交、喝茶、走到街口的时候，先把一句话和当下的天气留下来。",
    image: "/product/ios-today.png",
    alt: "且留此刻今日页，正在记录一条关于成都清晨的碎碎念",
    icon: MessageCircle,
  },
  {
    title: "下午看见路线",
    eyebrow: "照片地图",
    description:
      "成都、都江堰、峨眉山、雅安、康定和乐山的照片与碎碎念，会在地图上连成自己的四川轨迹。",
    image: "/product/ios-photo-map.png",
    alt: "且留此刻照片地图，显示四川内的照片和文字记录",
    icon: Map,
  },
  {
    title: "晚上回到那一天",
    eyebrow: "日记回看",
    description:
      "点开某一天，文字、照片、地点和时间留在同一个页面里，像把当天重新摊开看一遍。",
    image: "/product/ios-review-day.png",
    alt: "且留此刻日记详情页，展示一日文字、照片和位置记录",
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
    title: "照片把地点带回来",
    description:
      "一张照片可以带着当时的街口、天气和光线回来，慢慢拼成自己的生活地图。",
    icon: ImageIcon,
  },
  {
    title: "回看不是年度总结",
    description:
      "旧日会按天安静地放好。你不用整理作品，只是在某个晚上重新遇见那一天。",
    icon: CalendarClock,
  },
  {
    title: "写给自己，不写给算法",
    description:
      "且留不把记录变成动态，也不催你分享。它更像一个只替你保管片刻的房间。",
    icon: ShieldCheck,
  },
];

const recordingFlow = [
  {
    title: "今日页",
    description: "先接住一句碎碎念、一段长文，或刚拍下的一张照片。",
  },
  {
    title: "照片地图",
    description: "有地点的内容会回到地图上，慢慢显出生活走过的路线。",
  },
  {
    title: "日记回看",
    description: "同一天的文字、照片和位置会合在一起，方便以后重新翻看。",
  },
  {
    title: "私人记录",
    description: "它不把日记变成动态，也不催你分享，只负责安静地留下。",
  },
];

const scenarioMoments = [
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
            <a className="transition-colors hover:text-white" href="#product">
              产品介绍
            </a>
            <a className="transition-colors hover:text-white" href="#scenario">
              使用场景
            </a>
            <a className="transition-colors hover:text-white" href="#screens">
              产品截图
            </a>
            <a className="transition-colors hover:text-white" href="#privacy">
              安心记录
            </a>
            <Link className="transition-colors hover:text-white" href="/blog">
              Blog
            </Link>
          </nav>
          <a
            className="inline-flex size-10 items-center justify-center rounded-full border border-white/20 bg-white/12 text-white backdrop-blur-md transition-colors hover:bg-white/20"
            href="#privacy"
            aria-label="查看安心记录"
          >
            <ShieldCheck size={18} aria-hidden="true" />
          </a>
        </header>

        <div className="relative z-20 mx-auto flex w-[min(1120px,calc(100%-48px))] flex-1 items-center py-14 pb-24 max-sm:w-[calc(100%-32px)] max-sm:items-start max-sm:pt-14">
          <div className="max-w-[650px]">
            <p className="text-sm font-bold text-teal-50/82">
              私人的日常记录产品
            </p>
            <h1
              id="hero-title"
              className="mt-5 font-serif text-7xl font-bold leading-[1.03] text-white max-md:text-6xl max-sm:text-5xl"
            >
              且留此刻
            </h1>
            <p className="mt-5 text-2xl font-bold leading-relaxed text-white max-sm:text-xl">
              把碎碎念、照片和地点，留在同一条日记线里。
            </p>
            <p className="mt-4 max-w-xl text-[1.06rem] leading-8 text-white/76 max-sm:text-base">
              且留此刻从轻量的一句话开始，把当天的文字、图片和位置收在一起。
              它不是任务管理，也不是公开动态，而是一处可以慢慢回看的私人记录。
            </p>
            <div
              className="mt-8 flex flex-wrap gap-3 max-sm:flex-col"
              aria-label="官网主要入口"
            >
              <a
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-white shadow-[0_16px_32px_rgb(0_120_111/0.24)] transition hover:-translate-y-0.5 hover:bg-primary-hover"
                href="#product"
              >
                <PenLine size={19} aria-hidden="true" />
                <span>了解产品</span>
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/18 bg-white/12 px-5 text-sm font-bold text-white backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/18"
                href="#screens"
              >
                <ImageIcon size={18} aria-hidden="true" />
                <span>看真实截图</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="bg-background py-24 max-sm:py-18">
        <div className="mx-auto grid w-[min(1120px,calc(100%-48px))] items-start gap-14 md:grid-cols-[minmax(0,0.84fr)_minmax(320px,0.58fr)] max-sm:w-[calc(100%-32px)]">
          <div>
            <p className="text-sm font-bold text-primary">产品介绍</p>
            <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
              先写下，再把文字、照片和地点放回一天里。
            </h2>
            <p className="mt-5 text-base leading-8 text-stone-600">
              且留此刻是一款私人日常记录产品。它把短句、长文、照片和位置放在同一个日记结构里，
              让用户可以快速留下当下，也能在以后按日期或地图重新回到那一天。
            </p>
          </div>

          <div className="grid gap-2.5" aria-label="且留此刻记录方式">
            {recordingFlow.map((item, index) => (
              <div
                className="grid grid-cols-[40px_1fr] items-start gap-3 rounded-lg border border-border bg-surface p-4"
                key={item.title}
              >
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary-soft text-sm font-extrabold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong className="block text-sm font-bold leading-6 text-stone-900">
                    {item.title}
                  </strong>
                  <span className="mt-1 block text-sm leading-6 text-stone-600">
                    {item.description}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="scenario" className="bg-background pb-24 max-sm:pb-18">
        <div className="mx-auto grid w-[min(1120px,calc(100%-48px))] items-start gap-14 border-t border-border/70 pt-20 md:grid-cols-[minmax(0,0.84fr)_minmax(320px,0.58fr)] max-sm:w-[calc(100%-32px)]">
          <div>
            <p className="text-sm font-bold text-primary">使用场景</p>
            <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
              一天里不完整的片刻，最后会自己连起来。
            </h2>
            <p className="mt-5 text-base leading-8 text-stone-600">
              以这组四川记录为例：早上写下一句碎碎念，中午把路上的照片放进日记，
              晚上再补一段长文。且留不会把这些东西逼成一篇文章，只让它们保持当时的样子。
            </p>
          </div>

          <div className="grid gap-2.5" aria-label="四川记录片段">
            {scenarioMoments.map((moment, index) => (
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
                这些画面来自真实产品。
              </h2>
            </div>
            <p className="text-base leading-8 text-stone-600">
              我们用一组四川生活片段还原一个用户的日常：一句话、一张照片、
              一个路过的地点，最后都能回到同一段生活里。
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
              不用整理成作品，也能慢慢有迹可循。
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
        id="privacy"
        className="bg-[linear-gradient(135deg,rgb(12_10_9/0.94),rgb(0_120_111/0.86))] py-24 text-white max-sm:py-18"
      >
        <div className="mx-auto grid w-[min(1120px,calc(100%-48px))] items-center gap-16 md:grid-cols-[minmax(0,0.86fr)_minmax(360px,0.74fr)] max-sm:w-[calc(100%-32px)]">
          <div>
            <p className="text-sm font-bold text-teal-50/80">安心记录</p>
            <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight max-sm:text-3xl">
              我写下来的东西，先属于我自己。
            </h2>
            <p className="mt-5 text-base leading-8 text-white/75">
              它不需要公开，不需要点赞，也不需要每天交作业。你可以只写给未来的自己，
              也可以在换设备时，把这些记录继续带在身边。
            </p>
          </div>

          <div className="grid gap-3" aria-label="安心记录方式">
            {[
              ["01", "只为自己留下", "没有公开主页，也没有围观压力。写下来的片刻可以安静待着。"],
              ["02", "换个地方继续", "手机上随手记，回到电脑前再慢慢补，记录不会被某个场景锁住。"],
              ["03", "空白也被允许", "哪天没有写也没有关系。生活不是连续打卡，日记也不必是。"],
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
