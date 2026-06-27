# 对外内容

这里放官网、公开介绍页和后续对外传播可以复用的 Markdown 内容。

当前官网 Blog 会在构建时读取 `blog/*.md`：

- 文件名就是文章 slug，例如 `blog/recording-is-not-a-task.md` 对应 `/blog/recording-is-not-a-task`。
- frontmatter 需要包含 `title`、`subtitle`、`date`、`category`、`excerpt`。
- `readingTime` 可选；不写时官网会按正文长度估算。

这个目录只放对外表达内容，不放应用端或共享包的实现约定。
