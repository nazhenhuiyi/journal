# Agent Notes

- 这个目录是 Expo / React Native 移动端应用。
- 移动端界面样式优先使用 NativeWind 和已有 `src/ui/` 组件，不要把桌面端布局或 CSS 习惯搬进来。
- 移动端图标优先使用 `@expo/vector-icons` 或现有主流图标库，不新增手写 icon 文件。
- 真机或模拟器验收优先使用 Expo / React Native 流程。需要二维码时运行 `pnpm --filter @journal/mobile run start`。iOS 日常 UI 走查优先保持 Metro 运行，然后用 `pnpm --filter @journal/mobile run ios:launch` 启动已安装的 dev client，避免反复通过 `exp+...` URL 冷启动；首次安装、native 依赖、config plugin、Podfile、iOS 工程或 app.json native 配置变化时再运行 `pnpm --filter @journal/mobile run ios:dev` 重建。不要手动拼 `expo start`。
- 移动端 EAS 构建默认都使用本地构建；只有用户明确要求云端构建时才使用带 `:cloud` 的脚本。Android 非 dev 安装包必须走 EAS credentials 签名，默认使用本地 EAS preview 构建：`pnpm --filter @journal/mobile run build:android:apk`。产物固定为 `apps/mobile/android/app/build/outputs/apk/release/eas-preview-local.apk`，安装到真机用 `pnpm --filter @journal/mobile run install:android:apk`。preview APK 是内嵌 JS/assets、离线可启动的 debuggable release 包；不要直接运行 `./gradlew :app:assembleRelease` 给 `app.zilin.journal` 打正式包，否则会使用本地 debug keystore，导致无法覆盖 EAS 签名的正式包。
- Android 真机调试、development build、旁路 debug 包、`adb reverse`、日志截图和键盘遮挡回归流程见 `docs/product/operations/移动端真机调试手册.md`。
- 本机 iOS 模拟器必须使用 localhost host；所有 Expo 启动脚本都会固定使用移动端 workspace 的 Expo SDK 56 CLI，iOS 入口会固定 `127.0.0.1` 和 IPv4 优先，并复用已有 localhost Metro。`ios:launch` 只调用 `simctl launch` 打开 `app.zilin.journal`，不打开 dev-client URL。Maestro Dev Client smoke 由 runner 注入 development-client URL。不要从 monorepo 根目录直接运行根 `node_modules/.bin/expo`。
- 原生小组件使用 `expo-widgets` 和 `react-native-android-widget`。这类 native target 需要 development build 或 EAS build 验收。
- 移动端要特别注意安全区、键盘遮挡、中文输入稳定性和底部弹窗手势。
- Git 同步核心来自 `@journal/sync`。移动端只保留平台适配：Expo 文件系统、SecureStore 凭据、AppState 生命周期和 UI 状态。
- 不要在移动端重复实现共享 Git 流程、Markdown 数据结构或同步调度规则；这类逻辑优先放到共享包。
- 修改移动端保存或同步链路时，要确认本地保存、输入稳定窗口、离开 App 补保存、20 秒延迟推送之间的关系。
- 移动端测试使用 Vitest。运行 `pnpm --filter @journal/mobile run test` 和 `pnpm --filter @journal/mobile run typecheck`。
- Maestro 产物里的 `commands-*.json` 可能包含通过 `-e` 注入的 GitHub token；排查失败时优先看截图和 `maestro.log`，不要把 commands JSON 原样输出到对话里。
