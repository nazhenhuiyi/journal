# 且留

万物有迹，心事且留。

一个桌面端和移动端共用数据格式的个人日记应用。当前核心保留写日记、看日记、碎碎念、图片记录和 GitHub 私有仓库同步。

桌面端使用 Electron + React，移动端使用 Expo / React Native。两端通过 `@journal/core` 读写同一套 Markdown 数据结构，并通过 `@journal/sync` 共享 `isomorphic-git` 同步核心；平台层只负责文件系统、凭据、生命周期和 UI 状态适配。

## 开发

```sh
npm install
npm run dev
```

`npm run dev` 默认启动桌面端。移动端可以使用：

```sh
npm run dev:mobile
```

## 常用命令

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

`npm run build` 当前转发到桌面端构建，会在完成 TypeScript/Vite 构建后调用 `electron-builder` 生成桌面安装包。

`npm test` 会先跑 unit，再跑桌面端 integration。unit 覆盖桌面端、移动端、`journal-core`、`journal-sync` 和 `journal-theme`。

## Android 打包

移动端使用 EAS Build 打包。第一次打包前先登录并把本地 Expo 项目关联到你的 Expo 账号：

```sh
npm --workspace @journal/mobile run eas:login
npm --workspace @journal/mobile run eas:init
```

打可直接安装的 Android APK：

```sh
npm run build:mobile:android
```

如果以后要上架 Google Play，打 AAB：

```sh
npm run build:mobile:android:aab
```

Android 包名现在是 `com.zilin.journal`，配置在 `apps/mobile/app.json`。这个值决定安卓是否把新版识别为同一个应用，第一次安装后不要随意修改。

## 目录

- `apps/desktop/`: Electron + Vite 桌面端。
- `apps/mobile/`: Expo + React Native 移动端。
- `packages/journal-core/`: 跨端共享的日记数据结构、Markdown 解析与序列化。
- `packages/journal-sync/`: 跨端共享的 Git 同步核心、调度器和合并策略。
- `packages/journal-theme/`: 跨端共享的颜色、间距、圆角等主题 token。
- `e2e/`: Playwright 桌面端和 GitHub 同步 E2E。
- `docs/product/`: 产品与技术规划文档。
