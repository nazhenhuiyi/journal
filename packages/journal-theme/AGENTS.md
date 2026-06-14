# Agent Notes

- 这个目录是共享主题 token 包，包名是 `@journal/theme`。
- 这里应保持平台无关。不要引入 Electron、React Native、浏览器 API、文件系统或业务逻辑。
- `tokens.json` 是主题 token 的结构化来源；`tokens.css` 暴露 CSS 变量；`src/index.ts` 暴露 TypeScript 和原生端可用的解析后 token。
- 修改颜色、圆角或间距 token 时，要同时考虑桌面端 Tailwind/CSS 使用方和移动端 `semanticColors`、`spacingPixels`、`radiusPixels` 使用方。
- 不要在应用端复制主题常量；跨端通用的颜色、间距和圆角优先放到这里。
- 保留 `legacy` token，除非已经确认桌面端兼容别名都不再使用。
- 测试使用 Vitest。运行 `pnpm --filter @journal/theme run test` 和 `pnpm --filter @journal/theme run typecheck`。
