# 文档入口

这里放项目内仍有维护价值的产品、设计、架构、同步、验收和公开内容文档。

代码事实以各 workspace 实现和对应 `AGENTS.md` 为准；文档如果和代码冲突，优先修文档。

## 主要入口

- [产品与技术文档](product/README.md)：产品总览、体验设计、数据架构、同步机制和排查资料。
- [E2E 测试](e2e/README.md)：桌面端、移动端、真实 GitHub 同步和 Maestro 验收入口。
- [对外内容](public/README.md)：官网 Blog 和后续可公开复用的 Markdown 内容。
- [Git 领域学习](git-domain-learning/README.md)：Git 对象库、GC、smart merge 等背景知识。

## 目录边界

- `product/overview/`：产品定位、哲学、品牌语言。
- `product/experience/`：用户体验、功能形态、移动端页面与照片地图。
- `product/architecture/`：跨端架构、数据结构和持久化格式。
- `product/sync/`：Journal Sync 的目标、机制、冲突、性能和 trace。
- `product/operations/`：调试手册、审计报告和排查沉淀。
- `e2e/`：验收策略、用例清单和平台 SOP。
- `public/`：会进入官网或公开传播链路的内容。
- `design/`：设计探索、logo 过程稿和视觉资产。
