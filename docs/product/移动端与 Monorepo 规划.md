# 移动端与 Monorepo 规划

这份文档是移动端 React Native 版本和 Monorepo 改造的讨论底稿。它不把方案过早写死，重点是先把产品边界、技术边界和迁移顺序梳理清楚，方便后续继续聊。

## 背景

当前桌面端已经收敛为一个更轻的日记应用：

- 保留写日记和看日记。
- 保留碎碎念，因为它是高频使用入口。
- 移除 AI、回声、涂鸦和批注界面。
- 批注数据结构仍然保留，避免旧数据和未来能力被破坏。
- 图标系统改用主流图标库。

移动端的价值不只是复刻桌面端，而是承担更贴近日常现场的记录动作：

- 随手写一句话。
- 拍照或导入图片。
- 快速留下碎碎念。
- 晚上或之后再整理成长日记。

所以移动端应该围绕“低摩擦记录”设计，而不是一开始追求桌面端那种完整写作体验。

## 核心判断

建议把项目改成 Monorepo，但不要一次性大搬家。

原因是桌面端和移动端会共享同一种日记格式、碎碎念格式、图片元数据和批注 schema。如果两端各写一套解析和序列化逻辑，很容易出现：

- 同一篇日记桌面端能读，移动端读不完整。
- 碎碎念字段在两端不一致。
- 图片路径或元数据被不同端写坏。
- 批注数据结构虽然暂时不用，但被移动端无意丢失。

Monorepo 的目标不是共享 UI，而是共享“日记文件格式 SDK”。

## 推荐仓库结构

长期结构可以是：

```txt
journal/
  apps/
    desktop/
      # Electron + Vite 桌面端
    mobile/
      # Expo + React Native 移动端
  packages/
    journal-core/
      # 纯 TypeScript：数据结构、解析、序列化、校验
    journal-storage/
      # 可选：跨端存储接口、导入导出协议
    design-tokens/
      # 可选：颜色、间距、字体等跨端设计 token
```

但第一阶段不建议马上把桌面端整体搬到 `apps/desktop`。更稳的顺序是：

```txt
journal/
  src/
  electron/
  packages/
    journal-core/
```

先抽共享内核，等移动端壳子真正开始搭起来，再考虑把桌面端迁入 `apps/desktop`。

## 包管理选择

当前项目使用 `package-lock.json`，所以第一阶段建议继续使用 npm workspaces：

```json
{
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

暂时不建议切到 pnpm 或 yarn。包管理器切换会带来额外变量，但它不是移动端成败的关键。

## 共享包边界

`packages/journal-core` 应该只包含纯 TypeScript 能力，不依赖 React DOM、Electron、CodeMirror 或具体平台文件系统。

适合放入 `journal-core`：

- `DayFrontMatter`
- `MurmurBlock`
- `ImageBlock`
- `Annotation`
- `AnnotationTarget`
- `parseJournalMarkdown`
- `serializeJournalMarkdownBody`
- front matter 解析与序列化
- 碎碎念 block 解析与序列化
- 图片 block 解析与序列化
- 数据格式版本与迁移工具

不适合放入 `journal-core`：

- Electron IPC。
- 桌面端文件选择器。
- CodeMirror 编辑器逻辑。
- React DOM Markdown 渲染。
- 桌面端 CSS。
- 移动端 SQLite 实现。
- 移动端图片选择器实现。

可以保留在桌面端的能力：

- `renderJournalMarkdown.tsx` 这类依赖 Web/React DOM 的渲染逻辑。
- 桌面端 Markdown 编辑器。
- 桌面端文件系统读写。

未来如果移动端也需要 Markdown 渲染，可以单独做 `journal-render-mobile` 或直接在 mobile app 内实现，不要让 `journal-core` 变重。

## 数据模型原则

跨端共享的是“日记文档模型”，不是某一种存储方式。

桌面端当前更适合继续以 Markdown 文件作为主要数据源：

```txt
entries/
  2026-04-24.md
media/
  2026/
    04/
      window-rain.jpg
```

移动端可以使用 SQLite 或本地文件系统作为工作存储，但导入导出时必须保持同一种 Markdown 格式。

一个比较稳的移动端方案是：

- SQLite 保存按天的 journal record。
- 每天保留一份 canonical markdown 文本。
- 解析出的 front matter、murmurs、images 作为索引或缓存。
- 图片文件放在 app 私有文件目录。
- 导出时生成与桌面端兼容的 Markdown + media 目录。

这样移动端可以获得 SQLite 的查询和稳定性，同时不丢掉 Markdown 的可迁移性。

## 批注数据结构

批注界面已经移除，但 schema 需要继续保留。

原则：

- 移动端第一版不显示批注。
- 移动端读写日记时不能删除已有批注文件或批注字段。
- `annotation.ai.threadId` 这类历史兼容字段可以保留在类型里。
- 新功能不再创建 AI 批注。

这让数据结构保持向后兼容，也给以后可能的“人工批注”或“阅读标记”留下余地。

## GitHub 同步方案

同步不自建后端服务。第一方向是把用户自己的 GitHub 私有仓库作为同步远端，让桌面端和移动端都围绕同一个普通 Git repo 工作。

推荐的同步仓库结构：

```txt
journal-sync/
  manifest.json
  entries/
    2026/
      06/
        2026-06-07.md
  media/
    2026/
      06/
        img_xxx.jpg
  annotations/
    2026/
      06/
        2026-06-07.json
