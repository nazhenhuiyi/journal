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

const recordModes = [
  {
    title: "写一页",
    description:
      "把天气、段落、清单和今天的心情收在同一页里。长一点也好，只有两行也好。",
    icon: PenLine,
  },
  {
    title: "留一句",
    description:
      "碎碎念不需要被整理成文章。想到的时候先留下，之后再慢慢看见它们的纹理。",
    icon: MessageCircle,
  },
  {
    title: "放一张照片",
    description:
      "照片、位置和当天的文字彼此连起来，让日记多一点身体记得住的证据。",
    icon: ImageIcon,
  },
];

const productPillars = [
  {
    title: "桌面与移动共用一套数据",
    description:
      "Electron 桌面端和 Expo 移动端读写同一套 Markdown 结构，记录可以在不同设备之间自然延续。",
    icon: Cloud,
  },
  {
    title: "私有仓库同步",
    description:
      "通过 GitHub 私有仓库同步，平台层只处理凭据与文件系统，核心同步逻辑保持可测试、可追踪。",
    icon: GitBranch,
  },
  {
    title: "照片地图与回顾",
    description:
      "地图、图片记录和小组件把旧日重新递到眼前，不把回顾做成任务，只做成一次温和的重逢。",
    icon: Map,
  },
  {
    title: "可读、可迁移",
    description:
      "日记不是被锁进黑盒的数据。Markdown、media 和 manifest 都保留清楚的文件约定。",
    icon: ShieldCheck,
  },
];

const principles = ["不催打卡", "空白也算数", "少一点管理感", "多一点在场感"];

