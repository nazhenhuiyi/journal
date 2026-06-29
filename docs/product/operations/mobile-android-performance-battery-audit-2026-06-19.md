# Android 性能与耗电审计报告（2026-06-19）

## 摘要

本次审计由主 agent 结合两个子调查完成：代码路径调查与设备日志调查。结论是：当前 Android 端耗电和后台活动的主因，不是小组件，也不是 UI 渲染卡顿或崩溃，而是 Git 同步的自动拉取在后台仍持续运行。

高置信度问题：

- `pull-interval` 以 30 秒为周期运行，App 进入 `background` / `inactive` 时没有停止。
- 4 天历史日志中共有 518 次 `mobile.pullCore`，其中 426 次来自 `pull-interval`，至少 298 次在 AppState 记录为 `background` 时开始。
- 长耗时 pull 几乎全部来自 `pull-interval`。最大单次耗时约 30.6 分钟，失败时常见 SSL 连接关闭、超时、连接失败、DNS 失败。
- batterystats 显示该 UID 的耗电主要集中在 CPU，而不是 wakelock 或 mobile radio 本身。

小组件判断：

- Android 小组件确实已注册，桌面上当前挂了 1 个 `JournalMoment` 实例。
- 小组件系统更新周期是 30 分钟，不是 30 秒。
- 小组件 handler 只读取本地 cached snapshot 并渲染，不调用 Git 同步。
- 现有证据不支持“小组件直接导致频繁 GitHub pull”。小组件最多是轻量唤醒或 snapshot 刷新成本的次要因素。

## 调查范围

数据来源：

- 设备包名：`app.zilin.journal`
- 设备 UID：`u0a289`
- 历史日志：`/tmp/journal-mobile-logs-history/journal-mobile-2026-06-16.jsonl` 到 `2026-06-19.jsonl`
- adb 只读复查：`dumpsys batterystats --charged`、`dumpsys appwidget`、`dumpsys package`、`dumpsys gfxinfo`、`dumpsys meminfo`
- 代码路径：`apps/mobile` 与 `packages/journal-sync`

安全处理：

- 报告不包含 GitHub 远端完整 URL、token 或敏感请求内容。
- 所有同步远端只按 host / operation / trigger 层级分析。

## 总体日志画像

4 天日志共 8,284 行，无 JSONL 解析失败。

| 日期 | 日志行数 | error | warn | 主要特征 |
| --- | ---: | ---: | ---: | --- |
| 2026-06-16 | 1,620 | 151 | 0 | 后台长 pull 明显 |
| 2026-06-17 | 2,175 | 116 | 0 | pull 次数最高之一，最长约 30.6 分钟 |
| 2026-06-18 | 2,629 | 72 | 0 | 日志量最高，后台 pull 仍多 |
| 2026-06-19 | 1,860 | 80 | 6 | 出现 MapLibre 资源加载错误 |

level 分布：

| level | 行数 | 占比 |
| --- | ---: | ---: |
| info | 7,859 | 94.9% |
| error | 419 | 5.1% |
| warn | 6 | 0.1% |

scope 分布的核心事实：

- `journal-sync`：7,860 行，占约 94.9%。
- `app-state`：258 行。
- `runtime`：57 行。
- `journal.save`：49 行。
- `console.error`：12 行。
- `console.warn`：6 行。

这说明诊断日志几乎被同步链路主导。

## Pull 行为统计

`mobile.pullCore` 共 518 次：

| trigger | 次数 | 占比 |
| --- | ---: | ---: |
| `pull-interval` | 426 | 82.2% |
| `app-open` | 92 | 17.8% |

按日期：

| 日期 | pull 次数 | pull 错误 | `pull-interval` | `app-open` |
| --- | ---: | ---: | ---: | ---: |
| 2026-06-16 | 80 | 20 | 71 | 9 |
| 2026-06-17 | 147 | 24 | 121 | 26 |
| 2026-06-18 | 155 | 11 | 124 | 31 |
| 2026-06-19 | 136 | 16 | 110 | 26 |

按最近一次 AppState 对齐：

| pull 开始时状态 | 次数 |
| --- | ---: |
| `background` | 298 |
| `active` | 198 |
| `unknown` | 22 |

其中 `pull-interval + background` 为 281 次。另一个子调查按更保守口径统计至少 274 次，差异来自文件开头缺少前置 AppState 的归类方式；无论哪种口径，后台 interval pull 都是明确存在且数量很大。

