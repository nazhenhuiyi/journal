# Agent Notes

- 这是日记应用的 monorepo 根目录。根目录只放跨项目通用规则；桌面端、移动端和共享包的细节放在各自目录的 `AGENTS.md`。
- 进入某个 workspace 修改代码前，先阅读该目录下的 `AGENTS.md`。如果本文件和子目录说明冲突，以更靠近被修改文件的说明为准。
- 工作区包括 `apps/desktop`、`apps/mobile`、`packages/journal-core`、`packages/journal-sync`。
- 不要把某个子项目的约定写回根目录，比如桌面端视觉验收、移动端模拟器验收、共享包同步细节等。
- 使用 npm workspaces。运行单个项目命令时优先使用 `npm --workspace <workspace-name> run <script>`。
- 测试使用 Vitest。完整校验从根目录运行 `npm test`；不要传 Jest 专用参数，比如 `--runInBand`。
- 修改共享包时，同时考虑桌面端和移动端调用方；修改应用端时，优先复用共享包能力，不要把同一套领域逻辑复制到双端。
- 不要清理或回滚与当前任务无关的未提交改动。
