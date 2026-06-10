# 移动端 Git 同步性能优化方案

这份文档整理移动端 GitHub 同步链路的性能优化方向。当前目标不是把 `isomorphic-git` 换掉，也不是把移动端重复实现一套 Git 逻辑，而是在现有 Expo 文件系统适配层和 `@journal/sync` 共享同步核心上，优先处理最可能带来数量级收益的瓶颈。

## 背景

移动端同步使用：

- `isomorphic-git` 作为 Git 实现。
- `expo-file-system` 作为 React Native / Expo 文件系统能力。
- `apps/mobile/src/services/sync/expoGitFileSystem.ts` 把 Expo 文件系统适配成 `isomorphic-git` 需要的 Node-like `fs.promises`。
- `packages/journal-sync/src/gitCore.ts` 负责跨端同步流程，移动端只注入 `fs`、`http`、凭据和运行时目录。

目前适配器已经优先使用 Expo SDK 54 的现代 `File` API：

- UTF-8 读取走 `File.text()`。
- 二进制读取走 `File.bytes()`，返回 `Uint8Array`。
- 写入走 `File.write(string | Uint8Array)`。
- legacy `readAsStringAsync` / `writeAsStringAsync` base64 只作为 fallback。

这个方向是正确的。业界讨论里，React Native / Expo 文件读写的主要性能坑通常是“把二进制内容转成 base64 再过桥”，当前实现已经尽量避开了这个路径。

## 性能判断

移动端同步慢大概率来自三类开销。

### 1. Git 命令之间需要共享缓存

`isomorphic-git` 官方文档明确指出，孤立地反复调用命令容易掉进 performance trap。它提供 `cache` 参数，让多个命令复用 pack index、object、tree、status 等中间结果。

当前已经采用 runtime 级 cache：`JournalGitRuntime.cache` 是必填字段，移动端和桌面端每次创建 runtime 时创建一个新的 cache 对象，并向 `clone`、`fetch`、`merge`、`push`、`add`、`commit`、`readCommit`、`statusMatrix`、`walk` 等支持 cache 的命令透传。cache 生命周期随本次 runtime / 同步操作结束而结束，避免长期占用移动端内存。

优先级：最高。

### 2. 小文件和元数据调用太多

移动端文件系统调用跨 JS/native 边界，即使每次都很小，叠加起来也会明显拖慢。

当前适配器中比较明显的点：

- `writeFile` 每次都会先 `ensureParentDirectory`。
- `ensureParentDirectory` 每次都会 `FileSystem.getInfoAsync(parent)`。
- Git 写 loose object 时，会频繁写 `.git/objects/xx/<sha>`，父目录重复检查很多。
- `stat`、`readdir`、`mkdir`、`unlink`、`rmdir` 仍主要走 legacy async API。

优先级：高。

### 3. 仓库规模和媒体文件会持续放大成本

日记 repo 会随时间增长。Markdown 文件数量、图片数量、`.git/objects` loose objects 和 packfile 都会影响：

- `statusMatrix` 扫描工作区的成本。
- `fetch` / `merge` 读取对象的成本。
- packfile 整体读入内存的成本。
- 首次 clone 和后续 checkout 写入文件的成本。

当前同步链路已经限制跟踪范围为 `entries/`、`media/`、`annotations/`、`manifest.json`，并且保存后同步会尽量传 `changedPaths`，这是重要基础。

优先级：中到高，取决于真实数据规模。

## 优化清单

### P0：在一次同步操作内共享 `isomorphic-git` cache（已采用）

目标：

- 每次移动端、桌面端或 E2E 创建 `JournalGitRuntime` 时创建一个 runtime-level cache。
- 当前平台层每次 public sync operation 都会创建新的 runtime，所以实际生命周期是每次 runtime / 每次同步操作。
- cache 只在当前 runtime 内复用，操作结束后丢弃，避免长期占用移动端内存。

实现方式：

- `JournalGitRuntime` 增加必填 `cache: object`，用类型系统防止平台 runtime 漏接入。
- 所有支持 `cache` 的 `isomorphic-git` 调用统一透传 `runtime.cache`。
- 不把 cache 做成全局单例。移动端内存有限，长期 cache 需要后续基于真实指标再评估。

涉及命令：

- `clone`
- `fetch`
- `merge`
- `push`
- `checkout`
- `add`
- `remove`
- `commit`
- `readCommit`
- `statusMatrix`
- `walk`
- `readObject` / `readTree` / `readBlob` 如后续使用

验收：

- 单元测试确认关键 Git mock 调用收到同一个 `cache` 对象。
- 真实远端同步 trace 中，`status.*`、`commit.*`、`remote.merge`、`remote.push` 总耗时下降。
- 内存没有明显持续增长，因为 cache 只在 operation 内持有。

### P0：继续确保保存后同步传 `changedPaths`

目标：

- 用户保存一篇日记后，同步只检查已知变更路径，而不是每次扫描完整 tracked scope。

