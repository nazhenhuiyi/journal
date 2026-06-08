# 移动端与 Monorepo 实施计划

这份文档用于指导桌面端到移动端的演进。目标不是一次性把项目搬成完整大仓库，而是先把跨端共享的数据格式和同步闭环做稳。

## 1. 目标

当前桌面端已经收敛为轻量日记应用：

- 保留写日记、看日记和碎碎念。
- 移除 AI、回声、涂鸦和批注界面。
- 批注数据结构继续保留，避免破坏旧数据和未来扩展。
- 图标系统改用主流图标库。

移动端第一版的核心价值是低摩擦记录：

- 随手写一句碎碎念。
- 写当天长日记。
- 拍照或导入图片。
- 回看已有日记。
- 与桌面端通过 GitHub 私有仓库同步。

第一版不追求把桌面端完整平移到手机上。

## 2. 已定决策

| 主题 | 决策 |
| --- | --- |
| 仓库形态 | 采用 Monorepo，但分阶段改造 |
| 当前重点 | 桌面端、移动端和共享 core 已拆入 workspace；第 4 阶段真实 GitHub 私有远端 POC 已通过，下一步做 Android 真机 UI 回归 |
| 包管理 | 继续使用 npm workspaces，不切 pnpm/yarn |
| 共享范围 | 共享数据模型、解析、序列化和迁移工具，不共享桌面/移动 UI |
| 移动端技术栈 | Expo SDK 54 + React Native + TypeScript，优先兼容 Play Store 版 Expo Go |
| 移动端同步候选 | 第一候选是 `isomorphic-git`，先做 POC |
| 同步远端 | GitHub 私有仓库，不自建后端服务 |
| 冲突策略 | 第一版使用 last-write-wins，后写入的覆盖先写入的 |
| 加密策略 | 第一版接受 GitHub 私有仓库权限和 HTTPS 传输加密，不做端到端加密 |
| 批注 | 保留 schema，不做移动端批注界面 |

## 3. Monorepo 结构

当前仓库采用 workspace 结构：

```txt
journal/
  apps/
    desktop/
      electron/
      src/
      # Electron + Vite 桌面端配置
    mobile/
      src/
      # Expo + React Native 移动端配置
  packages/
    journal-core/
      # 纯 TypeScript：数据结构、解析、序列化、校验、迁移
```

长期可以继续按需要增加共享包：

```txt
packages/
    journal-storage/
      # 可选：跨端存储接口、导入导出协议
    design-tokens/
      # 可选：颜色、间距、字体等跨端设计 token
```

根 `package.json` 只负责 workspace 编排和命令转发：

