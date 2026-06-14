# Agent Notes

- 这个目录是 Electron 桌面端应用。渲染进程代码在 `src/`，Electron 主进程和预加载代码在 `electron/`。
- 桌面端视觉验收以真实 Electron 窗口为准。浏览器预览只能作为补充，不能替代 Electron 窗口检查。
- 优先使用确定性的桌面端验收工具链，不要默认靠临场手动点点看。
- 界面验收和 GitHub 同步验收要分开做。界面验收默认使用隔离日记目录，并关闭自动同步；只有用户明确要求真实同步时，才使用真实 `~/.journal` 或真实 GitHub 远端。
- 不要随手启动多个 Electron 窗口或多个开发服务器。启动前先确认是否已有相关进程；结束时只清理本轮自己启动的进程。
- 电脑操作工具（Computer Use）主要用于看真实窗口、截图和读取可访问性结构。稳定输入、点击和断言优先使用 Electron 自动化、远程调试协议、IPC 状态、可访问名称或结构化日志。
- 验证日记正文输入时，注意正文编辑器是 CodeMirror，不是普通输入框。应定位 `aria-label="日记正文"` 且 `role="textbox"` 的元素，再通过真实输入事件写入。
- 验证同步时，必须通过 `@journal/sync` 或同一套 `isomorphic-git` runtime 检查 Git 仓库事实：当前分支、同步范围内未提交改动、最近提交、`refs/remotes/origin/main` 和远端 `refs/heads/main`；低层 `.git` 布局回归可以直接读隔离测试目录中的 `.git` 文件，但不要新增系统 `git` 命令验收路径。
- 以下情况都算同步验收失败：出现游离 `HEAD`、残留 `.git/main`、密集重试提交、没有用户内容却产生提交、连续输入产生过多提交。
- 同步范围只关注 `entries/`、`media/`、`annotations/`、`reviews/`、`manifest.json`。真实仓库里其他未跟踪历史目录不要误判成同步失败。
- 保持桌面端最小宽度为 `1180px`，位置在 `src/index.css` 和 `electron/main.ts`。
- 组件样式默认使用 TailwindCSS；全局变量、应用级基础样式或 Tailwind 会降低可读性的情况，再使用普通 CSS。
- 测试使用 Vitest。完整校验从仓库根目录运行 `pnpm test`，不要传 Jest 专用参数，比如 `--runInBand`。
- 桌面端验收流程参考 [Electron 桌面端验收工具链.md](/Users/zilin/agent-projects/journal/docs/product/Electron 桌面端验收工具链.md)。