当前状态：

- `mobileJournalStore.ts` 保存成功会返回 `entries/YYYY/MM/YYYY-MM-DD.md`。
- 图片导入会把 `media/YYYY/MM/...` 作为 additional changed paths 合并进保存结果。
- `mobileSyncManager.ts` 会把 changed paths 传给 `syncMobileJournalWithGitHub`。
- `gitCore.ts` 中 `commitTrackedChanges` 会用 `changedPaths` 限制 `statusMatrix`。

建议补强：

- 对未来批注、manifest、导入导出包写入路径也统一返回 changed paths。
- 对手动“全量同步”保留完整扫描，但保存后延迟同步尽量只传已知路径。
- trace 里继续记录 `changedPathCount` 和 `collectDirtyPathsAfterSync`，方便定位是否走了全量 fallback。

验收：

- 保存单篇日记触发的同步日志中 `changedPathCount = 1`。
- `commit.status` trace 的 `knownPaths = 1`。
- 没有误把空 changed paths 当作全量扫描，除非确实是手动全量同步或未知变更来源。

### P1：批量 stage 新增和修改文件

目标：

- 避免多文件变更时逐个 `git.add` 反复读写 index。

建议做法：

- 把 changed rows 分成新增/修改和删除两组。
- 新增/修改路径使用一次 `git.add({ filepath: paths, parallel: true, cache })`。
- 删除路径仍需逐个 `git.remove`，因为 `remove` 当前只接受单个 `filepath`。

注意：

- `parallel: true` 会用更多内存换更短处理时间。移动端应只对路径数量大于 1 时启用，或者设置较保守策略。
- 单文件保存场景收益有限，批量图片或导入场景收益更明显。

验收：

- 多文件变更时 `git.add` 调用次数从 N 次下降到 1 次。
- 单文件变更行为保持不变。
- 删除文件仍能正确从 index 移除。

### P1：缓存已确认存在的父目录（已采用）

目标：

- 减少 Git 写 object 时对同一批父目录重复 `getInfoAsync`。

当前做法：

- `createExpoGitFileSystem()` 内部维护一个 `knownDirectoryPaths = new Set<string>()`。
- `ensureParentDirectory(path)` 如果 parent 已在 set 中，直接返回。
- 成功创建目录或确认目录存在后，把 parent 加入 set。
- `mkdirPath` 成功后把该目录加入 set。
- `rmdir` 成功后从 set 中移除该目录，并考虑清理其子路径缓存。

风险：

- 如果外部删除目录，缓存可能短暂失真。同步操作是单飞的，且工作区目录一般只由应用管理，风险可控。
- 如果写入失败，应清理对应 parent cache 后再尝试 fallback mkdir，避免错误持久化。

验收：

- 单元测试覆盖同一父目录连续写多个 object，只触发一次父目录信息检查。
- 写入失败后仍能 fallback 创建父目录。
- `unlink`、`rmdir` 错误码行为保持 Node-like。

### P1：评估用现代 Expo 元数据 API 替代 legacy info

目标：

- 降低 legacy async API 的桥接成本，统一使用 SDK 54 新 `File` / `Directory` / `Paths`。

候选替换：

- `Paths.info(path)`：快速判断 exists / isDirectory。
- `new File(path).info()`：获取文件 size、modificationTime。
- `new Directory(path).info()`：获取目录 size、modificationTime。
- `new Directory(path).list()`：目录列表。
- `Directory.create()` / `File.delete()` / `Directory.delete()`：创建删除。

注意：

- SDK 54 现代 API 的 `modificationTime` 是毫秒；legacy `getInfoAsync` 返回秒。`statPath` 需要避免再乘 1000。
- `Directory.delete()` 会删除目录及其内容，不适合直接替代 Node `rmdir` 的“只能删空目录”语义。`rmdir` 仍要先 list 确认空目录。
- 现代 API 是同步 native function 的地方可能会减少 async 开销，但也要注意不要在 UI 关键帧中做大目录递归。

验收：

- `expoGitFileSystem.test.ts` 增加现代 info/list/create/delete mock。
- `stat` 对文件和目录的 `mode`、`size`、`mtimeMs` 保持兼容。
- 缺失路径仍抛 `ENOENT`，文件/目录类型错误仍抛 `ENOTDIR`、`EISDIR` 等预期错误码。

### P2：clone / fetch 参数优化

目标：

- 减少首次 clone 和后续 fetch 的无关网络与落盘成本。

建议：

- `clone` 增加 `noTags: true`。日记同步不依赖 tags。
- `fetch` 保持 `singleBranch: true` 和 `tags: false`。
- 评估 `clone` / `checkout` 的 `nonBlocking: true`，减少长 checkout 阻塞 JS 线程。
- 对首次 clone 可以评估 `depth`，但不要默认 `depth: 1` 上线。

为什么不直接 shallow clone：