```

这里的核心判断是：同步本质上应该是 Git 同步，而不是自己基于 GitHub REST API 重新实现一套同步协议。

### 第一候选：isomorphic-git 做 POC

移动端第一候选方案是用 `isomorphic-git` 做 POC。

原因：

- 它是纯 JavaScript Git 实现，理论上适合 React Native 运行环境。
- 它支持 clone、fetch、commit、push 等核心 Git 操作。
- 官方 examples 里有 React Native 示例，使用 `react-native-fs` 包装文件系统 API。
- Obsidian Git 移动端也采用过这个方向，说明笔记类应用里已经有人走过。
- 我们的同步 repo 结构克制，不需要 submodules、复杂分支、大型源码仓库或频繁 rebase。

POC 目标不是一次做完整同步，而是先验证最小闭环：

- 在移动端 app 私有目录初始化或 clone 一个 repo。
- 写入一篇 Markdown 日记。
- `add`、`commit`、`push` 到 GitHub 私有仓库。
- 从远端 `fetch` 或 `pull` 回来。
- 验证新增、修改、删除文件都能稳定工作。
- 验证一两张图片文件能随日记一起同步。

POC 阶段优先支持 HTTPS + GitHub token 或 OAuth，不急着支持 SSH。

### 桌面端同步

桌面端可以直接使用系统 Git 客户端。

流程可以保持接近普通 Git 工作流：

```txt
git pull
git add entries media annotations manifest.json
git commit -m "Sync journal"
git push
```

桌面端不需要走 `isomorphic-git`，除非未来为了跨端统一实现而觉得有必要。

### 移动端同步

移动端不能假设系统里有 `git` 命令，也不应该依赖 shell 调用。

移动端同步流程可以先设计成：

```txt
打开 app / 手动同步
  -> 检查本地 dirty 文件
  -> commit 本地改动
  -> fetch 远端
  -> 尝试 merge / fast-forward
  -> push
