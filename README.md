# Journal

一个使用 Electron、Vite、TypeScript、React 和 Tailwind CSS 初始化的桌面日记应用。

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