- shallow clone 会截断历史，部分历史和 merge-base 行为可能和完整 clone 不一致。
- GitHub 关于 partial / shallow clone 的讨论中也提醒，shallow clone 适合一次性构建或很短期用途，长期开发或同步场景要谨慎。
- `isomorphic-git` 的 shallow fetch 也有社区反馈，后续 deepen 行为可能慢或复杂。

验收：

- clone 仍能拉取已有远端日记并建立 tracking branch。
- push rejected 后的 fetch / merge / retry 行为不受影响。
- 真机上首次 clone UI 不长时间无响应。

### P2：控制媒体文件和 repo 体积

目标：

- 避免图片让 Git repo 快速变重。

建议：

- 图片写入前压缩或限制最大尺寸。
- 避免视频进入 Git 同步范围。
- 定期统计 repo 大小、`.git/objects` 大小、`media/` 大小。
- 当 `.git` 超过阈值时，提示用户执行“重建本地同步副本”：保留 worktree 内容，重新 clone 或重新初始化同步目录。

说明：

- 标准 Git 会通过 `git gc` 压缩对象、清理 unreachable objects、优化 packfile。
- `isomorphic-git` 目前没有完整等价的 Git GC API，相关需求仍在社区 issue 中讨论。
- 移动端不建议引入系统 `git` fallback；如果未来确实需要原生 Git，应作为单独技术路线评估。

验收：

- 移动端同步状态或 debug trace 能看到 repo 体积指标。
- 图片同步测试覆盖压缩后文件仍能被桌面端解析引用。

## 推荐实施顺序

1. 已完成：加 runtime-level `cache`，覆盖共享同步核心和移动端测试。
2. 已完成：保存日记和导入图片会传 known changed paths，保存后同步不默认退回全量扫描。
3. 已完成：给 Expo Git FS adapter 加父目录存在缓存。
4. 批量 `git.add`，改善批量文件场景。
5. 评估现代 `Paths.info` / `File.info` / `Directory.info` 替换 legacy metadata API。
6. clone 增加 `noTags`，再单独评估 `nonBlocking` 和 shallow clone。
7. 建立 repo / media 体积指标和阈值策略。

## 指标与观测

建议在现有 `JournalGitTrace` 上补充或持续关注这些字段：

- `operation`: pull / push / full sync / clone。
- `changedPathCount`: 本次已知变更路径数。
- `collectDirtyPathsAfterSync`: 是否需要同步后完整扫描 dirty paths。
- `commit.status.durationMs`
- `commit.stage.durationMs`
- `commit.write.durationMs`
- `remote.listRefs.durationMs`
- `remote.fetch.durationMs`
- `remote.merge.durationMs`
- `remote.push.durationMs`
- `checkout.local.durationMs`
- `fs.getInfo.count`、`fs.stat.count`、`fs.readFile.count`、`fs.writeFile.count`（可在 debug build 中临时采集）。
- `.git` 大小、`media` 大小、tracked 文件数。

建议验收数据集：

- 小仓库：30 篇日记，无图片。
- 中仓库：365 篇日记，少量图片。
- 大仓库：1000 篇日记，100-300 张压缩图片。
- 冲突仓库：双端同时修改同一 Markdown，触发 fetch / merge / retry。

## 风险

| 优化 | 风险 | 控制方式 |
| --- | --- | --- |
| operation-level cache | 内存短时升高 | 每次操作局部创建，结束释放 |
| 批量 add parallel | 批量文件时内存升高 | 只在路径数大于 1 时启用，必要时关闭 parallel |
| 父目录缓存 | 外部删除目录导致缓存失真 | 写失败后清理缓存并 fallback mkdir |
| 现代 metadata API | 错误码和时间单位变化 | 单元测试覆盖 Node-like 行为，注意毫秒/秒差异 |
| shallow clone | 历史和 merge 行为变化 | 不作为默认策略，先做真实远端回归 |
| 媒体压缩 | 图片质量下降 | 明确最大尺寸和质量参数，保留用户可理解提示 |

## 参考资料

- isomorphic-git cache：https://isomorphic-git.org/docs/en/cache
- isomorphic-git statusMatrix：https://isomorphic-git.org/docs/en/statusMatrix.html
- isomorphic-git add：https://isomorphic-git.org/docs/en/add
- isomorphic-git clone：https://isomorphic-git.org/docs/en/clone.html
- isomorphic-git fetch：https://isomorphic-git.org/docs/en/fetch
- Expo FileSystem SDK 54：https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/
- GitHub Blog: Get up to speed with partial clone and shallow clone：https://github.blog/open-source/git/get-up-to-speed-with-partial-clone-and-shallow-clone/
- Git GC 文档：https://git-scm.com/docs/git-gc
- isomorphic-git Git GC issue：https://github.com/isomorphic-git/isomorphic-git/issues/1117
- React Native / Expo 文件读取实践：https://www.richinfante.com/2024/12/03/efficiently-load-file-into-buffer-react-native-expo
