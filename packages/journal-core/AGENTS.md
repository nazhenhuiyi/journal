# Agent Notes

- 这个目录是共享数据模型和 Markdown 处理包，包名是 `@journal/core`。
- 这里应保持平台无关。不要引入 Electron、React Native、浏览器、Node 文件系统或网络请求依赖。
- 这里负责日记数据结构、front matter、Markdown 解析/序列化、碎碎念与图片结构、内置记录主题、回顾文件、回顾 moment、小组件 snapshot、天气解析/新鲜度、批注相关类型和有意义改动判断。
- 天气能力在这里保持为纯解析和纯判断；真实定位、网络请求、权限和缓存由应用端处理。
- 批注数据结构需要保留，即使应用界面暂时不展示批注功能。
- 修改数据结构或序列化格式时，要同时考虑桌面端、移动端、原生小组件和同步仓库里的历史数据。
- 修改回顾、主题或小组件 snapshot 逻辑时，要同步考虑移动端 Review 页面、原生小组件和 `docs/product/experience/回顾与小组件推荐逻辑.md`。
- 不要为了某一端 UI 的临时需求污染共享模型。应用端展示细节应留在应用端。
- 测试使用 Vitest。运行 `pnpm --filter @journal/core run test` 和 `pnpm --filter @journal/core run typecheck`。
