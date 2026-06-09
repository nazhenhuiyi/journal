# E2E 测试

本项目测试分为 unit、integration 和 E2E 三层。E2E 目前分成四类：桌面端本地核心路径、移动端原生核心路径、桌面应用层真实同步、共享同步核心真实 GitHub 回归。默认 E2E 命令仍只跑已有桌面和 GitHub 同步链路；移动端 Maestro E2E 需要本机安装 Maestro CLI 和可用的 iOS Simulator、Android Emulator 或真机，因此单独运行。

推荐分层：

- Unit: 纯函数、parser/serializer、状态展示、调度状态机。
- Integration: Electron/Expo 适配层、文件系统、SecureStore、hook 与 mock store 的组合。
- E2E: 真实 Electron 窗口、真实 GitHub 测试仓库、跨进程 preload/main/renderer 链路。

## Unit 与 integration

根目录完整 Vitest 校验：

```sh
npm test
```

`npm test` 会先跑 unit，再跑 integration。桌面端 workspace 的 `test` 只代表桌面端 unit；桌面端 integration 需要显式运行：

```sh
npm run test:unit
npm run test:integration
npm run test:desktop
npm run test:desktop:integration
```

桌面端 integration 文件使用 `*.integration.test.tsx` / `*.integration.test.ts` 命名，覆盖路由、hook、mock preload store、同步协调等多模块协作。不要把依赖真实浏览器、真实网络、完整应用启动、跨页面流程、持久化、同步状态或多个系统协作的 case 放回 unit suite。

## E2E

运行全部 E2E：

```sh
npm run e2e
```

移动端原生 E2E 单独运行：

```sh
npm run e2e:mobile
```

## Desktop local app E2E

运行：

```sh
npm run e2e:desktop
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
npm run e2e:desktop:sync
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
npm run e2e:sync:github
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

移动端 E2E 使用 [Maestro](https://docs.maestro.dev/platform-support/react-native)，目标是真机或模拟器里的 React Native / Expo Go，而不是 Expo Web。Expo 官方 EAS 文档也以 [Maestro 作为 E2E 示例](https://docs.expo.dev/eas/workflows/reference/e2e-tests)。

运行前安装 Maestro CLI，并确保至少有一个 iOS Simulator、Android Emulator 或真机可用。默认命令会启动 Expo native dev server，并通过 Expo Go 开发 URL 打开应用：

```sh
npm run e2e:mobile
```

如果 `maestro` 或 Java 17 没有出现在当前 shell 的 `PATH`，runner 会优先尝试 `~/.maestro/bin/maestro` 和 Homebrew `openjdk@17`；也可以显式设置 `MAESTRO_CLI` 或 `JAVA_HOME`。

默认使用：

- `JOURNAL_MOBILE_E2E_EXPO_PORT=8081`
- `JOURNAL_MOBILE_E2E_EXPO_URL=exp://127.0.0.1:8081`
- `JOURNAL_MOBILE_E2E_APP_ID=host.exp.Exponent`（iOS Expo Go；Android Expo Go 可改为 `host.exp.exponent`）

默认命令没有 GitHub 配置时会跳过移动端同步 flow，只跑不访问外网的移动端核心路径和同步配置校验。要运行真实 GitHub 同步 flow，提供移动端专用 env，或复用共享 GitHub E2E env：

```sh
JOURNAL_MOBILE_E2E_SYNC_REMOTE_URL=https://github.com/you/journal-sync.git \
JOURNAL_MOBILE_E2E_SYNC_TOKEN=ghp_xxx \
npm run e2e:mobile
```

可选项：

- `JOURNAL_MOBILE_E2E_SYNC_BRANCH=mobile-e2e/manual`：指定同步分支；不指定时默认使用 `mobile-e2e/<runId>` 临时分支。
- `JOURNAL_MOBILE_E2E_SYNC_BRANCH_PREFIX=mobile-e2e`：修改自动临时分支前缀。
- `JOURNAL_MOBILE_E2E_SYNC_KEEP_BRANCH=1`：保留自动创建的临时分支用于排查；默认会在运行后清理。
- `JOURNAL_E2E_GITHUB_REMOTE_URL` / `JOURNAL_E2E_GITHUB_TOKEN`：如果没有移动端专用 env，runner 会复用这两个共享同步 E2E env。

如果你已经自己启动了 Expo，可以跳过自动启动：

```sh
JOURNAL_MOBILE_E2E_SKIP_EXPO_START=1 \
JOURNAL_MOBILE_E2E_EXPO_URL=exp://127.0.0.1:8081 \
npm run e2e:mobile
```

当前覆盖：

- 打开移动端今日页，定位真实 React Native 正文输入框。
- 输入长日记正文，通过设置页“保存当前”强制本地保存，并验证保存状态。
- 新增碎碎念，验证碎碎念列表出现新内容。
- 进入日记列表，验证今天的长日记内容出现在列表预览中。
- 进入回顾页，验证长日记和碎碎念摘要入口可见。
- 提供 GitHub env 时，输入未保存正文后进入设置页，填写真实 GitHub 同步配置和 token，点击“立即同步”，验证同步触发会先保存本地内容、完成真实 GitHub 同步状态，并在回到今日后显示已同步。
- 进入设置页，填写包含凭据的危险远端地址，验证同步配置保存失败状态。

## 脚本速查

```sh
npm run e2e                 # desktop local app + desktop app sync + sync core
npm run e2e:desktop         # 只跑不访问外网的 Electron 本地核心路径
npm run e2e:desktop:sync    # 跑桌面应用层真实 GitHub 同步
npm run e2e:mobile          # 跑移动端 Maestro 原生 E2E，需要模拟器/真机和 Maestro CLI
npm run e2e:sync:github     # 跑共享 sync core 真实 GitHub 同步
npm test                    # unit + integration
npm run test:unit           # 所有 workspace unit
npm run test:integration    # integration，目前包括桌面端 integration
```
