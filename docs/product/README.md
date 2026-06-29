# 产品与技术文档

这里是且留内部产品知识库。它把“为什么做”“用户如何使用”“系统如何落盘与同步”“怎么验收和排查”分开维护。

代码事实以各 workspace 实现和对应 `AGENTS.md` 为准；文档如果和代码冲突，优先修文档。

## 推荐阅读顺序

1. [产品总览](overview/产品总览.md)：先建立产品定位、用户承诺和当前能力边界。
2. [品牌语言](overview/品牌语言.md)：需要写官网、应用内文案或对外材料时再看这里。
3. [架构与数据流](architecture/架构与数据流.md)：理解桌面端、移动端、共享包和同步之间的关系。
4. [数据结构](architecture/数据结构.md)：修改 Markdown、media、review、annotation 或 manifest 前必读。
5. [Journal Sync 目标与边界](sync/Journal%20Sync%20目标与边界.md)：讨论同步产品承诺和阻断边界时先看这里。

## Overview

- [产品总览](overview/产品总览.md)：产品定位、核心承诺、非目标和能力地图。
- [产品哲学：从此刻开始](overview/产品哲学-从此刻开始.md)：AI 时代里记录、表达、此刻、时间和空间的产品底稿。
- [品牌语言](overview/品牌语言.md)：产品命名、slogan、语气、常用表达和首页写法。

## Experience

- [移动端 Today 页设计](<experience/移动端 Today 页设计.md>)：移动端 Today、碎碎念面板和信息架构的设计取舍。
- [照片地图领域文档](experience/photo-map/README.md)：照片地图的功能总览、数据模型、交互流转、概念词典、渲染和 MapLibre 机制。
- [回顾与小组件推荐逻辑](experience/回顾与小组件推荐逻辑.md)：`ReviewMoment`、`ReviewFile`、`JournalWidgetBundleSnapshot` 与小组件刷新。
- [移动端小组件](experience/移动端小组件.md)：Android / iOS 小组件实现、snapshot 数据流和验收边界。

## Architecture

- [架构与数据流](architecture/架构与数据流.md)：workspace 分层、日记数据从输入到落盘、同步和回流的主路径。
- [数据结构](architecture/数据结构.md)：Markdown、media、annotations、reviews 和 manifest 的文件约定。

## Sync

- [Journal Sync 目标与边界](sync/Journal%20Sync%20目标与边界.md)：从用户故事出发定义同步要解决的问题、系统承诺、阻断边界和验收故事。
- [Git 同步机制](<sync/Git 同步机制.md>)：`@journal/sync`、同步调度、桌面/移动平台适配和 git client 使用方式。
- [Git 同步冲突处理](<sync/Git 同步冲突处理.md>)：当前冲突阻断机制，以及后续需要补齐的处理入口。
- [Git 同步性能笔记](<sync/Git 同步性能笔记.md>)：`isomorphic-git`、Expo 文件系统和仓库规模相关的优化状态。
- [同步 Trace 与日志接入](<sync/同步 Trace 与日志接入.md>)：同步 trace 的公共契约、敏感信息边界和 UI 状态区分。

## Operations

- [移动端真机调试手册](<operations/移动端真机调试手册.md>)：Android 真机、development build、旁路 debug 包、`adb reverse`、日志截图和键盘遮挡回归流程。
- [Android 性能与耗电审计报告](operations/mobile-android-performance-battery-audit-2026-06-19.md)：2026-06-19 Android 端同步与耗电审计沉淀。

## Validation

- [E2E 测试](../e2e/README.md)：unit、integration、桌面 E2E、移动端 Maestro 和真实 GitHub 同步 E2E。
- [E2E 测试用例清单](../e2e/测试用例清单.md)：每条 Playwright spec 和 Maestro flow 的证明边界。
- [E2E 覆盖与设计](../e2e/覆盖与设计.md)：当前覆盖、缺口、真实冲突设计和路线图。
- [Electron 桌面端验收 SOP](<../e2e/Electron 桌面端验收 SOP.md>)：真实 Electron 窗口、隔离数据目录和同步验收流程。
- [Mobile Maestro 验收 SOP](<../e2e/Mobile Maestro 验收 SOP.md>)：移动端 artifact、真实同步和真实冲突验收流程。