耗时分布：

| 指标 | 全部 pull | 后台 pull |
| --- | ---: | ---: |
| p50 | 约 2.1s | 约 2.7s |
| p90 | 约 118s | 数十秒到数百秒，按日期波动 |
| p99 | 约 1,233s | 多次超过 10 分钟 |
| 最大 | 1,838s，约 30.6 分钟 | 1,534s 以上 |

长耗时特征：

- `>= 5s`：103 次，其中 99 次是 `pull-interval`。
- `>= 30s`：66 次，全部是 `pull-interval`。
- `>= 5min`：45 次。
- `>= 10min`：34 次。
- 4 天中长耗时 `>60s` pull 共 61 次，其中 52 次在 `background` 状态开始。

这说明后台耗电问题不是单纯“请求次数多”，而是“请求多 + 失败后拖得很长”叠加。

## 错误类型

按 `mobile.pullCore` 的失败归类，共 71 次失败：

| 类别 | 次数 |
| --- | ---: |
| SSL / connection closed / socket closed | 38 |
| timeout | 14 |
| connect failed | 12 |
| DNS | 4 |
| other | 3 |

按日志行计数，错误会被多层 trace 放大，因此会看到更多 error 行：`http.gitRequest`、`remote.listRefs`、`pull.total`、`mobile.pullCore` 等都可能为同一次失败记录一层。关键判断是：错误主要来自网络和 Git HTTP 请求，不是业务数据崩溃。

## 崩溃、ANR、OOM

未发现以下证据：

- `fatal exception`
- ANR
- OOM / out of memory
- native module missing
- React Native invariant violation
- `SIGSEGV` / `SIGABRT`

历史 JSONL 中与 `exception` 相关的命中主要来自同步网络错误栈或 MapLibre 资源加载错误，不是进程崩溃。

adb 侧复查也没有发现 `app.zilin.journal` 的 crash logcat 命中。当前证据不支持“崩溃 / ANR / OOM 是耗电主因”。

## 电量、CPU、内存、图形

batterystats 中 `UID u0a289` 的累计估算：

| 分项 | 估算耗电 |
| --- | ---: |
| 总计 | 约 103-104 mAh |
| CPU | 约 76-77 mAh |
| screen | 25.9 mAh |
| mobile radio | 0.280 mAh |
| wakelock | 0.132 mAh |

屏幕关闭 / doze 下仍有 CPU 消耗约 21.4 mAh，mobile radio 约 0.215 mAh，wakelock 约 0.0648 mAh。这更像 CPU 型后台工作，而不是长 wakelock 或无线电本身主导。

现场图形性能：

- `dumpsys gfxinfo`：203 帧样本时 janky 3 帧，占 1.48%；另一次子调查样本 1,044 帧时 janky 23 帧，占 2.20%。
- p50 约 7ms，p95 约 15-20ms，p99 约 29-42ms。
- 图形不是当前最主要问题。

现场内存：

- TOTAL PSS 约 567-589 MB。
- TOTAL RSS 约 414-463 MB。
- TOTAL SWAP PSS 约 280-344 MB。
- Bitmap malloced 约 56 MB。
- Activities 1，WebViews 0。

内存和 swap 偏高，可能放大 CPU 成本或造成体验风险，但没有 OOM 证据。地图页和图片缩略图仍建议后续单独优化。

## 小组件调查

代码路径：

- Android widget 注册：`apps/mobile/index.ts`
- 小组件 handler：`apps/mobile/src/widgets/widgetTaskHandler.tsx`
- 小组件 native update：`apps/mobile/src/widgets/journalWidgetNative.android.tsx`
- snapshot 生成与缓存：`apps/mobile/src/services/journalWidgetSnapshotStore.ts`
- Android widget 配置：`apps/mobile/app.json`

关键事实：

- `widgetTaskHandler()` 只处理 `WIDGET_ADDED`、`WIDGET_UPDATE`、`WIDGET_RESIZED`。
- 处理逻辑是 `loadJournalWidgetSnapshot()` 读取本地 JSON，然后 `renderWidget(...)`。
- handler 不调用 `mobileSyncManager`，不调用 `pullNow()`，不调用 `syncNow()`，不调用 `resume()`。
- `app.json` 中 `JournalMoment` 和 `JournalMomentCompact` 的 `updatePeriodMillis` 都是 1,800,000ms，即 30 分钟。
- `dumpsys appwidget` 显示桌面当前挂载 1 个 `JournalMoment` 实例，`JournalMomentCompact` 已注册但未见实际挂载实例。

