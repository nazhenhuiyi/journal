# Agent Notes

- 这个目录是共享数据模型和 Markdown 处理包，包名是 `@journal/core`。
- 这里应保持平台无关。不要引入 Electron、React Native、浏览器、Node 文件系统或网络请求依赖。
- 这里负责日记数据结构、front matter、Markdown 解析/序列化、碎碎念结构、批注相关类型和有意义改动判断。
- 批注数据结构需要保留，即使应用界面暂时不展示批注功能。
- 修改数据结构或序列化格式时，要同时考虑桌面端、移动端和同步仓库里的历史数据。
- 不要为了某一端 UI 的临时需求污染共享模型。应用端展示细节应留在应用端。
- 测试使用 Vitest。运行 `npm --workspace @journal/core run test` 和 `npm --workspace @journal/core run typecheck`。
