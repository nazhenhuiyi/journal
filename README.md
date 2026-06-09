# 且留

万物有迹，心事且留。

一个桌面优先、正在补移动端的个人日记应用。当前核心只保留写日记、看日记、碎碎念和图片记录。

移动端正在验证 GitHub 私有仓库同步 POC：使用 `isomorphic-git`、Expo FileSystem 和 SecureStore，支持手动同步、保存后延迟同步，以及 Markdown diff3 文本合并。

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

`npm test` 会跑桌面端、`journal-core` 和移动端同步规则测试。

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
- `docs/product/`: 产品与技术规划文档。
