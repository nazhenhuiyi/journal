# 同步 Trace 与日志接入

同步日志分两层：

- `@journal/sync` 负责定义和产生结构化 `JournalGitTraceEvent`。
- 应用端负责决定 trace 去哪里，例如当前移动端和桌面端都写到 console。

## 公共契约

公共 trace 类型在 `packages/journal-sync/src/gitCore.ts`：

```ts
type JournalGitTraceEvent = {
  details?: Record<string, boolean | null | number | string>
  durationMs: number
  errorMessage?: string
  name: string
  ok: boolean
}
```

公共工具在 `packages/journal-sync/src/trace.ts`：

- `formatJournalGitTraceEvent`：统一格式化为 `[journal-sync] ...`。
- `createConsoleJournalGitTrace`：最常用入口，直接创建 console trace。
- `createConsoleJournalGitTraceSink`：把事件写到 console。
- `createJournalGitTrace`：组合多个 sink，并保证 sink 报错不会影响同步。

`@journal/sync` 不保存 trace，也不主动上传 trace。它只通过 runtime 注入的 `trace` 回调发出事件。

## 平台适配

移动端适配在 `apps/mobile/src/services/sync/mobileSyncTrace.ts`：

- 默认 development / preview 运行时写 console。
- Vitest 中关闭 trace，避免测试输出噪声。
- Git HTTP trace 只保留 `host`、`method`、`service`、`statusCode`，不记录 headers、body、token 或完整 URL。

桌面端适配在 `apps/desktop/electron/journalSync.ts`，同样复用公共 console sink。

## UI 状态不是 trace

同步状态展示走 `SyncSnapshot`：

- `status`
- `lastError`
- `lastSyncedAt`
- `pendingReason`

这些状态来自 `JournalSyncCoordinator`，用于 UI 展示和重试调度。trace 只用于调试和性能定位，不参与产品状态判断。

## 以后接入新通道

如果之后要接入 Sentry、自定义 debug panel 或一次性诊断导出，不需要改 Git 核心流程：

1. 在应用端创建新的 `JournalGitTraceSink`。
2. 和 `createConsoleJournalGitTraceSink()` 一起传给 `createJournalGitTrace()`。
3. 继续保持敏感信息只在平台适配层归一化，不把 token、headers、body、完整远端 URL 放进 `details`。

简单 console 接入：

```ts
const trace = createConsoleJournalGitTrace()
```

移动端示意：

```ts
const trace = createJournalGitTrace([
  createConsoleJournalGitTraceSink(),
  createFutureDiagnosticsSink(),
])
```

如需展示给用户，优先展示 `SyncSnapshot.lastError` 的产品化文案；trace 仍只作为开发诊断材料。