```json
{
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

应用自己的依赖和脚本分别放在：

- `apps/desktop/package.json`
- `apps/mobile/package.json`
- `packages/journal-core/package.json`

## 4. `journal-core` 边界

`packages/journal-core` 是跨端共享的日记格式 SDK。它必须是纯 TypeScript，不依赖 React DOM、Electron、CodeMirror 或移动端文件系统。

应该放入 `journal-core`：

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
- 兼容旧字段和未知字段的保留策略

不应该放入 `journal-core`：

- Electron IPC。
- 桌面端文件选择器。
- CodeMirror 编辑器逻辑。
- React DOM Markdown 渲染。
- 桌面端 CSS。
- Expo FileSystem 实现。
- 移动端图片选择器实现。

移动端和桌面端都必须通过 `journal-core` 读写日记格式，避免两端各自实现一套解析逻辑。

## 5. 数据源原则

跨端共享的是日记文档模型，不是某一种本地存储实现。

权威数据源采用 Markdown + media + annotations 文件结构：

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

移动端第一版不使用 SQLite，直接读写本地 Git worktree 里的 Markdown 文件。

移动端写入流程：

1. 用户编辑日记或碎碎念。
2. 使用 `journal-core` 生成 canonical Markdown。
3. 写入本地 Git worktree 里的 `entries/`、`media/`、`annotations/`。
4. 等待手动同步或自动延迟同步。

第一版先避免多一层缓存状态，减少 Markdown 和本地索引不一致的风险。等日记数量、全文搜索、标签筛选或图片检索真的需要性能优化时，再增加可重建的索引层。

## 6. 批注兼容

批注界面已经移除，但 schema 继续保留。

原则：

- 移动端第一版不显示批注。
- 移动端读写日记时不能删除已有批注文件或批注字段。
- `annotation.ai.threadId` 这类历史兼容字段可以保留在类型里。
- 新功能不再创建 AI 批注。
- 序列化时尽量保留未知字段，减少旧数据被新版本写坏的风险。

## 7. GitHub 同步计划

同步方案不自建后端服务。桌面端和移动端都围绕同一个 GitHub 私有仓库工作。

核心判断：同步应该是 Git 同步，不是基于 GitHub REST API 重新实现一套文件同步协议。

### 7.1 桌面端

桌面端可以直接使用系统 Git 客户端。

基础流程：

```txt
git pull
git add entries media annotations manifest.json
git commit -m "Sync journal"
git push
```

桌面端暂时不需要使用 `isomorphic-git`。

### 7.2 移动端

移动端不能假设系统里有 `git` 命令，也不依赖 shell 调用。

移动端第一候选是 `isomorphic-git` POC。当前已经在移动端新增同步服务边界、Expo 文件系统适配层、SecureStore 凭据存储、last-write-wins merge driver 和手动同步入口。

POC 代码路径：

- `apps/mobile/src/services/sync/mobileGitSync.ts`
- `apps/mobile/src/services/sync/expoGitFileSystem.ts`
- `apps/mobile/src/services/sync/secureSyncCredentials.ts`
- `apps/mobile/src/services/sync/lastWriteWins.ts`

POC 需要覆盖：

- 在 app 私有目录初始化或 clone 一个 repo。
- 写入一篇 Markdown 日记。
- `add`、`commit`、`push` 到 GitHub 私有仓库。
- 从远端 `fetch` 或 `pull` 回来。
- 验证新增、修改、删除文件都能稳定工作。
- 验证少量图片文件能随日记一起同步。

认证第一版优先支持 HTTPS + GitHub token 或 OAuth，不急着支持 SSH。token 或 OAuth 凭据需要放在系统安全存储里，例如 iOS Keychain / Android Keystore，对 Expo 来说可以先评估 Expo SecureStore。

### 7.3 同步流程

第一版同步以手动触发为主，自动同步为辅。

推荐优先级：

1. 手动同步按钮。
2. 打开 app 时拉取。
3. 保存后延迟推送。
4. 网络恢复后重试。

移动端同步流程：

```txt
打开 app / 手动同步
  -> 把本地未提交改动写成 commit
  -> fetch 远端
  -> 如果可以 fast-forward，则直接更新本地
  -> 如果出现分叉或同文件冲突，则按 last-write-wins 生成结果
  -> commit 合并后的结果
  -> push
  -> 如果 push 被远端新提交拒绝，则 fetch 后重试一次
