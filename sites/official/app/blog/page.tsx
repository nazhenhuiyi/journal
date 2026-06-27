import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Home, PenLine } from "lucide-react";
import { getBlogPosts } from "./posts";

export const metadata: Metadata = {
  title: "Blog | 且留此刻",
  description: "且留此刻的产品理念、记录方式和数据设计笔记。",
};

export default async function BlogIndexPage() {
  const blogPosts = await getBlogPosts();

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex w-[min(1120px,calc(100%-48px))] items-center justify-between gap-6 py-5 max-sm:w-[calc(100%-32px)]">
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
            aria-label="Blog 导航"
          >
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

      <section className="bg-[linear-gradient(180deg,var(--color-stone-50),var(--color-background))] py-20 max-sm:py-14">
        <div className="mx-auto w-[min(960px,calc(100%-48px))] max-sm:w-[calc(100%-32px)]">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-primary">
            <BookOpen size={17} aria-hidden="true" />
            且留 Blog
          </p>
          <h1 className="mt-5 max-w-3xl font-serif text-[3.4rem] font-bold leading-tight text-stone-900 max-sm:text-4xl">
            慢慢讲清楚，为什么要把此刻留下。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-stone-600">
            这里会写产品理念、记录方式、同步与数据结构，也写一点我们对日记这件事的判断。
          </p>
        </div>
      </section>

      <section className="py-16 max-sm:py-12">
        <div className="mx-auto grid w-[min(960px,calc(100%-48px))] gap-5 max-sm:w-[calc(100%-32px)]">
          {blogPosts.map((post) => (
            <article
              className="rounded-lg border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(12_10_9/0.03)]"
              key={post.slug}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
                <span className="rounded-full bg-primary-soft px-3 py-1 text-primary">
                  {post.category}
                </span>
                <span>{post.date}</span>
                <span>{post.readingTime}</span>
              </div>
              <h2 className="mt-5 font-serif text-3xl font-bold leading-tight text-stone-900 max-sm:text-2xl">
                {post.title}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-8 text-stone-600">
                {post.excerpt}
              </p>
              <Link
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
                href={`/blog/${post.slug}`}
              >
                <PenLine size={18} aria-hidden="true" />
                <span>读这篇</span>
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
