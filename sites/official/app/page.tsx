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
import type { LucideIcon } from "lucide-react";

type ProductScreenCard = {
  title: string;
  eyebrow: string;
  image: string;
  alt: string;
  icon: LucideIcon;
  aspectClassName?: string;
  sizes?: string;
};

const productScreens: ProductScreenCard[] = [
  {
    title: "先记下一句",
    eyebrow: "今日",
    image: "/product/ios-today-chengdu.png",
    alt: "且留此刻今日页，展示一条成都当天的碎碎念和照片",
    icon: MessageCircle,
  },
  {
    title: "照片带上地点",
    eyebrow: "照片地图",
    image: "/product/ios-photo-map-chengdu.png",
    alt: "且留此刻照片地图，显示成都内的照片和文字记录",
    icon: Map,
  },
  {
    title: "回看某一天",
    eyebrow: "日记回看",
    image: "/product/ios-review-day-chengdu.png",
    alt: "且留此刻日记详情页，展示一日文字、照片和位置记录",
    icon: CalendarClock,
  },
];

const widgetScreens: ProductScreenCard[] = [
  {
    title: "照片也能回看",
    eyebrow: "回看小组件",
    image: "/product/ios-widget-review-photo-clean.png",
    alt: "iOS 桌面上的且留此刻回看中号小组件",
    icon: CalendarClock,
    aspectClassName: "aspect-[900/455]",
    sizes: "(min-width: 768px) 33vw, 92vw",
  },
  {
    title: "文字也能回看",
    eyebrow: "回看文字版",
    image: "/product/ios-widget-review-text-weather.png",
    alt: "iOS 桌面上的且留此刻文字版回看中号小组件，展示日期、地点和天气",
    icon: CalendarClock,
    aspectClassName: "aspect-[900/455]",
    sizes: "(min-width: 768px) 33vw, 92vw",
  },
  {
    title: "此刻先留一句",
    eyebrow: "此刻小组件",
    image: "/product/ios-widget-moment-small-balanced.png",
    alt: "iOS 桌面上的且留此刻小号小组件",
    icon: PenLine,
    aspectClassName: "aspect-[550/660]",
    sizes: "(min-width: 768px) 30vw, 92vw",
  },
];

const productPillars = [
  {
    title: "打开就是今天",
    description:
      "页面先给你一张今天的纸。想写就写一点，什么也不写也可以。",
    icon: PenLine,
  },
  {
    title: "写的时候很安静",
    description:
      "保存、同步和设置都收在边上。写字的时候，页面尽量不打扰你。",
    icon: ShieldCheck,
  },
  {
    title: "旧日慢慢回来",
    description:
      "日子放在那里。想看时，再按日期或地图慢慢翻回来。",
    icon: CalendarClock,
  },
];

const recordingFlow = [
  {
    title: "先留一句",
    description: "短一点、乱一点都可以。像给自己留张小纸条，别急着写完整。",
  },
  {
    title: "拍一张照片",
    description: "照片拍糊了也没关系。那杯茶、那片屋檐，会帮你把当时带回来。",
  },
  {
    title: "想起了再回来",
    description: "过几天又想到什么，就回来添一句。不添，也不亏欠谁。",
  },
  {
    title: "空着也没事",
    description: "没有想写的日子，就让它空着。且留不会催你。",
  },
];

