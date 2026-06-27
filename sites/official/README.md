# 且留此刻官网

这是且留此刻的官方网站，使用官方 `create-next-app` 脚手架创建，基于 Next.js App Router、TypeScript 和 Tailwind CSS。

## 开发

从 monorepo 根目录运行：

```sh
pnpm run dev:website
```

也可以只针对本站运行：

```sh
pnpm --filter @journal/official-site run dev
```

## 校验

```sh
pnpm --filter @journal/official-site run typecheck
pnpm --filter @journal/official-site run lint
pnpm --filter @journal/official-site run build
```

部署时可设置 `NEXT_PUBLIC_SITE_URL`，用于生成 Open Graph 图片的绝对地址。

## Blog 内容

Blog 文章源文件放在 monorepo 根目录的 `docs/public/blog/*.md`。官网构建时读取 Markdown frontmatter 和正文，生成 `/blog` 和 `/blog/[slug]`。

如果部署环境不是从 monorepo 根目录构建，可以设置 `JOURNAL_WEBSITE_BLOG_DIR` 指向文章目录。