```

如果同一天日记在多台设备离线编辑导致冲突，第一版可以采用保守策略：

- 长日记冲突：保留本地和远端两份，生成冲突副本，交给用户之后整理。
- 碎碎念冲突：按 `id` 合并，新增内容尽量不丢。
- 图片冲突：图片使用稳定 id 或 hash 命名，尽量只追加，不覆盖。
- 批注冲突：第一版不主动编辑批注，优先保留远端和本地数据。

### 备选方案

如果 `isomorphic-git` POC 证明在移动端不稳定，再考虑这些备选：

- 原生 Git 库：用 `libgit2` 或其他原生实现，通过 Expo native module 暴露给 React Native。这条路更稳也更重，需要 Development Build，并增加 iOS/Android 原生维护成本。
- GitHub REST API / Git Data API：作为 fallback 或辅助能力，用于创建 repo、检查权限、读取远端信息，或在 Git 协议路线无法满足时做轻量同步。
- 外部 Git 客户端：例如 iOS 的 Working Copy、跨平台 GitSync。这更适合高级用户手动配置，不适合作为产品主流程。

### 同步边界

第一版同步不追求后台实时同步。

优先级：

- 手动同步按钮。
- 打开 app 时拉取。
- 保存后延迟推送。
- 网络恢复后重试。

暂时不做：

- 多人协作。
- 多分支管理。
- Git LFS。
- 复杂 merge UI。
- 端到端加密。

当前对加密的判断是：先接受 GitHub 私有仓库的访问控制和 HTTPS 传输加密，不把端到端加密作为第一版要求。

## 移动端第一版范围

第一版移动端不要做成桌面端完整平移。建议只做三个核心面：

### 今日

- 显示今天日期。
- 长日记输入区。
- 碎碎念快速输入。
- 添加图片或拍照。
- 自动保存。
- 保存状态提示。

### 回看

- 日历或日期列表。
- 有内容的日期高亮。
- 打开某一天查看长日记和碎碎念。
- 第一版可以先只读，编辑入口可以后置。

### 设置

- 本地数据位置说明。
- 导入桌面端导出的日记包。
- 导出移动端日记包。
- 未来再考虑 Face ID、iCloud、WebDAV 或其他同步。

## React Native 技术栈建议

建议使用：

- Expo。
- React Native。
- TypeScript。
- Expo Router 或 React Navigation。
- Expo SQLite。
- Expo FileSystem。
- Expo ImagePicker。
- `isomorphic-git`，用于移动端 Git 同步 POC。
- 主流图标库，例如 `lucide-react-native` 或 Expo 生态图标。

倾向先用 Expo，是因为移动端早期最重要的是快速真机验证和稳定打包。等遇到确实需要原生能力的地方，再通过 Development Build 或 config plugin 解决。

## 迁移路线

### 阶段 1：抽共享内核

目标是让桌面端继续工作，同时出现第一个可复用包。

- 增加 npm workspaces。
- 建 `packages/journal-core`。
- 移动纯类型和纯函数。
- 桌面端改为从 `@journal/core` 引用。
- 跑桌面端测试和构建。

完成标志：

- 桌面端行为不变。
- 测试通过。
- `journal-core` 不依赖 React DOM、Electron、Vite、CodeMirror。

### 阶段 2：建立移动端壳

目标是让移动端可以跑起来，但不急着做完整功能。

- 建 `apps/mobile`。
- 接入 `@journal/core`。
- 做今日页面原型。
- 实现本地保存一篇日记。
- 实现碎碎念新增和解析。

完成标志：

- 真机或模拟器能打开。
- 能创建今天的长日记。
- 能创建碎碎念。
- 保存的数据能被 `@journal/core` 解析。

### 阶段 3：isomorphic-git 同步 POC

目标是验证移动端能否稳定使用 GitHub 私有仓库同步。

- 在移动端接入 `isomorphic-git`。
- 接入移动端文件系统适配层。
- 支持 clone 或 init sync repo。
- 支持 add、commit、fetch、push。
- 支持 HTTPS + GitHub token 或 OAuth。
- 用少量日记和图片做真机同步测试。

完成标志：

- 移动端能把一篇日记 commit 并 push 到 GitHub。
- 桌面端能 pull 到这篇日记并正确解析。
- 桌面端修改后 push，移动端能 fetch/pull 并正确解析。
- 遇到简单冲突时不会覆盖或丢失用户数据。

### 阶段 4：图片与导入导出

目标是让移动端记录真正有用。

- 接入图片选择或拍照。
- 图片落盘到移动端本地目录。
- 图片 metadata 写入 murmur image block。
- 支持导出 Markdown + media。
- 支持导入桌面端导出的 Markdown + media。

完成标志：

- 移动端导出的日记可以被桌面端读取。
- 桌面端导出的日记可以被移动端读取。

### 阶段 5：再整理桌面端目录

等移动端已经稳定起步后，再考虑把桌面端从根目录迁到 `apps/desktop`。

这样可以减少第一阶段的变更量，也能避免 monorepo 改造和移动端开发互相干扰。

## 需要继续讨论的问题

这些问题会影响后续实现顺序：

- 移动端第一版是只做 iOS，还是 iOS 和 Android 一起做？
- 移动端是否先做手动同步按钮，还是打开 app 时自动同步？
- 日记数据是否需要密码锁或生物识别？
- 图片是否需要原图保存，还是允许压缩？
- 移动端长日记编辑器要多强，是否第一版只做纯文本 Markdown？
- 碎碎念是否在移动端作为首页主入口，而长日记作为次入口？
- 批注 schema 保留到什么程度，是否需要移动端做只读兼容？
- `isomorphic-git` POC 如果遇到性能或稳定性问题，什么时候切到原生 Git 库？
- 未来如果恢复 AI 能力，是否只作为可选插件，而不是核心包能力？

## 当前建议

下一步最适合先做 `journal-core`。

这个动作收益很高，风险相对可控。它不要求马上决定移动端所有交互，也不要求现在就把桌面端大迁移，但可以先把两端最关键的共同语言建立起来。

一旦 `journal-core` 成型，移动端就不是从零开始，而是直接站在现有日记格式、碎碎念格式和批注 schema 上继续做。

## 参考资料

- React Native 文档：https://reactnative.dev/docs/getting-started
- Expo 工作流：https://docs.expo.dev/workflow/overview
- Expo Router：https://docs.expo.dev/router/introduction
- Expo SQLite 与数据库：https://docs.expo.dev/develop/database/
- Expo ImagePicker：https://docs.expo.dev/versions/latest/sdk/imagepicker/
- isomorphic-git：https://isomorphic-git.org/
- isomorphic-git React Native 示例：https://github.com/isomorphic-git/examples/tree/master/ReactNativeGit
- GitJournal：https://gitjournal.io/
- Obsidian Git 移动端说明：https://community.obsidian.md/plugins/obsidian-git
