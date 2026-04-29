# 且留

万物有迹，心事且留。

把今天轻轻安放下来的桌面日记应用。

写一页、留一句、放一张照片，都算数。AI 在这里不替人表达，只像页边的小字一样，阅读已经写下的内容，再留下克制的观察和追问。

## 开发

```sh
npm install
npm run dev
```

## 常用命令

```sh
npm run lint
npx tsc && npx vite build
npm run build
```

`npm run build` 会在完成 TypeScript/Vite 构建后调用 `electron-builder` 生成桌面安装包。

## 目录

- `electron/`: Electron 主进程和 preload 脚本
- `src/`: React 渲染进程代码
- `src/index.css`: Tailwind 入口与基础主题样式
- `vite.config.ts`: Vite、React、Tailwind、Electron 插件配置
