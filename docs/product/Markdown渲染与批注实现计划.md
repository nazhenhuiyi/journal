# Markdown 渲染与批注实现计划

这份计划用于把 Markdown 渲染工具和后续批注功能拆成可执行阶段。当前目标不是一次性做完完整编辑器，而是先建立稳定的 Markdown 解析、渲染、测试和批注锚定基础。

## 总体方向

核心原则延续现有产品文档：

- Markdown 源文件是 truth。
- AI 批注不写入 `YYYY-MM-DD.md`。
- 批注作为旁路 JSON 数据保存。
- 第一版批注只作用于长日记正文。
- 第一版预览态先做块级挂载，文字级高亮后置。

推荐渲染链路：

```txt
完整日记 Markdown
-> 拆 Front Matter / 长日记 / 碎碎念
-> remark-parse
-> remark-gfm
-> remark-directive
-> 自定义 remark 插件处理 murmur/image
-> remark-rehype
-> rehype-sanitize
-> 自定义 rehype 插件挂批注属性
-> rehype-react
-> React 组件
```

## 阶段 1：Markdown 渲染工具

目标：先把每天的 Markdown 文件稳定解析并渲染出来。

### 依赖

建议新增运行时依赖：

```txt
unified
remark-parse
remark-gfm
remark-directive
remark-rehype
rehype-sanitize
rehype-react
gray-matter
```

说明：

- `remark-parse` 负责基础 Markdown。
- `remark-gfm` 负责 GFM 扩展：任务列表、表格、删除线、自动链接、脚注。
- `remark-directive` 负责 `:::murmur`、`::image` 这类自定义块。
- `gray-matter` 第一版负责 Front Matter 拆分，简单直接。
- `rehype-react` 把 HTML AST 转成 React element，方便接入自定义组件。

### 目录建议

```txt
src/domain/markdown/
  types.ts
  parseJournalMarkdown.ts
  renderJournalMarkdown.tsx
  plugins/
    remarkJournalDirectives.ts
    rehypeAnnotationAttributes.ts
  __fixtures__/
    basic-entry.md
    gfm-entry.md
    murmur-entry.md
    unsafe-html.md
    annotation-targets.md
  __tests__/
    parseJournalMarkdown.test.ts
    renderJournalMarkdown.test.tsx
```

### 输出类型草案

```ts
type ParsedJournalEntry = {
  frontMatter: DayFrontMatter
  longEntryMarkdown: string
  murmurs: MurmurBlock[]
  diagnostics: MarkdownDiagnostic[]
}

type MarkdownDiagnostic = {
  severity: 'warning' | 'error'
  message: string
  line?: number
  column?: number
}
```

### 验收标准

- 能解析带 Front Matter 的日记文件。
- 能拆出长日记正文。
- 能识别 `:::murmur` 和 `::image`。
- 能渲染基础 Markdown 和 GFM。
- 危险 HTML 不进入最终 React DOM。
- 解析异常时给出 diagnostics，不让整个应用白屏。

## 阶段 2：测试基础设施

目标：先让 Markdown 和批注的核心逻辑可测试。

### 依赖

建议新增开发依赖：

```txt
vitest
jsdom
@testing-library/react
@testing-library/jest-dom
fast-check
```

说明：

- `vitest` 作为 Vite 原生测试框架。
- `jsdom` 用于 React 渲染测试。
- `@testing-library/react` 用于验证组件渲染行为。
- `fast-check` 用于后续批注锚点恢复的属性测试。

### 脚本建议

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui"
}
```

### 测试矩阵

| 文件 | 覆盖点 |
| --- | --- |
| `basic-entry.md` | Front Matter、标题、段落、普通列表 |
| `gfm-entry.md` | 任务列表、表格、删除线、自动链接、脚注 |
| `murmur-entry.md` | 单条碎碎念、多图碎碎念、只有图片的碎碎念 |
| `unsafe-html.md` | `<script>`、危险链接、内联 HTML 清理 |
| `annotation-targets.md` | 加粗、链接、重复句子、跨行段落、中文标点 |

## 阶段 3：批注数据模型与锚点

目标：实现批注的存储类型、选择器生成和选择器恢复。

### 目录建议

```txt
src/domain/annotations/
  types.ts
  createTextSelector.ts
  resolveTextSelector.ts
  attachAnnotationsToBlocks.ts
  __fixtures__/
    annotation-file.json
  __tests__/
    createTextSelector.test.ts
    resolveTextSelector.test.ts
    attachAnnotationsToBlocks.test.ts
```

### 关键逻辑

`createTextSelector`：

- 输入长日记 Markdown、选区 start/end。
- 输出 `sourceQuote`、`plainQuote`、`textPosition`、`linePosition`。

`resolveTextSelector`：

- 如果 `sourceHash` 未变，优先校验 offset。
- 如果 offset 不匹配，尝试 `sourceQuote.exact + prefix/suffix`。
- 如果源码 quote 失败，再尝试 plain quote 辅助恢复。
- 如果仍然失败，返回 `orphaned`。

`attachAnnotationsToBlocks`：

- 输入 Markdown AST 和 annotation 列表。
- 找到与 annotation range 相交的块级节点。
- 在对应 hast block 上挂 `data-annotation-ids`。

### 批注恢复测试

必须覆盖：

- 原文未变时 offset 直接命中。
- 前方插入文本后 quote 找回。
- Markdown 样式变化后 plain quote 找回。
- 重复句子通过 prefix/suffix 选中正确位置。
- 目标文本被删除后变成 `orphaned`。
- 跨 inline markdown 的选区能恢复。
- 第一版遇到跨块选区时能明确降级或报 diagnostic。

## 阶段 4：预览态批注 UI

目标：让批注在 Markdown 预览里可见、可点击、可定位。

第一版范围：

- 块级高亮。
- 侧栏展示批注列表。
- 点击批注滚动到目标块。
- 点击正文块选中对应批注。
- orphaned 批注单独展示，不误挂载到正文。

后置范围：

- 文字级高亮。
- 用户手动框选创建批注。
- 编辑态批注。
- CSS Custom Highlight API。
- overlay rect 交互层。

## 阶段 5：Electron 文件读写

目标：把渲染和批注接入本地文件。

建议 API：

```ts
window.journal.readEntry(date)
window.journal.writeEntry(date, markdown)
window.journal.readAnnotations(date)
window.journal.writeAnnotations(date, annotationFile)
```

注意：

- Renderer 不直接访问文件系统。
- Electron preload 暴露最小 API。
- 写入 annotation 时做 JSON schema 或运行时校验。
- Markdown 文件损坏不能影响 annotation 文件读取，反过来也一样。

## 推荐执行顺序

1. 新增测试框架和 Markdown 依赖。
2. 实现 `parseJournalMarkdown`，先通过 fixture 单元测试。
3. 实现 `renderJournalMarkdown`，先渲染基础 Markdown/GFM。
4. 加入 `remarkJournalDirectives`，解析 murmur/image。
5. 加入 `rehypeAnnotationAttributes` 的空实现，为批注预留接口。
6. 实现 annotation types 和 `createTextSelector`。
7. 实现 `resolveTextSelector`。
8. 实现 `attachAnnotationsToBlocks`。
9. 做预览态块级批注 UI。
10. 最后接入 Electron 文件读写。

## 第一轮实现边界

第一轮建议做到：

- Markdown fixture 可解析。
- Markdown 预览可渲染。
- 测试框架可运行。
- 自定义 murmur/image 至少能被识别，不要求 UI 完全精致。
- 批注只完成类型和测试用例设计，暂不做完整 UI。

这样可以先把底座打稳，再进入批注锚点和交互。
