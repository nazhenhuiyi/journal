# 移动端 Android 桌面小组件调研

本调研整理 Journal 移动端在 Android 上支持桌面小组件的可行性、技术选型和落地边界。调研日期：2026-06-10。

## 结论

Journal 可以支持 Android 桌面小组件。推荐优先采用 `react-native-android-widget`，通过 Expo config plugin 接入标准 Android App Widget，并在 `apps/mobile/index.ts` 注册 widget task handler。

第一版不建议做复杂交互或依赖后台高频刷新。更稳的方向是做一个轻量的“今日日记状态”小组件：

- 显示今日日期。
- 显示今日是否已记录。
- 显示碎碎念数量或最近一条短预览。
- 点击小组件打开 App 的今日页。
- App 内保存成功后主动刷新小组件。

小米 / Redmi / POCO 的 MIUI / HyperOS 通常支持标准 Android 桌面小组件，但第三方小组件的后台刷新可能受省电策略、后台限制、自启动设置、launcher 行为影响。应把小米兼容性定义为“可放桌面、点击可打开、App 内保存后可刷新”，不要承诺锁屏、负一屏 / App Vault 或分钟级准时后台刷新。

## 当前项目状态

`apps/mobile` 当前是 Expo / React Native 应用：

- Expo SDK：`~54.0.35`
- React Native：`0.81.5`
- React：`19.1.0`
- `newArchEnabled: true`
- Android package：`app.zilin.journal`
- 入口文件：`apps/mobile/index.ts`
- 本地日记读写：`apps/mobile/src/services/mobileJournalStore.ts`
- 同步核心：移动端调用 `@journal/sync`，平台层只保留 Expo 文件系统、SecureStore、AppState 和 UI 状态适配

这些条件适合从轻量 Android widget MVP 开始。小组件只需要读本地的今日日记快照，不应该复制 Git 同步逻辑。

## Expo 官方能力边界

Expo 官方有 `expo-widgets`，但当前官方文档主要覆盖 iOS widgets、Live Activities 和相关 target 能力。它不能在 Expo Go 中使用，需要 development build 或 EAS Build。

Android 桌面小组件没有同等级的 Expo 官方 JS SDK。Android 侧通常要通过以下方式落地：

- 使用带 Expo config plugin 的第三方库，在 prebuild / CNG 阶段生成原生配置。
- 自己写 Android 原生 `AppWidgetProvider` 或 Jetpack Glance，再通过 config plugin 接入 Expo 工程。

因此，如果要在 Expo 项目里做 Android 小组件，技术前提是接受 development build / EAS Build，而不是 Expo Go。

## 方案对比

| 方案 | 适合度 | 优点 | 风险 |
| --- | --- | --- | --- |
| `react-native-android-widget` | 高 | 专门面向 Android widget；有 Expo config plugin；支持 JS task handler、点击、刷新、预览；当前 npm peer dependency 覆盖 Expo 54 | 只能用于 Android；widget UI 组件受限，不能直接复用普通 React Native 页面 |
| 自写 Kotlin `AppWidgetProvider` / Glance | 中高 | 最原生、控制力最高；适合复杂尺寸、系统兼容和长期深度优化 | 需要维护 Kotlin、Gradle、config plugin、数据桥；首版成本高 |
| `expo-targets` | 中 | 目标是用 Expo target 管理 iOS / Android 扩展；方向和 CNG 一致 | 项目仍偏早期，文档里 Android widget 支持描述存在不一致；成熟度需要继续观察 |
| `@bittingz/expo-widgets` | 中低 | 跨平台思路，宣称支持 iOS / Android native widgets | 维护信号和 Expo SDK 54 匹配度弱于 `react-native-android-widget` |

推荐路线：先用 `react-native-android-widget` 做 Android MVP。iOS 后续若要做，可以单独评估 Expo 官方 `expo-widgets`，不要强行追求同一套实现跨双端。

## 推荐方案：`react-native-android-widget`

`react-native-android-widget` 的定位是用 React Native 写 Android App Widget。它不是把普通 RN 页面塞进桌面，而是提供一套可转换为 Android RemoteViews 的组件和运行时。

适配 Journal 的理由：

