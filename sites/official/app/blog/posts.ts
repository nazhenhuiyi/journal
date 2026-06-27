import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

export type BlogPostMeta = {
  slug: string;
  title: string;
  subtitle: string;
  date: string;
  readingTime: string;
  category: string;
  excerpt: string;
};

export type BlogPost = BlogPostMeta & {
  contentHtml: string;
};

const BLOG_CONTENT_DIR =
  process.env.JOURNAL_WEBSITE_BLOG_DIR ??
  path.join(/*turbopackIgnore: true*/ process.cwd(), "../../docs/public/blog");

function readRequiredString(
  value: unknown,
  key: keyof Omit<BlogPostMeta, "slug" | "readingTime">,
  fileName: string,
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required blog frontmatter "${key}" in ${fileName}`);
  }

  return value.trim();
}

function estimateReadingTime(markdown: string) {
  const readableCharacters = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_\-[\]()`]/g, "")
    .replace(/\s+/g, "").length;
  const minutes = Math.max(1, Math.ceil(readableCharacters / 500));

  return `约 ${minutes} 分钟`;
}

async function renderMarkdown(markdown: string) {
  const processed = await remark()
    .use(remarkGfm)
    .use(remarkHtml)
    .process(markdown);

  return processed.toString();
}

async function readBlogPostFile(fileName: string): Promise<BlogPost> {
  const filePath = path.join(BLOG_CONTENT_DIR, fileName);
  const file = await fs.readFile(filePath, "utf8");
  const { content, data } = matter(file);
  const slug = fileName.replace(/\.md$/, "");

  return {
    slug,
    title: readRequiredString(data.title, "title", fileName),
    subtitle: readRequiredString(data.subtitle, "subtitle", fileName),
    date: readRequiredString(data.date, "date", fileName),
    readingTime:
      typeof data.readingTime === "string" && data.readingTime.trim().length > 0
        ? data.readingTime.trim()
        : estimateReadingTime(content),
    category: readRequiredString(data.category, "category", fileName),
    excerpt: readRequiredString(data.excerpt, "excerpt", fileName),
    contentHtml: await renderMarkdown(content),
  };
}

export const getBlogPosts = cache(async () => {
  const fileNames = await fs.readdir(BLOG_CONTENT_DIR);
  const posts = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith(".md"))
      .map((fileName) => readBlogPostFile(fileName)),
  );

  return posts.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
});

export const getBlogPost = cache(async (slug: string) => {
  const posts = await getBlogPosts();

  return posts.find((post) => post.slug === slug);
});