结论：

小组件不是频繁 GitHub pull 的直接来源。它可能带来两类次要成本：

- 系统每 30 分钟或宿主触发时唤醒 widget provider。
- 主 App 在 active / save / review 等路径刷新 snapshot 时，会调用 `listDailyJournals()`，全量读取日记记录，成本偏高。

但这些成本与 30 秒级后台 Git pull 不在同一量级。

## 根因链路

代码链路如下：

1. `useMobileSync()` 挂载时调用 `mobileSyncManager.initialize()`。
2. `loadInitialConfiguration()` 读取同步配置后调用 `startPullingIfConfigured()`。
3. `startPullingIfConfigured()` 调用 `JournalSyncCoordinator.startPulling()`。
4. `startPulling()` 默认立即触发 `app-open` pull，并设置固定 interval。
5. interval 每 30 秒调用 `pullNow('pull-interval')`。
6. App 进入 `background` / `inactive` 时，`useMobileSync` 只调用 `flushBeforeLeave()`，没有调用 `stopPulling()`。
7. `flushBeforeLeave()` 只负责本地 pending save 的离开前 push，不负责停止 pull interval。

关键代码引用：

- `apps/mobile/src/services/sync/mobileSyncManager.ts:92`：移动端 pull interval 为 `30_000`。
- `apps/mobile/src/hooks/useMobileSync.ts:70`：监听 AppState。
- `apps/mobile/src/hooks/useMobileSync.ts:80`：后台只调用 `flushBeforeLeave()`。
- `packages/journal-sync/src/state/scheduler.ts:166`：`startPulling()` 会设置 interval。
- `packages/journal-sync/src/state/scheduler.ts:177`：interval 触发 `pullNow('pull-interval')`。
- `packages/journal-sync/src/state/scheduler.ts:182`：已有 `stopPulling()`，但后台路径未调用。
- `packages/journal-sync/src/state/scheduler.ts:568`：cooldown 只覆盖 `app-open` / `network-online`，不覆盖 `pull-interval`。

此外，`apps/mobile/src/services/sync/mobileGitSync.ts:51` 设置 Git HTTP 请求超时为 300 秒；日志中出现超过 300 秒的总 pull，原因是一次 pull 可能包含多步请求、底层请求和重试链路叠加，且 `Promise.race` 式 timeout 不一定真正取消底层 fetch 工作。

## 风险评估

| 风险 | 影响 | 置信度 |
| --- | --- | --- |
| 后台持续 30 秒 pull | 直接增加 CPU、网络、日志 IO | 高 |
| 网络失败后长耗时 | 单次后台工作可拉长到数分钟甚至 30 分钟 | 高 |
| `app-open` 与 interval 重叠 | 回前台和 interval 可在数秒内重复拉取 | 高 |
| 日志量过大 | 生产环境 IO 和存储膨胀，诊断噪声高 | 中高 |
| 小组件唤醒 | 30 分钟级轻量成本，非主因 | 中 |
| widget snapshot 全量扫描 | 日记数量增长后会变慢 | 中 |
| 内存 / swap 偏高 | 可能放大 CPU 或体验问题 | 中 |
| MapLibre 资源错误 | 地图页加载失败或噪声，不是主因 | 低到中 |

## 修复建议

### P0：后台停止自动 pull

目标：App 进入 `background` / `inactive` 后停止 pull interval，只保留必要的本地保存和离开前 push。

建议改法：

- 在 `MobileSyncManager` 增加 `pause()` 或 `suspendPullingForBackground()`。
- `pause()` 内调用 `this.coordinator.stopPulling()`，再按当前逻辑执行 `flushBeforeLeave()`。
- `useMobileSync` 的后台分支改为调用 pause API。
- `resume()` 中恢复 interval，但避免在已经刚刚 pull 过时立刻再 `app-open` pull。

需要补测试：

- AppState 进入 `background` / `inactive` 时调用 `stopPulling()`。
- 回到 `active` 时恢复 interval。
- 有 dirty save 时仍执行 background flush。
- pause 后没有新的 `pull-interval` timer。

### P0：拉长移动端自动 pull 周期

当前 `30_000ms` 太激进。建议：