const scenarioMoments = [
  "上午 10:18，成都人民公园，茶摊旁坐了一会儿",
  "下午 13:42，宽窄巷子，路过时拍了一张灰瓦屋檐",
  "下午 16:08，小通巷，没有拍照，只写下：这里像一个逗号",
  "傍晚 18:31，望江楼公园，竹影很好，照片有一点糊",
];

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
          src="/product/ios-photo-map-chengdu.png"
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
              记录方式
            </a>
            <a className="transition-colors hover:text-white" href="#scenario">
              一段样例
            </a>
            <a className="transition-colors hover:text-white" href="#screens">
              产品截图
            </a>
            <a className="transition-colors hover:text-white" href="#privacy">
              只留给自己
            </a>
            <Link className="transition-colors hover:text-white" href="/blog">
              札记
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
            <h1
              id="hero-title"
              className="font-serif text-7xl font-bold leading-[1.03] text-white max-md:text-6xl max-sm:text-5xl"
            >
              且留此刻
            </h1>
            <p className="mt-5 text-2xl font-bold leading-relaxed text-white max-sm:text-xl">
              把此刻，轻轻留下。
            </p>
            <p className="mt-4 max-w-xl text-[1.06rem] leading-8 text-white/76 max-sm:text-base">
              写下此刻，拍下眼前。地点和日期，一起留在今天。
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
                <span>看看怎么记录一天</span>
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/18 bg-white/12 px-5 text-sm font-bold text-white backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/18"
                href="#screens"
              >
                <ImageIcon size={18} aria-hidden="true" />
                <span>看产品截图</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="bg-background py-24 max-sm:py-18">
        <div className="mx-auto grid w-[min(1120px,calc(100%-48px))] items-start gap-14 md:grid-cols-[minmax(0,0.84fr)_minmax(320px,0.58fr)] max-sm:w-[calc(100%-32px)]">
          <div>
            <p className="text-sm font-bold text-primary">记录方式</p>
            <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
              不用想好怎么写，先记下来。
            </h2>
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

      <section className="bg-background pb-24 max-sm:pb-18">
        <div className="mx-auto w-[min(1120px,calc(100%-48px))] border-t border-border/70 pt-20 max-sm:w-[calc(100%-32px)]">
          <div className="mb-9 max-w-3xl">
            <p className="text-sm font-bold text-primary">且留的样子</p>
            <h2 className="mt-3 font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
              它安静一点，把位置留给你的日常。
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
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

      <section id="scenario" className="bg-background pb-24 max-sm:pb-18">
        <div className="mx-auto grid w-[min(1120px,calc(100%-48px))] items-start gap-14 border-t border-border/70 pt-20 md:grid-cols-[minmax(0,0.84fr)_minmax(320px,0.58fr)] max-sm:w-[calc(100%-32px)]">
          <div>
            <p className="text-sm font-bold text-primary">一段样例生活</p>
            <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
              这一天，在成都停过几次。
            </h2>
          </div>

          <div className="grid gap-2.5" aria-label="成都记录片段">
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
          <div className="mb-10 max-w-3xl">
            <div>
              <p className="text-sm font-bold text-primary">产品截图</p>
              <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
                那一天，会这样回到你面前。
              </h2>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {productScreens.map((screen) => (
              <ProductScreen key={screen.title} screen={screen} />
            ))}
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {widgetScreens.map((screen) => (
              <ProductScreen key={screen.title} screen={screen} />
            ))}
          </div>
        </div>
      </section>

      <section
        id="privacy"
        className="bg-[linear-gradient(135deg,rgb(12_10_9/0.94),rgb(0_120_111/0.86))] py-24 text-white max-sm:py-18"
      >
        <div className="mx-auto grid w-[min(1120px,calc(100%-48px))] items-center gap-16 md:grid-cols-[minmax(0,0.86fr)_minmax(360px,0.74fr)] max-sm:w-[calc(100%-32px)]">
          <div>
            <p className="text-sm font-bold text-teal-50/80">只留给自己</p>
            <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight max-sm:text-3xl">
              记录先留在你这里。
            </h2>
          </div>

          <div className="grid gap-3" aria-label="安心记录方式">
            {[
              ["01", "没有公开主页", "没有点赞，也没有围观压力。写下来的片刻不用拿给别人看。"],
              ["02", "本地保存", "日记先在本地，不默认推到公共空间。"],
              ["03", "私有仓库", "需要跨设备时，再放进自己的私有仓库里继续带走。"],
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
          <p className="text-sm font-bold text-primary">留到以后</p>
          <h2 className="mx-auto mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
            以后翻回来，还能认得今天的自己。
          </h2>
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
  screen: ProductScreenCard;
}) {
  const Icon = screen.icon;

  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-[0_16px_50px_rgb(28_25_23/0.06)]">
      <div
        className={`relative ${screen.aspectClassName ?? "aspect-[393/852]"} overflow-hidden rounded-lg border border-stone-900/10 bg-stone-100`}
      >
        <Image
          className="object-cover"
          src={screen.image}
          alt={screen.alt}
          fill
          sizes={screen.sizes ?? "(min-width: 768px) 31vw, 92vw"}
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
      </div>
    </article>
  );
}
