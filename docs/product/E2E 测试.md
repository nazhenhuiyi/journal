# E2E 测试

本项目测试分为 unit、integration 和 E2E 三层。E2E 目前分成四类：桌面端本地核心路径、移动端原生核心路径、桌面应用层真实同步、共享同步核心真实 GitHub 回归。默认 E2E 命令仍只跑已有桌面和 GitHub 同步链路；移动端 Maestro E2E 需要本机安装 Maestro CLI 和可用的 iOS Simulator、Android Emulator 或真机，因此单独运行。

推荐分层：

- Unit: 纯函数、parser/serializer、状态展示、调度状态机。
- Integration: Electron/Expo 适配层、文件系统、SecureStore、hook 与 mock store 的组合。
- E2E: 真实 Electron 窗口、真实 GitHub 测试仓库、跨进程 preload/main/renderer 链路。

## Unit 与 integration

根目录完整 Vitest 校验：

```sh
pnpm test
```

`pnpm test` 会先跑 unit，再跑 integration。桌面端 workspace 的 `test` 只代表桌面端 unit；桌面端 integration 需要显式运行：

```sh
pnpm run test:unit
pnpm run test:integration
pnpm run test:desktop
pnpm run test:desktop:integration
```

桌面端 integration 文件使用 `*.integration.test.tsx` / `*.integration.test.ts` 命名，覆盖路由、hook、mock preload store、同步协调等多模块协作。不要把依赖真实浏览器、真实网络、完整应用启动、跨页面流程、持久化、同步状态或多个系统协作的 case 放回 unit suite。

## E2E

运行全部 E2E：

```sh
pnpm run e2e
```

移动端原生 E2E 单独运行：

```sh
pnpm run e2e:mobile
```

## Desktop local app E2E

运行：

```sh
pnpm run e2e:desktop
```

这个命令会先构建桌面端，再用 Playwright 的 Electron driver 启动真实 Electron 应用。测试会设置：

- `JOURNAL_DIR=<tmp>/journal`
- `JOURNAL_USER_DATA_DIR=<tmp>/user-data`
- `JOURNAL_DISABLE_WEATHER=1`

因此它不会读取或写入真实 `~/.journal`，也不会请求天气服务。当前覆盖：

- 今日书写页能打开，CodeMirror 正文编辑器可定位。
- 输入长日记正文后会自动保存到隔离 journal 目录。
- 刷新 Electron 页面后能重新加载已保存正文。
- 切到回看模式后能渲染已保存正文。
- 新建碎碎念后会自动保存到隔离 journal 目录。
- 刷新后能重新加载碎碎念，回看模式能渲染碎碎念。
- 删除碎碎念后会自动保存，刷新和回看模式都不会重新出现已删除内容。
- 日历能列出历史日记、打开指定日期，并在切换日期前保存未落盘编辑到对应日期文件。
- 设置页同步面板和关键按钮存在，未配置 Git 同步状态可见，危险远端地址会显示错误。
- 损坏 Markdown 会显示 diagnostics banner。

## Desktop sync app E2E

运行：

```sh
pnpm run e2e:desktop:sync
```

这条测试需要 `JOURNAL_E2E_GITHUB_REMOTE_URL` 和 `JOURNAL_E2E_GITHUB_TOKEN`。它使用真实 Electron 应用和专用 GitHub 测试仓库，但仍然使用隔离 journal 目录和隔离 Electron userData。

当前覆盖：

- 通过 preload IPC 调用 Electron main 保存同步配置和 GitHub token。
- Electron main 将 token 写入应用 userData 下的加密凭据文件。
- 重新加载桌面应用后，renderer 能读取配置好的同步状态。
- 在真实 CodeMirror 编辑器输入日记正文，并等待应用自动保存到隔离 journal 目录。
- 进入设置页，点击真实 UI 的“立即同步”。
- 通过 GitHub 测试仓库 clone 临时分支，确认远端存在这篇日记。
- 检查本地和 clone 后仓库都附着在 `refs/heads/<branch>`，避免 detached HEAD。
- 检查没有短 ref 残留，例如 `.git/<branch>` 或 `.git/main`。

为了避免 token 进入失败截图或 trace，这条 secret E2E 关闭了 screenshot、video 和 trace；token 不会输入到可见 UI，只通过 preload API 进入主进程。

## GitHub sync core E2E

运行：

```sh
JOURNAL_E2E_GITHUB_REMOTE_URL=https://github.com/<owner>/<repo>.git \
JOURNAL_E2E_GITHUB_TOKEN=<token> \
pnpm run e2e:sync:github
```