- foreground interval 调整到 3-5 分钟，或回到共享默认值 180 秒以上。
- 有本地保存、手动同步、网络恢复、前台恢复时再事件驱动补一次。
- 后台禁用周期 pull。

### P1：给 `pull-interval` 加 cooldown 和失败 backoff

当前 cooldown 不覆盖 `pull-interval`。建议：

- 将 `pull-interval` 纳入 automatic pull cooldown。
- 失败后指数退避，例如 1min -> 2min -> 5min -> 15min。
- 网络错误期间避免连续打 GitHub。
- backoff 状态写入 snapshot 或 manager 内部状态，便于 UI 和日志解释。

### P1：区分 manual sync 与 background pull 的超时

建议：

- manual sync 可保留较长超时。
- foreground interval pull 使用较短超时。
- background 不做 pull；如未来必须做，使用更短超时和可取消请求。
- 评估 `AbortController` 或 Expo fetch 可取消能力，避免 `Promise.race` 超时后底层请求继续跑。

### P1：合并重复触发

现象：尾部日志中出现 `pull-interval` 后约 1.2 秒又发生 `app-open`，随后约 28 秒后下一次 `pull-interval`。

建议：

- `resume()` 调用前检查最近 automatic pull 时间。
- `startPulling({ immediate })` 与 `notifyForeground()` 统一走同一 cooldown。
- activeRun 结束后不要让 queued interval 立刻补跑，除非超过 cooldown。

### P2：降低同步 trace 噪声

建议：

- release 环境成功路径降采样，错误保留完整 trace。
- 将重复成功事件合并为 summary，例如每 10 分钟输出一次 pull count、changed count、error count。
- diagnostic JSONL 继续保留，但 console sink 可在生产构建关闭或降级。

### P2：优化小组件 snapshot 成本

小组件不是主因，但 snapshot 刷新路径会全量扫描日记。

建议：

- 对 `refreshJournalWidgetSnapshot()` 增加 debounce。
- snapshot 内容未变化时跳过 native widget update。
- `listDailyJournals()` 增加索引或限制最近 N 天 / review 需要范围。
- 给 App active 触发的 snapshot refresh 加新鲜度窗口。

### P2：后续内存与地图优化

建议：

- Photo Map 默认只加载范围内日记，而不是先全量读全部 entries。
- 地图 marker 缩略图使用更小尺寸。
- 离开地图页后确认 MapLibre 与图片缓存释放。
- 对 `Bitmap malloced` 和 PSS 做页面级对比。

## 验证计划

### 实验 1：后台 pull A/B

步骤：

1. 重置 batterystats。
2. 安装 baseline 版本，打开 App 后按 Home 息屏 2-4 小时。
3. 拉取 diagnostic logs 与 batterystats。
4. 安装修复版，重复相同流程。

成功标准：

- background 状态下 `pull-interval` 次数接近 0。
- screen-off CPU mAh 显著下降。
- `journal-sync` 日志行数显著下降。

### 实验 2：小组件 A/B

步骤：

1. 保持当前版本，记录桌面挂载小组件时 2-4 小时息屏数据。
2. 移除桌面小组件，重复相同窗口。
3. 对比 widget update 广播、CPU、日志量。

成功标准：

- 移除小组件不应显著影响 Git pull 次数。
- 如有差异，应主要体现在 widget provider 唤醒，而不是 `journal-sync`。

### 实验 3：长 pull CPU 栈

步骤：

1. 在弱网或代理不稳定条件下复现长 pull。
2. 使用 Perfetto 或 simpleperf 捕获 CPU 栈。
3. 结合 `http.gitRequest` trace 对齐耗时阶段。

目标：

- 确定 CPU 时间消耗在 JS 调度、isomorphic-git、Expo fetch、文件系统还是日志写入。

## 最终判断

后台耗电主因是同步调度策略：30 秒自动 pull 在后台没有停止，并且网络失败时长耗时严重。小组件不是直接原因。

优先修复顺序应该是：

1. 后台停掉 pull interval。
2. 前台 interval 拉长到 3-5 分钟或更长。
3. 将 `pull-interval` 纳入 cooldown/backoff。
4. 缩短并可取消非手动 Git 请求。
5. 降低成功同步日志噪声。
6. 再做小组件 snapshot 与地图内存优化。

修完 P0/P1 后，预期后台 CPU、电量和日志量会有明显下降；UI 图形流畅度当前不是第一优先级。