- 支持 Expo config plugin，可以接入当前 Expo app。
- npm 最新版本 `0.20.3` 发布于 2026-05-02，peer dependency 包含 `expo >=54.0.0`。
- changelog 覆盖 React Native 0.81 / Expo 54、新架构、暗色模式、TalkBack 等方向。
- 当前项目已有 `apps/mobile/index.ts`，适合注册 widget task handler。
- Journal 首版 widget 需求是轻状态展示，符合 Android widget 的能力边界。

需要接受的限制：

- 小组件不能使用普通 RN `View`、`Text`、复杂手势或完整页面导航。
- UI 要使用库提供的 widget primitives。
- 尺寸、字体、launcher 行为在不同 Android 厂商上可能有差异。
- 改动原生配置后需要重新构建 development build / EAS build。
- Expo Go 不能验证该能力。

## Android 系统限制

Android App Widget 是嵌入到 launcher 等 widget host 中的轻量视图。它适合展示少量信息和提供简单入口，不适合实时、复杂、高频交互。

刷新上要特别保守：

- `updatePeriodMillis` 的系统周期更新最小粒度是 30 分钟级别，不适合分钟级刷新。
- 厂商系统可能进一步延迟后台任务。
- App 被省电策略限制、后台受限或长时间未打开时，刷新可能不准时。
- 用户交互和 App 前台保存后的主动刷新通常更可靠。

因此，Journal 小组件应展示“最近保存的快照”，而不是需要实时跳动的数据。

## 小米 / HyperOS 兼容性判断

小米手机支持标准 Android 桌面小组件。只要 Journal 发布的是标准 App Widget，小组件应能出现在桌面“添加小组件”的列表中。

但小米 / Redmi / POCO 上需要明确以下边界：

- 桌面小组件：目标支持。
- 点击小组件打开 App：目标支持，作为核心验收项。
- App 内保存后主动刷新：目标支持，作为核心验收项。
- 后台定时自动刷新：不承诺准时，作为尽力而为能力。
- 锁屏小组件：不承诺。HyperOS 锁屏卡片体系更封闭，不等同于标准 Android App Widget。
- 负一屏 / App Vault：不承诺。那是小米自己的卡片生态，不等同于标准 Android App Widget。

调研中没有找到小米官方面向第三方标准 AppWidget 的额外开发契约。社区反馈显示，HyperOS / MIUI 上第三方 widget 可能存在后台不刷新、需要关闭省电限制或允许自启动等问题。这类反馈只能作为风险信号，最终要用小米真机验收。

## “不依赖后台高频刷新”的含义

不要把核心体验建立在“App 关闭时，系统每几分钟自动唤醒 Journal 刷新一次小组件”上。

更稳的设计是：

1. 用户在 App 内写日记并保存成功。
2. App 写入本地 Markdown。
3. App 生成一份 widget 快照，例如今日是否已写、碎碎念数量、最近预览。
4. App 主动请求刷新 widget。
5. 用户点击 widget 时打开 App，App 启动后重新读取本地最新数据。

低频系统自动刷新可以保留，但它不能承担“必须准时”的产品责任。

## Journal MVP 设计

建议第一版只做一个 Android 桌面小组件：`TodayJournalWidget`。

展示内容：

- 标题：`Journal`
- 日期：本地日期，例如 `6 月 10 日`
- 状态：`今天已记录` / `今天还没有写`
- 数量：`3 条碎碎念` 或 `还没有碎碎念`
- 预览：优先显示最近一条碎碎念；没有碎碎念时显示长日记前几十字；都没有时显示一句温和的空状态文案

交互：

- 点击整体打开 App。
- 后续可以增加点击“写一句”直达输入焦点，但首版先不做深交互。

刷新：

- App 启动时刷新一次。
- 今日日记保存成功后刷新一次。
- 日期切换检测后刷新一次。
- 可以配置低频系统刷新作为兜底，但不依赖它。

数据：

- 读取 `loadDailyJournal(getLocalDateKey())`。
- 使用共享的 `@journal/core` 解析结果，不在 widget 层重新实现 Markdown 解析。
- 生成最小快照，避免 widget task 每次做重 IO 或同步。

## 接入草案

预期改动范围：

