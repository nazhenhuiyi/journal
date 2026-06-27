import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Home } from "lucide-react";
import { getBlogPost, getBlogPosts } from "../posts";

type BlogPostPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  const blogPosts = await getBlogPosts();

  return blogPosts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    return {
      title: "文章未找到 | 且留此刻",
    };
  }

  return {
    title: `${post.title} | 且留此刻`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      images: [
        {
          url: "/hero/qieliu-hero.webp",
          width: 2400,
          height: 1351,
          alt: "且留此刻产品界面氛围图",
        },
      ],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex w-[min(960px,calc(100%-48px))] items-center justify-between gap-6 py-5 max-sm:w-[calc(100%-32px)]">
          <Link
            className="inline-flex shrink-0 items-center gap-2.5 text-base font-bold text-stone-900"
            href="/"
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
          </Link>
          <nav
            className="flex items-center gap-3 text-sm font-semibold text-stone-700"
            aria-label="文章导航"
          >
            <Link
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-900/10 bg-white px-4 transition-colors hover:text-primary"
              href="/blog"
            >
              <BookOpen size={17} aria-hidden="true" />
              <span className="max-sm:hidden">Blog</span>
            </Link>
            <Link
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-900/10 bg-white px-4 transition-colors hover:text-primary"
              href="/"
            >
              <Home size={17} aria-hidden="true" />
              <span className="max-sm:hidden">首页</span>
            </Link>
          </nav>
        </div>
      </header>

      <article>
        <section className="bg-[linear-gradient(180deg,var(--color-stone-50),var(--color-background))] py-16 max-sm:py-12">
          <div className="mx-auto w-[min(820px,calc(100%-48px))] max-sm:w-[calc(100%-32px)]">
            <Link
              className="inline-flex items-center gap-2 text-sm font-bold text-primary transition-colors hover:text-primary-hover"
              href="/blog"
            >
              <ArrowLeft size={17} aria-hidden="true" />
              <span>回到 Blog</span>
            </Link>
            <div className="mt-8 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
              <span className="rounded-full bg-primary-soft px-3 py-1 text-primary">
                {post.category}
              </span>
              <time dateTime={post.date}>{post.date}</time>
              <span>{post.readingTime}</span>
            </div>
            <h1 className="mt-5 text-balance font-serif text-[clamp(2.55rem,5vw,3rem)] font-bold leading-tight text-stone-900">
              {post.title}
            </h1>
            <p className="mt-5 text-xl font-semibold leading-9 text-stone-700 max-sm:text-lg">
              {post.subtitle}
            </p>
          </div>
        </section>

        <div className="mx-auto w-[min(820px,calc(100%-48px))] py-14 max-sm:w-[calc(100%-32px)]">
          <div
            className="space-y-5 text-[1.05rem] leading-9 text-stone-700 [&_a]:font-bold [&_a]:text-primary [&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-5 [&_blockquote]:text-stone-600 [&_h2]:mt-11 [&_h2]:font-serif [&_h2]:text-3xl [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-stone-900 [&_h2]:first:mt-0 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_p]:text-stone-700 [&_strong]:font-bold [&_strong]:text-stone-900 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 max-sm:[&_h2]:text-2xl"
            dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          />
        </div>
      </article>
    </main>
  );
}
