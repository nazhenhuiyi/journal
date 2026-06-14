# Git 同步机制

这份文档说明且留当前 GitHub 私有仓库同步的设计。同步实现以 `packages/journal-sync` 为核心，桌面端和移动端只注入平台能力。

## 1. 核心结论

- 产品同步主流程统一使用 `isomorphic-git`。
- 不重新加入系统 `git` 命令行 fallback。
- 不用 GitHub REST API 重写文件同步协议。
- 同步远端默认是 GitHub 私有仓库，认证方式是 HTTPS + GitHub token。
- token 不写入 Markdown、Git 仓库或普通配置文件；桌面端和移动端分别使用平台凭据存储。

系统 `git` 只用于开发者验收、E2E 辅助 clone、排查远端仓库事实，不是应用内同步 client。

## 2. 模块边界

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 同步核心 | `packages/journal-sync/src/gitCore.ts` | 初始化仓库、状态读取、tracked paths、commit、fetch、merge、push、push rejected retry |
| 调度器 | `packages/journal-sync/src/scheduler.ts` | 单飞、排队、保存后延迟推送、定时拉取、后台 flush、重试状态 |
| 合并策略 | `packages/journal-sync/src/smartMerge.ts`、`lastWriteWins.ts` | Markdown diff3 合并、JSON/非文本 fallback |
| 桌面平台适配 | `apps/desktop/electron/journalSync.ts` | Node `fs`、`isomorphic-git/http/node`、桌面凭据、journal directory |
| 桌面 UI 编排 | `apps/desktop/src/services/sync/desktopSyncManager.ts` | 编辑器脏状态、保存 flush、设置页、手动同步、状态展示 |
| 移动平台适配 | `apps/mobile/src/services/sync/mobileGitSync.ts` | Expo 文件系统、`expo/fetch` HTTP client、SecureStore 凭据、工作区目录 |
| 移动 UI 编排 | `apps/mobile/src/services/sync/mobileSyncManager.ts` | 输入稳定性、AppState、pending paths、手动同步、状态展示 |

## 3. Git Client 使用逻辑

这里的 git client 指应用内部对 `isomorphic-git` 的包装和注入方式。

共享核心只依赖 `JournalGitRuntime`：

```ts
type JournalGitRuntime = {
  cache: object
  dir: string
  fs: FsClient
  git?: typeof import('isomorphic-git')
  http: HttpClient
  httpRequestTimeoutMs?: number | null
  trace?: JournalGitTrace
}
```

运行时由平台层创建：

- 桌面端：`fs` 使用 Node `fs`，`http` 使用 `isomorphic-git/http/node`，`dir` 是当前 journal directory。
- 移动端：`fs` 使用 `createExpoGitFileSystem()`，`http` 使用包了一层 `expo/fetch` 的 web client，`dir` 是 Expo document directory 下的 `journal-worktree/`。
- 测试：可以传入 mock `git`、mock `fs` 和独立临时目录。

`runtime.cache` 是每次 runtime / public sync operation 内共享的 `isomorphic-git` cache。它会被透传给支持 cache 的 `clone`、`fetch`、`merge`、`push`、`checkout`、`add`、`remove`、`commit`、`readCommit`、`statusMatrix`、`walk` 等命令，操作结束后丢弃。

认证通过包装 HTTP client 实现：

```txt
平台 http client
  -> createJournalGitAuthenticatedHttpClient(requestTimeoutMs)
  -> createJournalGitAuthHeaders()
  -> Authorization: Basic base64(username:token)
  -> isomorphic-git clone/fetch/push/listServerRefs
```

如果调用方已经设置 Authorization header，共享核心不会覆盖它。桌面端和移动端当前都给 Git HTTP 请求配置 300 秒超时；移动端还会记录 `http.gitRequest` trace，便于定位大 pack 或网络慢路径。

## 4. 同步配置

共享核心使用 `JournalGitSyncConfig`：

```ts
type JournalGitSyncConfig = {
  authorEmail?: string
  authorName?: string
  branch?: string
  commitMessage?: string
  remote?: string
  remoteUrl?: string
}
```

默认值：

- branch: `main`
- remote: `origin`
- commit message: `Sync journal changes`
- author: 平台层可覆盖，桌面端和移动端目前各自设置默认 author。

远端 URL 会经过 `assertSafeRemoteUrl()` 检查，拒绝包含用户名或 token 的危险 URL。

## 5. Tracked Scope

同步核心只提交和检查这些路径：

```txt
entries/
media/
annotations/
reviews/
manifest.json
```

路径进入同步前会做归一化和过滤。保存链路应尽量传 `changedPaths`，例如：

```txt
entries/2026/06/2026-06-10.md
media/2026/06/img_20260610_220000.jpg
reviews/2026/06/2026-06-10.json
```

有 `changedPaths` 时，`commitTrackedChanges()` 只检查这些路径；没有可靠 changed paths 时才回到整个 tracked scope。

## 6. Public Operations

共享核心当前暴露这些主要操作：