```

### 7.4 冲突策略

第一版使用 last-write-wins，不做复杂冲突处理，也不做逐段合并 UI。

规则：

- 以文件为单位处理冲突。
- 后写入的版本覆盖先写入的版本。
- 日记文件优先比较 front matter 里的 `updatedAt`。
- 如果没有可靠 `updatedAt`，再使用本地编辑时间。
- 如果本地编辑时间也不可用，最后退回使用同步 commit 时间。
- 图片文件使用稳定 id 或 hash 命名，尽量避免同名冲突。
- 如果图片或批注出现同路径冲突，也使用后写入版本。

这个策略可能覆盖较旧设备上的离线修改。这个风险第一版先接受，用来换取更低的实现复杂度和更顺滑的同步体验。

### 7.5 第一版暂不做

- 后台实时同步。
- 多人协作。
- 多分支管理。
- Git LFS。
- 复杂 merge UI。
- 端到端加密。
- SSH 同步。
- 依赖外部 Git 客户端作为产品主流程。

### 7.6 备选方案

如果 `isomorphic-git` POC 在移动端不稳定，再考虑：

- 原生 Git 库：用 `libgit2` 或其他原生实现，通过 Expo native module 暴露给 React Native。这条路更稳也更重，需要 Development Build，并增加 iOS/Android 原生维护成本。
- GitHub REST API / Git Data API：作为 fallback 或辅助能力，用于创建 repo、检查权限、读取远端信息，或在 Git 协议路线无法满足时做轻量同步。
- 外部 Git 客户端：例如 iOS 的 Working Copy 或跨平台 GitSync。这更适合高级用户手动配置，不适合作为默认产品流程。

## 8. 移动端第一版范围

第一版只做三个核心页面。

### 8.1 今日

- 显示今天日期。
- 长日记输入区。
- 碎碎念快速输入。
- 添加图片或拍照。
- 自动保存。
- 保存状态。
- 同步状态。

### 8.2 回看

- 日历或日期列表。
- 有内容的日期高亮。
- 打开某一天查看长日记、碎碎念和图片。
- 第一版可以先只读，编辑历史日记后置。

### 8.3 设置

- GitHub 同步仓库配置。
- 登录或填写 GitHub token。
- 本地数据位置说明。
- 导入桌面端日记包。
- 导出移动端日记包。

第一版不做：

- AI。
- 回声。
- 涂鸦。
- 批注 UI。
- 复杂富文本编辑器。
- 密码锁和生物识别。
- iCloud、WebDAV 或其他同步通道。

## 9. React Native 技术栈

建议使用：

- Expo SDK 54。
- React Native。
- TypeScript。
- Expo Router 或 React Navigation。
- Expo FileSystem。
- Expo ImagePicker。
- `isomorphic-git`。
- `lucide-react-native` 或 Expo 生态主流图标库。

倾向先用 Expo，因为早期最重要的是快速真机验证和稳定打包。等确实遇到原生能力缺口，再通过 Development Build 或 config plugin 解决。

## 10. 分阶段计划

### 阶段 1：抽共享内核（已完成）

目标：让桌面端继续工作，同时出现第一个可复用包。

任务：

- 增加 npm workspaces。
- 创建 `packages/journal-core`。
- 移动纯类型和纯函数。
- 桌面端改为从 `@journal/core` 引用。
- 增加 `journal-core` 单元测试。
- 跑桌面端测试和构建。

完成标志：

- 桌面端行为不变。
- 测试通过。
- `journal-core` 不依赖 React DOM、Electron、Vite、CodeMirror 或平台文件系统。

### 阶段 2：建立移动端壳（已完成基础版）

目标：让移动端可以跑起来，但不急着做完整功能。

任务：

- 创建 `apps/mobile`。
- 接入 `@journal/core`。
- 做今日页面原型。
- 实现本地保存一篇日记。
- 实现碎碎念新增和解析。
- 使用本地 Markdown 文件保存。

完成标志：

- 真机或模拟器能打开。
- 能创建今天的长日记。
- 能创建碎碎念。
- 保存的数据能被 `@journal/core` 解析。

### 阶段 3：整理桌面端目录（已完成）

目标：把仓库整理成更标准的 Monorepo。

任务：

- 把桌面端迁入 `apps/desktop`。
- 调整构建、测试和打包脚本。
- 清理根目录只属于桌面端的配置。
- 删除旧功能残留的空目录、生成目录和未引用资产。

完成标志：

- 桌面端测试、构建、Electron 启动都正常。
- 移动端仍能引用 `@journal/core`。
- 根目录脚本能清楚区分 desktop、mobile 和 packages。

### 阶段 4：`isomorphic-git` 同步 POC（已完成真实远端 POC）

目标：验证移动端能否稳定使用 GitHub 私有仓库同步。

任务：

- [x] 在移动端接入 `isomorphic-git`。
- [x] 接入 Expo 文件系统适配层。
- [x] 支持 init sync repo。
- [x] 支持 clone 远端 sync repo 的代码路径。
- [x] 支持 add、commit、fetch、push 的同步服务边界。
- [x] 支持 HTTPS + GitHub token。
- [x] 使用 Expo SecureStore 保存 token 和 repo 配置。
- [x] 增加手动同步入口。
- [x] 增加 last-write-wins merge driver。
- [x] 为 last-write-wins 规则增加单元测试。
- [x] 为 init、commit/fetch/merge/push、空远端首同步、空本地空远端、已有远端首拉取、push reject retry 增加同步流程单元测试。
- [x] 为 Expo 文件系统适配层增加二进制读写、UTF-8 读写、stat shim 和 Node-style 错误码测试。
- [x] 为 SecureStore 凭据和仓库配置增加归一化、读取和坏数据清理测试。
- [x] 用 GitHub 私有仓库做真实远端 init / commit / push / clone / fetch / pull 验收。
- [x] 用少量图片文件做真实远端同步测试。
- [x] 验证 push 被远端新提交拒绝后的 fetch / merge / retry。
- [x] OAuth 后置，不进入第一轮 POC。

完成标志：

代码完成标志：

- 移动端页面可以填写 GitHub repo URL、branch 和 token。
- token 不写入 Markdown 或 Git repo，而是保存到 SecureStore。
- 同步服务可以初始化本地 repo、提交本地 Markdown、fetch 远端、合并远端、push，并在 push 被拒绝后重试一次。
- 新设备首次同步已有远端时，本地没有 commit 的情况下会 checkout 远端分支并建立 tracking。
- 本地和空远端都没有 commit 时，同步不会强行 push 一个不存在的分支。
- 同文件冲突时，日记 Markdown 优先比较 front matter `updatedAt`，批注 JSON 优先比较文件内最新批注时间；缺少可靠时间时使用 fallback。

真实远端验收标志：

- 移动端同步服务能把一篇日记 commit 并 push 到 GitHub 私有仓库。
- 桌面端能 pull 到这篇日记并正确解析。
- 桌面端修改后 push，移动端同步服务能 fetch/pull 并正确解析。
- 遇到非 fast-forward 或同文件冲突时，能按 last-write-wins 完成同步。
- 同步失败时不会导致本地日记丢失。

真实远端 POC 记录：

- 日期：2026-06-08。
- 永久测试仓库：`nazhenhuiyi/journal-sync-poc-20260608095939`，GitHub 私有仓库。
- 首次同步：本地模拟移动端通过 `isomorphic-git` `init`、`add`、`commit`、`push` 到 `main`。
- 远端拉取：另一个本地模拟移动端通过 `isomorphic-git` `clone` 拉到 Markdown 和 `media/` 图片。
- 桌面验收：系统 Git clone 仓库，读取 `entries/2026/06/2026-06-08.md` 和 `media/2026/06/img_poc_1.png`。
- 桌面修改：系统 Git 修改同一天日记并 push。
- 冲突重试：旧移动端 worktree 离线修改同文件，首次 push 被远端拒绝后，执行 fetch、last-write-wins merge、retry push 成功。
- 最终验收：桌面端 `git pull --ff-only` 拉到 last-write-wins 后的移动端版本，图片文件仍存在。

限制：

- 本机没有连接 Android 设备或模拟器，所以这次没有在 Expo Go UI 上手动点击“同步”按钮。
- Android bundle 已通过 `npx expo export --platform android` 验证，移动端服务层和真实 GitHub 远端链路已通过；后续真机 UI 回归可以继续使用这个永久测试仓库。

### 阶段 5：图片与导入导出

目标：让移动端记录真正有用。

任务：

- 接入图片选择或拍照。
- 图片落盘到移动端本地目录。
- 图片 metadata 写入 murmur image block。
- 支持图片压缩或尺寸限制。
- 支持导出 Markdown + media。
- 支持导入桌面端导出的 Markdown + media。

完成标志：

- 移动端导出的日记可以被桌面端读取。
- 桌面端导出的日记可以被移动端读取。
- 少量图片能稳定随 GitHub repo 同步。

## 11. 风险与验证

| 风险 | 验证方式 |
| --- | --- |
| `isomorphic-git` 在 React Native 文件系统上不稳定 | 阶段 4 已完成服务层、Android bundle 和真实 GitHub 远端 POC；后续继续用永久测试仓库做 Android 真机 UI 回归 |
| GitHub token 管理不安全 | 使用系统安全存储，避免明文落盘 |
| 后续索引层与 Markdown 状态不一致 | 第一版不引入 SQLite；未来如果加索引，必须可从 Markdown 重新生成 |
| 图片导致 repo 变重 | 第一版限制图片尺寸或压缩，不做视频和 Git LFS |
| 两端序列化格式不一致 | 桌面端和移动端都只能通过 `journal-core` 读写 |
| 批注旧数据被写坏 | `journal-core` 保留批注 schema 和未知字段 |

## 12. 下一步执行清单

下一步进入 Android 真机 UI 回归。

执行顺序：

1. 使用永久测试仓库 `nazhenhuiyi/journal-sync-poc-20260608095939`。
2. 在 Android 真机 Expo Go 中填写 repo URL、branch 和 token，执行手动同步。
3. 验证页面同步状态、错误提示和保存后的 token 输入框清空行为。
4. 断网或填错 token 触发失败，确认本地 Markdown 仍保留。

## 13. 仍需确认

- 移动端第一版是先做 iOS，还是 iOS 和 Android 一起做。
- 历史日记第一版是否允许编辑，还是只允许查看。
- 图片默认保存原图，还是默认压缩。
- 手动同步是否作为唯一入口，还是打开 app 时也自动拉取；当前 POC 只做手动同步。
- `isomorphic-git` POC 失败时，是否接受进入原生 Git 库路线。

## 14. 参考资料

- React Native 文档：https://reactnative.dev/docs/getting-started
- Expo 工作流：https://docs.expo.dev/workflow/overview
- Expo Router：https://docs.expo.dev/router/introduction
- Expo ImagePicker：https://docs.expo.dev/versions/latest/sdk/imagepicker/
- isomorphic-git：https://isomorphic-git.org/
- isomorphic-git React Native 示例：https://github.com/isomorphic-git/examples/tree/master/ReactNativeGit
- GitJournal：https://gitjournal.io/
- Obsidian Git 移动端说明：https://community.obsidian.md/plugins/obsidian-git
