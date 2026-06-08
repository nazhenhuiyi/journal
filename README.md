# 且留

万物有迹，心事且留。

一个桌面优先、正在补移动端的个人日记应用。当前核心只保留写日记、看日记、碎碎念和图片记录。

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

## 目录

- `apps/desktop/`: Electron + Vite 桌面端。
- `apps/mobile/`: Expo + React Native 移动端。
- `packages/journal-core/`: 跨端共享的日记数据结构、Markdown 解析与序列化。
- `docs/product/`: 产品与技术规划文档。
