# Agent Notes

- 这个目录是共享同步包，包名是 `@journal/sync`。
- 这里负责跨端共用的同步调度和 Git 同步核心。桌面端和移动端只提供平台适配。
- Git 实现统一使用 `isomorphic-git`。不要重新加入系统 `git` 命令行 fallback。
- 共享核心不直接保存 token，不直接读取平台配置，也不直接依赖 Electron、Expo 或 React Native。
- 平台差异通过 runtime 注入：文件系统、HTTP、凭据、日志和应用生命周期由应用端处理。
- 同步跟踪范围固定为 `entries/`、`media/`、`annotations/`、`manifest.json`。
- 分支引用要使用完整引用，比如 `refs/heads/main`，避免产生短 ref 或游离 `HEAD`。
- 同步操作要保持单飞：同一时间只跑一个 Git 操作；新的请求应该排队或标记 pending。
- 重试要克制，不能形成密集提交或密集推送。
- 冲突策略目前是后写入者优先。修改冲突策略前，要同时更新测试和产品文档。
- 测试使用 Vitest。运行 `npm --workspace @journal/sync run test` 和 `npm --workspace @journal/sync run typecheck`。