export default function Home() {
  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <section
        id="top"
        aria-labelledby="hero-title"
        className="relative flex min-h-[82svh] flex-col overflow-hidden bg-stone-50"
      >
        <Image
          className="absolute inset-0 z-0 object-cover object-center"
          src="/hero/qieliu-hero.webp"
          alt=""
          fill
          priority
          sizes="100vw"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 bg-[linear-gradient(90deg,rgb(253_253_253/0.97)_0%,rgb(253_253_253/0.88)_31%,rgb(253_253_253/0.18)_68%),linear-gradient(180deg,rgb(253_253_253/0.24)_0%,rgb(253_253_253/0.08)_63%,var(--color-background)_100%)] max-sm:bg-[linear-gradient(180deg,rgb(253_253_253/0.96)_0%,rgb(253_253_253/0.86)_48%,rgb(253_253_253/0.22)_100%)]"
        />

        <header className="relative z-20 mx-auto flex w-[min(1120px,calc(100%-48px))] items-center justify-between gap-6 py-5 max-sm:w-[calc(100%-32px)]">
          <a
            className="inline-flex shrink-0 items-center gap-2.5 text-base font-bold text-stone-900"
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
            className="flex items-center justify-center gap-7 text-sm font-semibold text-stone-700 max-md:hidden"
            aria-label="官网导航"
          >
            <a className="transition-colors hover:text-primary" href="#recording">
              记录方式
            </a>
            <a className="transition-colors hover:text-primary" href="#product">
              产品能力
            </a>
            <a className="transition-colors hover:text-primary" href="#sync">
              数据与同步
            </a>
            <Link className="transition-colors hover:text-primary" href="/blog">
              Blog
            </Link>
          </nav>
          <a
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-stone-900/10 bg-white/65 px-4 text-sm font-bold text-stone-900 backdrop-blur-md transition-colors hover:text-primary max-sm:w-10 max-sm:px-0"
            href="#sync"
          >
            <GitBranch size={18} aria-hidden="true" />
            <span className="max-sm:hidden">私有同步</span>
          </a>
        </header>

        <div className="relative z-20 mx-auto flex w-[min(1120px,calc(100%-48px))] flex-1 items-center py-14 pb-24 max-sm:w-[calc(100%-32px)] max-sm:items-start max-sm:pt-14">
          <div className="max-w-[620px]">
            <p className="text-sm font-bold text-primary">
              万物有迹，心事且留
            </p>
            <h1
              id="hero-title"
              className="mt-5 font-serif text-[clamp(3.1rem,8vw,4.8rem)] font-bold leading-[1.03] text-stone-900"
            >
              且留此刻
            </h1>
            <p className="mt-5 text-[1.44rem] font-bold leading-relaxed text-stone-900 max-sm:text-xl">
              把此刻，轻轻留下。
            </p>
            <p className="mt-4 max-w-xl text-[1.06rem] leading-8 text-stone-700 max-sm:text-base">
              一个低负担的个人日记应用。写一页、留一句、放一张照片，都算数。
              它不催你完成一篇漂亮日记，只给今天一个安静的位置。
            </p>
            <div
              className="mt-8 flex flex-wrap gap-3 max-sm:flex-col"
              aria-label="官网主要入口"
            >
              <a
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-white shadow-[0_16px_32px_rgb(0_120_111/0.20)] transition hover:-translate-y-0.5 hover:bg-primary-hover"
                href="#recording"
              >
                <PenLine size={19} aria-hidden="true" />
                <span>看看怎么记录</span>
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <a
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-stone-900/10 bg-white/75 px-5 text-sm font-bold text-stone-900 backdrop-blur-md transition hover:-translate-y-0.5 hover:text-primary"
                href="#product"
              >
                <Sparkles size={18} aria-hidden="true" />
                <span>了解产品</span>
              </a>
              <Link
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-stone-900/10 bg-white/75 px-5 text-sm font-bold text-stone-900 backdrop-blur-md transition hover:-translate-y-0.5 hover:text-primary"
                href="/blog"
              >
                <span>读一篇理念</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="recording" className="bg-background py-24 max-sm:py-18">
        <div className="mx-auto w-[min(1120px,calc(100%-48px))] max-sm:w-[calc(100%-32px)]">
          <div className="mb-9 grid items-end gap-x-14 gap-y-7 md:grid-cols-[minmax(0,0.78fr)_minmax(280px,0.52fr)]">
            <div>
              <p className="text-sm font-bold text-primary">记录可以很轻</p>
              <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
                今天不必被整理成作品，也值得被留下。
              </h2>
            </div>
            <p className="text-base leading-8 text-stone-600">
              且留把日记拆成更接近日常的几种动作：一页文字、一句碎碎念、一张照片。
              你可以写得很完整，也可以只先把一个瞬间放进去。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {recordModes.map((mode) => {
              const Icon = mode.icon;

              return (
                <article
                  className="min-h-56 rounded-lg border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(12_10_9/0.03)] max-sm:min-h-0"
                  key={mode.title}
                >
                  <span className="inline-flex size-10 items-center justify-center rounded-full border border-primary/20 bg-primary-soft text-primary">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <h3 className="mt-7 text-lg font-bold leading-snug text-stone-900">
                    {mode.title}
                  </h3>
                  <p className="mt-3 text-[0.96rem] leading-7 text-stone-600">
                    {mode.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="product"
        className="border-y border-border/70 bg-[linear-gradient(180deg,var(--color-stone-50),var(--color-background))] py-24 max-sm:py-18"
      >
        <div className="mx-auto grid w-[min(1120px,calc(100%-48px))] items-center gap-16 md:grid-cols-[minmax(0,0.86fr)_minmax(360px,0.74fr)] max-sm:w-[calc(100%-32px)]">
          <div>
            <p className="text-sm font-bold text-primary">桌面、移动、回顾</p>
            <h2 className="mt-3 max-w-3xl font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
              记录在今天发生，也会在以后慢慢浮回来。
            </h2>
            <p className="mt-5 text-base leading-8 text-stone-600">
              桌面端适合安静写一页，移动端适合随手留下照片和一句话。
              回顾、小组件和照片地图负责在合适的时候，把旧日重新递给你。
            </p>
          </div>

          <div
            className="grid min-h-[430px] grid-cols-[1fr_0.86fr] grid-rows-2 gap-3.5 rounded-lg border border-border/80 bg-[linear-gradient(135deg,rgb(255_255_255/0.92),rgb(248_242_228/0.54))] p-3.5 shadow-[0_24px_70px_rgb(28_25_23/0.08)] max-sm:min-h-[520px] max-sm:grid-cols-1 max-sm:grid-rows-[1.3fr_0.7fr_0.7fr_0.7fr]"
            aria-label="产品体验示意"
          >
            <div className="row-span-2 flex min-w-0 flex-col justify-between rounded-lg border border-stone-900/10 bg-[linear-gradient(180deg,rgb(255_255_255/0.86),rgb(255_255_255/0.62)),repeating-linear-gradient(0deg,rgb(28_25_23/0.045)_0_1px,transparent_1px_28px)] p-5 max-sm:row-span-1">
              <span className="text-xs font-bold text-muted-foreground">今日</span>
              <strong className="font-serif text-3xl font-bold leading-snug text-stone-900 max-sm:text-2xl">
                窗边的雨停了。
              </strong>
              <p className="text-sm leading-7 text-stone-600">
                留一句，也是一条完整的线索。
              </p>
            </div>
            <div className="flex min-w-0 flex-col justify-end rounded-lg border border-stone-900/10 bg-[linear-gradient(135deg,rgb(200_79_49/0.10),rgb(255_255_255/0.78))] p-5 text-vermilion">
              <ImageIcon size={24} aria-hidden="true" />
              <span className="mt-3 text-xs font-bold text-muted-foreground">
                照片记录
              </span>
            </div>
            <div className="flex min-w-0 flex-col justify-end rounded-lg border border-stone-900/10 bg-white/75 p-5 text-primary">
              <Map size={24} aria-hidden="true" />
              <span className="mt-3 text-xs font-bold text-muted-foreground">
                走过的地方
              </span>
            </div>
            <div className="flex min-w-0 flex-col justify-end rounded-lg border border-stone-900/10 bg-white/75 p-5 text-teal-600">
              <CalendarClock size={24} aria-hidden="true" />
              <span className="mt-3 text-xs font-bold text-muted-foreground">
                旧日回看
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background py-24 max-sm:py-18">
        <div className="mx-auto w-[min(1120px,calc(100%-48px))] max-sm:w-[calc(100%-32px)]">
          <div className="mb-9 max-w-3xl">
            <p className="text-sm font-bold text-primary">产品能力</p>
            <h2 className="mt-3 font-serif text-[2.55rem] font-bold leading-tight text-stone-900 max-sm:text-3xl">
              安静的体验下面，是清楚的数据结构。
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
              把日记留在你自己的路径里。
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