- `apps/mobile/package.json`：增加 `react-native-android-widget`。
- `apps/mobile/app.json`：增加 config plugin 配置和 Android widget 元数据。
- `apps/mobile/index.ts`：注册 widget task handler，同时保留 `registerRootComponent(App)`。
- `apps/mobile/src/widgets/TodayJournalWidget.tsx`：定义 widget UI。
- `apps/mobile/src/services/widget/todayJournalWidgetSnapshot.ts`：从本地日记生成 widget 快照。
- `apps/mobile/src/hooks/useMobileJournal.ts` 或保存成功回调附近：保存成功后请求 widget 更新。

实现时需要确认：

- 是否需要给 App 增加 `scheme`，用于从 widget deep link 到今日页。
- 当前 React Navigation 还没有 deep linking 配置；首版可以先只打开 App 根页面。
- 小组件 snapshot 是否持久化。若 widget task 能可靠读取文件，可以直接读；若真机上 IO 成本或权限行为不稳，再增加轻量 JSON 快照文件。

## 验收清单

基础验收：

- Android development build 能安装。
- 系统小组件列表能看到 Journal 小组件。
- 小组件能添加到桌面。
- 点击小组件能打开 Journal。
- 空日记状态显示正确。
- 写入今日长日记后，小组件变为“今天已记录”。
- 添加碎碎念后，小组件数量和预览更新。
- 日期跨天后，小组件显示新日期。

设备验收：

- Android Emulator / Pixel 系统。
- 至少一台小米 / Redmi / POCO 真机，优先 HyperOS。
- 小米真机上验证普通省电设置下的保存后刷新和点击打开。
- 小米真机上记录后台定时刷新是否延迟，但不作为首版阻塞项。

回归验收：

- `pnpm --filter @journal/mobile run typecheck`
- `pnpm --filter @journal/mobile run test`
- development build 重新生成后真机安装验证。

## 风险和缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| Expo Go 不能调试 widget | 本地调试成本上升 | 使用 development build；把 widget 逻辑拆成可单测的 snapshot 生成函数 |
| 小米后台刷新不稳定 | 用户看到旧状态 | 保存后主动刷新；点击打开 App 后刷新；不承诺分钟级刷新 |
| 不同 launcher 尺寸差异 | UI 可能挤压或截断 | 首版只做少量文字和简单布局；限制最长预览；真机截图验收 |
| widget UI 组件受限 | 不能复用 App 页面 | 单独设计极简 widget UI；复用数据层而非 UI 层 |
| 原生配置变更增加构建复杂度 | CI / EAS build 需要适配 | 先在 preview build 验证；文档化 build 命令和必要配置 |
| deep link 未配置 | 点击只能打开 App 根页面 | 首版接受打开根页面；后续再加 scheme 和 navigation linking |

## 后续建议

1. 先做 Android `TodayJournalWidget` MVP。
2. 用 Pixel/模拟器验证标准 Android 行为。
3. 用小米真机验证“添加到桌面、点击打开、保存后刷新”。
4. 如果 MVP 稳定，再评估 deep link 到今日页。
5. iOS 小组件单独立项，优先基于 Expo 官方 `expo-widgets` 调研，不和 Android 首版绑定。

## 参考资料

- [Expo Widgets](https://docs.expo.dev/versions/latest/sdk/widgets/)
- [Expo Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
- [react-native-android-widget documentation](https://saleksovski.github.io/react-native-android-widget/)
- [react-native-android-widget: Register widget in Expo](https://saleksovski.github.io/react-native-android-widget/docs/tutorial/register-widget-expo)
- [react-native-android-widget limitations](https://saleksovski.github.io/react-native-android-widget/docs/limitations)
- [react-native-android-widget changelog](https://github.com/sAleksovski/react-native-android-widget/blob/master/CHANGELOG.md)
- [Android Developers: App Widgets](https://developer.android.com/develop/ui/views/appwidgets)
- [Android Developers: Advanced App Widgets](https://developer.android.com/develop/ui/views/appwidgets/advanced)
- [Android Developers: Jetpack Glance AppWidget](https://developer.android.com/develop/ui/compose/glance/glance-app-widget)
- [npm: react-native-android-widget](https://www.npmjs.com/package/react-native-android-widget)
- [npm: @bittingz/expo-widgets](https://www.npmjs.com/package/@bittingz/expo-widgets)
- [npm: expo-targets](https://www.npmjs.com/package/expo-targets)
