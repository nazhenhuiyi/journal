# 且留

万物有迹，心事且留。

一个桌面端和移动端共用数据格式的个人日记应用。当前核心保留写日记、看日记、碎碎念、图片记录、回顾小组件和 GitHub 私有仓库同步。

桌面端使用 Electron + React，移动端使用 Expo / React Native。两端通过 `@journal/core` 读写同一套 Markdown 数据结构，并通过 `@journal/sync` 共享 `isomorphic-git` 同步核心；平台层只负责文件系统、凭据、生命周期和 UI 状态适配。

## 开发

```sh
pnpm install
pnpm run dev
```

`pnpm run dev` 默认启动桌面端。移动端可以使用：

```sh
pnpm run dev:mobile
```

## 常用命令

```sh
pnpm run typecheck
pnpm test
pnpm run lint
pnpm run build
```

`pnpm run build` 当前转发到桌面端构建，会在完成 TypeScript/Vite 构建后调用 `electron-builder` 生成桌面安装包。

`pnpm test` 会先跑 unit，再跑桌面端 integration。unit 覆盖桌面端、移动端、`journal-core`、`journal-sync` 和 `journal-theme`。

## 文档

- [产品与技术文档入口](docs/product/README.md)
- [架构与数据流](docs/product/架构与数据流.md)
- [数据结构](docs/product/数据结构.md)
- [Git 同步机制](<docs/product/Git 同步机制.md>)

## Android 打包

移动端使用 EAS Build 打包。第一次打包前先登录并把本地 Expo 项目关联到你的 Expo 账号：

```sh
pnpm --filter @journal/mobile run eas:login
pnpm --filter @journal/mobile run eas:init
```

打可直接安装的 Android APK：

```sh
pnpm run build:mobile:android
```

如果以后要上架 Google Play，打 AAB：

```sh
pnpm run build:mobile:android:aab
```

Android 包名现在是 `app.zilin.journal`，配置在 `apps/mobile/app.json`。这个值决定安卓是否把新版识别为同一个应用，第一次安装后不要随意修改。

原生小组件和 dev-client 能力需要 development build 验收：

```sh
pnpm --filter @journal/mobile run build:android:dev
pnpm --filter @journal/mobile run build:ios:dev
```

## 目录

- `apps/desktop/`: Electron + Vite 桌面端。
- `apps/mobile/`: Expo + React Native 移动端。
- `packages/journal-core/`: 跨端共享的日记数据结构、Markdown 解析与序列化、回顾、小组件和天气纯逻辑。
- `packages/journal-sync/`: 跨端共享的 Git 同步核心、调度器和合并策略。
- `packages/journal-theme/`: 跨端共享的颜色、间距、圆角等主题 token。
- `e2e/`: Playwright 桌面端和 GitHub 同步 E2E；移动端 Maestro flow 在 `apps/mobile/e2e/`。
- `docs/product/`: 产品、架构、同步和验收文档。
