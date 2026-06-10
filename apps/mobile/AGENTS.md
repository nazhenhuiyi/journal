# Agent Notes

- 这个目录是 Expo / React Native 移动端应用。
- 移动端界面样式优先使用 NativeWind 和已有 `src/ui/` 组件，不要把桌面端布局或 CSS 习惯搬进来。
- 移动端图标优先使用 `@expo/vector-icons` 或现有主流图标库，不新增手写 icon 文件。
- 真机或模拟器验收优先使用 Expo / React Native 流程。需要二维码时运行 `npm --workspace @journal/mobile run start`；iOS 模拟器可用 `npm --workspace @journal/mobile run ios`。
- 本机 iOS 模拟器必须使用 localhost host；优先用 `npm --workspace @journal/mobile run ios`（脚本应包含 `expo start --ios --localhost`）。如果 Metro 正在提供 `exp://198.18.0.1:8081` 等非 localhost 地址，先停掉该会话，再用 localhost 重新启动。
- 移动端要特别注意安全区、键盘遮挡、中文输入稳定性和底部弹窗手势。
- Git 同步核心来自 `@journal/sync`。移动端只保留平台适配：Expo 文件系统、SecureStore 凭据、AppState 生命周期和 UI 状态。
- 不要在移动端重复实现共享 Git 流程、Markdown 数据结构或同步调度规则；这类逻辑优先放到共享包。
- 修改移动端保存或同步链路时，要确认本地保存、输入稳定窗口、离开 App 补保存、20 秒延迟推送之间的关系。
- 移动端测试使用 Vitest。运行 `npm --workspace @journal/mobile run test` 和 `npm --workspace @journal/mobile run typecheck`。
- Maestro 产物里的 `commands-*.json` 可能包含通过 `-e` 注入的 GitHub token；排查失败时优先看截图和 `maestro.log`，不要把 commands JSON 原样输出到对话里。