如果没有设置 `JOURNAL_E2E_GITHUB_REMOTE_URL` 和 `JOURNAL_E2E_GITHUB_TOKEN`，测试会自动跳过。

建议准备一个专用私有仓库，例如 `journal-sync-e2e-private`。不要使用真实日记仓库。token 使用 GitHub fine-grained personal access token：

- Repository access: 只选择这个 E2E 私有仓库。
- Permissions: `Contents: Read and write`。
- 不要把 token 提交到代码仓库。

本地可以把 token 放在 `.env.e2e.local`，Playwright 会自动读取这个文件；这个文件会被现有 `*.local` gitignore 规则忽略。CI 中使用 GitHub Actions secret，例如：

- `JOURNAL_E2E_GITHUB_REMOTE_URL`
- `JOURNAL_E2E_GITHUB_TOKEN`
- 可选：`JOURNAL_E2E_GITHUB_USERNAME`
- 可选：`JOURNAL_E2E_GITHUB_BRANCH_PREFIX`
- 可选：`JOURNAL_E2E_GITHUB_KEEP_BRANCH=1`

测试行为：

- 每次创建独立分支，默认前缀是 `e2e/playwright`。
- 在临时 worktree 写入一篇测试日记。
- 通过 `@journal/sync` 真实 push 到 GitHub。
- 再 clone 同一分支，确认远端内容存在。
- 检查本地和 clone 后仓库都附着在 `refs/heads/<branch>`，避免 detached HEAD。
- 检查没有短 ref 残留，例如 `.git/<branch>`。
- 测试结束后默认删除远端 E2E 分支。

失败排查时可以临时设置 `JOURNAL_E2E_GITHUB_KEEP_BRANCH=1` 保留分支。

## Mobile native E2E