| 操作 | 用途 |
| --- | --- |
| `getJournalGitSyncStatus()` | 读取仓库是否存在、当前分支、dirty paths、最近 commit、远端地址 |
| `initJournalGitSyncRepository()` | 初始化本地 Git 仓库并配置 author / remote |
| `cloneJournalGitSyncRepository()` | 新设备或空 worktree 从远端 clone 指定分支 |
| `commitJournalChanges()` | 只提交 tracked scope 内的本地改动 |
| `pullJournalUpdates()` | fetch 并 merge 远端更新到本地 worktree |
| `pushJournalChanges()` | commit 本地改动并 push |
| `syncJournalNow()` | 手动全量同步：commit -> fetch/merge -> push |

应用层通常不会直接调用所有操作。桌面端通过 preload IPC 暴露 `loadStatus`、`pull`、`push`、`syncNow` 等入口；移动端通过 `mobileGitSync.ts` 再包一层，以便自动读取 SecureStore 凭据和 Expo worktree。

## 7. 调度状态机

`JournalSyncCoordinator` 是跨端共享调度器。它不懂 UI 和文件系统，只负责什么时候跑什么操作。

状态：

```txt
disabled
idle
pending
syncing
synced
retrying
needs-auth
error
```

触发源：

```txt
app-open
app-background
manual
network-online
pull-interval
retry-timer
save-idle
```

操作：

```txt
pull
push
full
```

关键规则：

- 同一时间只跑一个 Git 操作。
- Git 操作运行中来了新的 pull/push，会记录为 queued run。
- 保存后先进入 `pending(local-save)`，等待 push debounce。
- 后台离开时会在有限时间内 flush pending push。
- push 失败进入 `retrying`，由 retry timer 克制重试。
- pull 是后台操作时默认不强行打扰主界面状态。

## 8. 桌面端同步流程

桌面端配置保存：

```txt
SettingsPage
  -> desktopSyncManager.saveConfiguration()
  -> preload journalSync.saveSettings()
  -> Electron main 保存 settings 和 token
  -> initJournalGitSyncRepository()
  -> loadStatus()
```

桌面端保存后推送：

```txt
编辑器自动保存
  -> getJournalFileTrackedPaths()
  -> desktopSyncManager.markLocalSave()
  -> JournalSyncCoordinator 等待 debounce
  -> 如果编辑器仍 dirty / composing，则跳过并重新 pending
  -> preload journalSync.push({ changedPaths })
  -> pushJournalChanges()
```

桌面端拉取：

```txt
initialize / resume / pull interval
  -> coordinator.pullNow()
  -> preload journalSync.pull()
  -> pullJournalUpdates()
  -> 如果远端更新且编辑器不脏，重新加载当前日期
```

## 9. 移动端同步流程

移动端配置保存：

```txt
SyncSettingsPage
  -> mobileSyncManager.saveConfiguration()
  -> saveGitHubSyncSettings()
  -> saveGitHubSyncCredentials()
  -> refreshStatus()
  -> startPullingIfConfigured()
```

移动端保存后推送：

```txt
saveDailyJournal() / loadOrCreateDailyReview()
  -> 返回 changedPaths
  -> journalEffects 标记同步
  -> mobileSyncManager.markLocalSave()
  -> pending paths 持久化
  -> coordinator 等待 debounce
  -> 如果输入不稳定，跳过并重新 pending
  -> syncMobileJournalWithGitHub({ changedPaths })
```

移动端拉取：

```txt
resume / pull interval
  -> 如果当前保存状态 dirty 或 saving，跳过 pull
  -> pullMobileJournalUpdatesFromGitHub()
  -> 如果 pull 后还有 dirty paths，继续标记 pending
  -> 如果 worktree 更新，reloadTodayFromDiskIfChanged()
  -> afterRemoteUpdatesApplied() 刷新 widget snapshot
```

## 10. Git 操作顺序

`syncJournalNow()` 的正常路径：

```txt
ensureRepository()
  -> commitTrackedChanges()
  -> listServerRefs() 判断远端分支是否变化
  -> fetch()
  -> merge()
  -> push()
```

push rejected 时：

```txt
push()
  -> remote changed
  -> fetch()
  -> merge()
  -> retry push once
```

空远端或空本地会被特殊处理：没有本地 commit 时不会强行 push 一个不存在的分支；已有远端分支时会建立本地分支和 tracking。

## 11. 冲突策略

Markdown 日记使用 diff3 文本合并：

- 非重叠修改自动合并。
- true conflict 保留冲突标记。
- 出现 true conflict 后停止自动 push，避免把未处理冲突推到远端。
- front matter 的 `updatedAt` 不决定整篇文件胜负。

非 Markdown 或结构化 JSON 使用 fallback merge：

- `annotations/`、`reviews/` 等 JSON 不能做无脑文本拼接。
- 有可靠时间字段时按 last-write-wins 选边。
- 无法判断时按配置 fallback side 选边。

冲突策略变更时必须同步更新测试和本文档。

## 12. 验收事实

同步验收不能只看页面显示。至少要检查：

```sh
git -C <journal-dir> status --short --branch
git -C <journal-dir> status --short -- entries media annotations reviews manifest.json
git -C <journal-dir> log --oneline -5
cat <journal-dir>/.git/HEAD
```

失败信号：

- detached HEAD。
- 短 ref 残留，例如 `.git/main`。
- tracked scope 内长期 dirty。
- 没有用户内容却产生 commit。
- 保存期间产生密集提交或密集重试。
- 页面显示已同步但远端 clone 后没有对应内容。
