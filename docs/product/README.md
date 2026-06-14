# 产品与技术文档

这里放当前仍有维护价值的产品、架构、同步、验收和设计文档。代码事实以各 workspace 实现和对应 `AGENTS.md` 为准；文档如果和代码冲突，优先修文档。

## 当前架构

- [架构与数据流](架构与数据流.md)：workspace 分层、日记数据从输入到落盘、同步和回流的主路径。
- [数据结构](数据结构.md)：Markdown、media、annotations、reviews 和 manifest 的文件约定。
- [Git 同步机制](<Git 同步机制.md>)：`@journal/sync`、同步调度、桌面/移动平台适配和 git client 使用方式。
- [Git 同步性能笔记](<Git 同步性能笔记.md>)：`isomorphic-git`、Expo 文件系统和仓库规模相关的优化状态。
- [同步 Trace 与日志接入](<同步 Trace 与日志接入.md>)：同步 trace 的公共契约、敏感信息边界和 UI 状态区分。
- [Git 同步冲突处理](<Git 同步冲突处理.md>)：当前冲突阻断机制，以及后续需要补齐的处理入口。

## 产品机制

- [回顾与小组件推荐逻辑](回顾与小组件推荐逻辑.md)：`ReviewMoment`、`ReviewFile`、`JournalWidgetSnapshot` 与小组件刷新。
- [移动端 Today 页设计](<移动端 Today 页设计.md>)：移动端 Today、碎碎念面板和信息架构的设计取舍。
- [移动端小组件](移动端小组件.md)：Android / iOS 小组件实现、snapshot 数据流和验收边界。
- [品牌语言](品牌语言.md)：产品命名、slogan、语气和文案原则。

## 验收

- [E2E 测试](<E2E 测试.md>)：unit、integration、桌面 E2E、移动端 Maestro 和真实 GitHub 同步 E2E。
- [Electron 桌面端验收工具链](<Electron 桌面端验收工具链.md>)：真实 Electron 窗口、隔离数据目录和同步验收流程。