移动端 E2E 使用 [Maestro React Native 支持](https://docs.maestro.dev/get-started/supported-platform/react-native)。稳定主路径遵循 [Expo E2E with Maestro](https://docs.expo.dev/eas/workflows/examples/e2e-tests/) 的思路：先构建出可直接启动的 native artifact，再用 Maestro `launchApp` 跑 flow。这个路径不启动 Metro，不依赖 Expo Dev Client deep link，是移动端可信质量门禁。

真机调试、development build、`adb reverse`、日志截图和键盘遮挡回归经验见 [移动端真机调试手册](./移动端真机调试手册.md)。这些属于调试路径，不等于完整 E2E 基线。

运行前安装 Maestro CLI，并确保当前 shell 能直接使用 Java 17+。如果不想把 Maestro 放进 `PATH`，可以显式设置 `MAESTRO_CLI`；如果系统默认 Java 不是 17+，先设置 `JAVA_HOME`。

稳定 iOS Simulator 路径：

```sh
# 先构建 simulator .app，例如用 Xcode/xcodebuild 产出 Release-iphonesimulator/app.app
# 然后启动一个 iPhone Simulator，runner 会自动选择已启动的 iPhone。
JOURNAL_MOBILE_E2E_IOS_APP_PATH=apps/mobile/build/ios/Build/Products/Release-iphonesimulator/app.app \
pnpm run e2e:mobile:ios
```

稳定 Android 路径：

```sh
# 先构建可直接启动的 APK，例如 preview/release APK。
adb devices -l
JOURNAL_MOBILE_E2E_DEVICE_ID=<device-serial> \
JOURNAL_MOBILE_E2E_ANDROID_APK_PATH=apps/mobile/android/app/build/outputs/apk/release/app-release.apk \
pnpm run e2e:mobile:android
```

runner 在 artifact 模式下会先安装给定 `.app` / `.apk`，再让 `_launch-app.yaml` 执行 Maestro `launchApp`。flow 里不要写 Expo URL、localhost、`openLink` 或 `clearState`。需要清状态时由 runner 的安装阶段处理，避免 `launchApp clearState` 和 Dev Client deep link 互相竞态。

本地快速调试路径只保留少量 smoke：

```sh
pnpm run e2e:mobile:ios:dev
JOURNAL_MOBILE_E2E_DEVICE_ID=<device-serial> pnpm run e2e:mobile:android:dev
```

这个路径会启动 Expo native dev server、预热 Metro bundle、打开已安装的 Dev Client，然后只跑 `dev-client-smoke-flow.yaml`。它适合确认本机 Dev Client 能进主界面，不作为完整 E2E 门禁。

常用环境变量：

- `JOURNAL_MOBILE_E2E_MODE=artifact|dev-client`：默认 `artifact`。
- `JOURNAL_MOBILE_E2E_PLATFORM=ios|android`：平台；推荐通过 `e2e:mobile:ios` / `e2e:mobile:android` 脚本设置。
- `JOURNAL_MOBILE_E2E_IOS_APP_PATH`：稳定 iOS E2E 的 simulator `.app` 路径。
- `JOURNAL_MOBILE_E2E_ANDROID_APK_PATH`：稳定 Android E2E 的 APK 路径。
- `JOURNAL_MOBILE_E2E_APP_ID`：iOS 默认 `app.zilin.journal`；Android artifact 默认 `app.zilin.journal`，Dev Client 默认 `app.zilin.journal.debug`。
- `JOURNAL_MOBILE_E2E_DEVICE_ID`：iOS 可省略，runner 会选已启动的 iOS Simulator；Android 必填，先用 `adb devices -l` 确认 serial。
- `JOURNAL_MOBILE_E2E_REINSTALL_DRIVER=1`：默认复用 Maestro 已安装的设备端 driver；只有 driver 异常或首次安装失败时再打开这个开关强制重装。

flow 编写约定：

- 尽量使用 `testID`，不要依赖中文按钮文案或页面标题。
- 长 URL、token、长正文优先用 `setClipboard` + `pasteText`，避免逐字输入抖动。
- 稳定 flow 统一从 `_launch-app.yaml` 启动；Dev Client smoke 统一从 `_launch-dev-client.yaml` 等待 runner 已打开的应用。

默认命令不会跑真实 GitHub 同步 flow，只跑不访问外网的移动端核心路径和同步配置校验。要运行真实 GitHub 同步 flow，必须显式开启，并提供移动端专用 env：

```sh
JOURNAL_MOBILE_E2E_ENABLE_SYNC=1 \
JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL=https://github.com/you/journal-sync.git \
JOURNAL_MOBILE_E2E_SYNC_TOKEN=ghp_xxx \
pnpm run e2e:mobile:ios
```

可选项：

- `JOURNAL_MOBILE_E2E_SYNC_BRANCH=mobile-e2e/manual`：指定同步分支；不指定时默认使用 `mobile-e2e/<runId>` 临时分支。
- `JOURNAL_MOBILE_E2E_SYNC_KEEP_BRANCH=1`：保留自动创建的临时分支用于排查；默认会在运行后清理。

如果调试 Dev Client smoke 时已经自己启动了 Expo，可以跳过自动启动：

```sh
JOURNAL_MOBILE_E2E_MODE=dev-client \
JOURNAL_MOBILE_E2E_SKIP_EXPO_START=1 \
EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID=manual-mobile-e2e \
pnpm run e2e:mobile:ios
```

跳过自动启动时，已经运行的 Expo server 必须带同一个 `EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID`。否则应用会落回默认移动端数据目录，runner 会直接失败。

每次移动端 E2E 都会使用 run id 隔离本地 worktree、同步配置 key、pending paths 和 widget snapshot，避免写到正常调试数据。

稳定 artifact E2E 当前覆盖：

- 打开移动端今日页，通过 `testID` 定位核心入口。
- 新增碎碎念，验证内容出现，然后进入日记列表和回顾页。
- 多次进入回顾页，交替使用页面返回按钮和系统 Back，验证最终仍回到今日页。
- 进入同步配置，使用 `setClipboard` + `pasteText` 填写长远端 URL 和 token，验证危险远端地址不会保存成功。
- 显式开启真实同步 flow 时，使用 E2E 注入的同步配置和 token，点击“立即同步”，验证同步完成状态，并在回到今日后显示已同步。

## 脚本速查

```sh
pnpm run e2e                 # desktop local app + desktop app sync + sync core
pnpm run e2e:desktop         # 只跑不访问外网的 Electron 本地核心路径
pnpm run e2e:desktop:sync    # 跑桌面应用层真实 GitHub 同步
pnpm run e2e:mobile:ios      # 跑 iOS Simulator Maestro 原生 E2E
pnpm run e2e:mobile:android  # 跑 Android 真机/模拟器 Maestro 原生 E2E
pnpm run e2e:mobile:ios:dev  # 跑 iOS Dev Client 快速 smoke
pnpm run e2e:mobile:android:dev # 跑 Android Dev Client 快速 smoke
pnpm run e2e:sync:github     # 跑共享 sync core 真实 GitHub 同步
pnpm test                    # unit + integration
pnpm run test:unit           # 所有 workspace unit
pnpm run test:integration    # integration，目前包括桌面端 integration
```
