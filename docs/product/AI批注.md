# AI 批注

这份文档记录 AI 批注的存储和渲染方案。批注系统先独立讨论，不写入每日主日记文件。

## 核心原则

AI 批注不写进 `YYYY-MM-DD.md`。

每日主日记文件只保存用户自己留下的内容：长日记、碎碎念、图片。AI 批注是外部阅读者的痕迹，应该作为旁路数据保存。

这样可以保证：

- 用户原文保持干净。
- 批注可以随时隐藏或删除。
- 导出纯日记时不包含 AI 内容。
- AI 相关数据损坏或清空时，不影响用户原始日记。

## 文件结构

```txt
journal/
  entries/
    2026-04-24.md
  annotations/
    2026-04-24.json
```

- `entries/2026-04-24.md`：用户当天主日记文件。
- `annotations/2026-04-24.json`：当天 AI 批注文件。

## 批注模型

批注借鉴 Web Annotation 的基本思想：

```txt
annotation = body + target
```

- `body`：批注内容。
- `target`：批注指向的日记位置。

不完整照搬 W3C JSON-LD，保持本产品自己的轻量结构。

## AnnotationFile

```ts
type AnnotationFile = {
  version: 1
  date: string
  source: string
  sourceHash: string
  annotations: Annotation[]
}
```

字段说明：

- `version`：批注文件格式版本。
- `date`：对应日期。
- `source`：对应的主日记文件路径。
- `sourceHash`：创建或更新批注时，对长日记正文计算出的 hash。
- `annotations`：批注列表。

`sourceHash` 基于长日记正文计算，不基于整个 `YYYY-MM-DD.md`。第一版批注只作用于长日记正文，碎碎念变化不应该导致长日记批注重新挂载。

## Annotation

```ts
type Annotation = {
  id: string
  author: 'ai' | 'user'
  kind: 'observation' | 'question' | 'format' | 'spelling'
  target: AnnotationTarget
  body: {
    content: string
  }
  status: 'visible' | 'hidden' | 'orphaned'
  createdAt: string
  updatedAt?: string
}
```

字段说明：

- `id`：批注唯一标识。
- `author`：批注来源。虽然当前主要讨论 AI，但保留用户批注扩展空间。
- `kind`：批注类型。
- `target`：批注目标。
- `body.content`：批注正文。
- `status`：批注状态。
- `createdAt`：创建时间。
- `updatedAt`：更新时间。

批注类型：

- `observation`：观察。
- `question`：问题。
- `format`：格式建议。
- `spelling`：错别字或标点类建议。

## AnnotationTarget

```ts
type AnnotationTarget =
  | {
      type: 'longEntryRange'
      selector: TextSelector
    }
  | {
      type: 'day'
    }
```

第一版只讨论两类目标：

- `longEntryRange`：指向长日记中的一段文字。
- `day`：指向整天。

碎碎念和图片批注暂缓，不在第一版处理。

## TextSelector

长日记文字批注使用多重锚点。

```ts
type TextSelector = {
  sourceQuote: {
    exact: string
    prefix?: string
    suffix?: string
  }
  plainQuote: {
    exact: string
    prefix?: string
    suffix?: string
  }
  textPosition: {
    start: number
    end: number
  }
  linePosition: {
    startLine: number
    startColumn: number
    endLine: number
    endColumn: number
  }
}
```

### sourceQuote

基于 Markdown 源码的选中文本。

例如源码：

```md
今天真的**很累**。
```

如果用户在源码中选中了整句，`sourceQuote.exact` 可能是：

```txt
今天真的**很累**。
```

### plainQuote

基于 Markdown 渲染后可见文本的选中文本。

同样的源码：

```md
今天真的**很累**。
```

对应的 `plainQuote.exact` 是：

```txt
今天真的很累。
```

保留 `plainQuote` 是为了处理 Markdown 样式边界变化。例如原文从：

```md
今天真的很累。
```

变成：

```md
今天真的**很累**。
```

源码 quote 可能失效，但可见文本仍然能帮助重新定位。

### textPosition

基于长日记 Markdown 源码的字符 offset。

- `start`：从 0 开始。
- `end`：从 0 开始，表示结束位置。

`textPosition` 定位快，但原文前方增删内容后容易失效。

### linePosition

基于长日记 Markdown 源码的行列位置。

- `startLine`：开始行，从 1 开始。
- `startColumn`：开始列，从 1 开始。
- `endLine`：结束行，从 1 开始。
- `endColumn`：结束列，从 1 开始。

行列位置用于编辑器呈现和调试。它不是唯一锚点，因为用户在前方增删行后，行号会变化。

## 坐标系

第一版批注只作用于长日记正文。

因此所有位置坐标都基于 `longEntryMarkdown`，不基于完整 `YYYY-MM-DD.md` 文件。

不计入坐标的内容：

- Front Matter。
- 文末碎碎念 block。
- 图片 block。

这样可以减少偏移混乱。

## 创建批注

创建文字批注时，需要保存：

- 源码选中文本。
- 可见文本选中文本。
- 源码字符 offset。
- 源码行列位置。
- 源码前后文。
- 可见文本前后文。

前后文建议先取 32 个字符。

示例：

```json
{
  "id": "ann_20260424_230001",
  "author": "ai",
  "kind": "observation",
  "target": {
    "type": "longEntryRange",
    "selector": {
      "sourceQuote": {
        "exact": "今天真的**很累**。",
        "prefix": "早上醒来的时候，",
        "suffix": "后来还是出了门。"
      },
      "plainQuote": {
        "exact": "今天真的很累。",
        "prefix": "早上醒来的时候，",
        "suffix": "后来还是出了门。"
      },
      "textPosition": {
        "start": 42,
        "end": 54
      },
      "linePosition": {
        "startLine": 8,
        "startColumn": 1,
        "endLine": 8,
        "endColumn": 13
      }
    }
  },
  "body": {
    "content": "这句话可以就这样放在这里，不需要解释。"
  },
  "status": "visible",
  "createdAt": "2026-04-24T23:00:01+08:00"
}
```

## 重新定位

打开日记时，需要把批注重新挂载到当前长日记正文。

匹配顺序：

1. 使用 `linePosition` 在源码中快速定位，并校验 `sourceQuote.exact`。
2. 使用 `textPosition` 在源码中定位，并校验 `sourceQuote.exact`。
3. 在源码中搜索 `sourceQuote.exact`。
4. 如果源码搜索失败，生成 Markdown 可见文本映射。
5. 在可见文本中搜索 `plainQuote.exact`。
6. 如果找到，通过映射还原到源码块级范围。
7. 如果仍然找不到，标记为 `orphaned`。

找不到的批注不要删除。

## 预览态渲染

第一版重点处理预览态，不处理编辑态批注。

预览态不做精确文字级 highlight，而是把批注挂到 Markdown 渲染后的块级节点上。

原则：

```txt
annotation selector
-> resolve 成 source offset range
-> Markdown AST block position
-> 给对应块级节点添加 data-annotation 相关属性
-> 渲染 HTML 或 React
```

这样可以避免处理 inline DOM 跨节点问题。

例如 Markdown：

```md
今天真的**很累**，但还是出门了。
```

渲染后可能是：

```html
<p>
  今天真的
  <strong>很累</strong>
  ，但还是出门了。
</p>
```

批注不直接包裹 `strong` 内外的文字，而是挂到外层块级节点：

```html
<p data-annotation-ids="ann_001">
  今天真的
  <strong>很累</strong>
  ，但还是出门了。
</p>
```

## 预览态文字级高亮增强

块级挂载是第一版的稳定方案。如果后续需要预览态文字级高亮，可以在块级挂载之上增加文字级渲染。

推荐组合：

```txt
CSS Custom Highlight API：负责文字底色
Range.getClientRects() overlay：负责交互和精致视觉层
```

它们不是二选一，而是分工不同。

### CSS Custom Highlight API

CSS Custom Highlight API 可以把一个或多个 DOM `Range` 注册成命名高亮。

```ts
const highlight = new Highlight(...ranges)
CSS.highlights.set('journal-annotation-ann_001', highlight)
```

然后用 CSS 控制样式：

```css
::highlight(journal-annotation-ann_001) {
  background-color: rgba(255, 220, 120, 0.32);
}
```

优点：

- 不修改 DOM。
- 能跨 text node。
- 浏览器负责处理换行和基础绘制。
- 比手动包裹 `span` 更适合 React 和 Markdown 预览。

限制：

- 样式能力有限。
- 主要适合背景色、文字色、下划线等轻量样式。
- 圆角、边框、阴影、浮层锚点等需要额外 overlay。

使用前需要做特性检测：

```ts
const supportsCustomHighlight =
  'highlights' in CSS && 'Highlight' in window
```

### Range.getClientRects() overlay

同一个 DOM `Range` 可以用 `getClientRects()` 获取屏幕矩形。

```ts
const rects = Array.from(range.getClientRects())
```

这些矩形可以用于绘制额外 overlay：

```tsx
<div className="annotation-overlay">
  {rects.map((rect) => (
    <div
      className="annotation-outline"
      style={{
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
      }}
    />
  ))}
</div>
```

overlay 适合做：

- hover 轮廓。
- 当前选中批注的强调。
- 圆角外框。
- 侧边连接线。
- 小圆点或操作按钮。
- 动画。
- 批注气泡锚点。

### 分层建议

预览态可以分成四层：

```txt
Layer 1: Markdown Preview DOM
Layer 2: CSS Highlight API text background
Layer 3: Overlay rect layer
Layer 4: Annotation popover/sidebar
```

普通状态：

- 只显示 CSS Highlight 背景。
- 块级节点保留 `data-annotation-ids`。
- overlay 不常驻，或只显示很轻的侧边标记。

hover / selected 状态：

- 保留 CSS Highlight。
- 使用 overlay 画更明显的边框、连接线或浮层锚点。

### 技术链路

完整链路：

```txt
annotation selector
-> resolve 到 Markdown source range
-> Markdown AST / source map 映射到 DOM Range
-> CSS.highlights 注册 Range
-> Range.getClientRects() 生成 overlay rect
-> 点击或 hover 打开批注 UI
```

关键难点仍然是：

```txt
Markdown source range -> DOM Range
```

因此文字级高亮增强不改变存储结构。批注 truth 仍然是 Markdown source range 和 selector，DOM Range 只是预览态渲染产物。

### 重排处理

overlay rect 不是永久有效的，以下情况需要重新计算：

- 窗口 resize。
- 预览容器尺寸变化。
- Markdown 内容变化。
- 字体加载完成。
- 图片加载导致排版变化。
- hover / selected 状态变化。

可用机制：

- `ResizeObserver`。
- `MutationObserver`。
- `document.fonts.ready`。
- `requestAnimationFrame`。

## 块级挂载

批注 resolve 后得到源码范围：

```ts
type ResolvedAnnotationRange = {
  annotationId: string
  start: number
  end: number
}
```

Markdown AST 中的块级节点也有源码范围：

```ts
type MarkdownBlock = {
  type: 'paragraph' | 'heading' | 'blockquote' | 'listItem' | 'code'
  start: number
  end: number
}
```

如果批注范围和块级节点范围有交集，就把批注挂到该块：

```ts
function intersects(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd
}
```

第一版支持的块级节点：

- `paragraph`
- `heading`
- `blockquote`
- `listItem`
- `code`

如果一个批注跨多个块，就给多个块都添加同一个 `annotationId`。

## AST 转换

实现上建议在 Markdown AST 到 HTML/React 的转换过程中添加属性，而不是渲染后直接操作 DOM。

概念示例：

```ts
node.data ||= {}
node.data.hProperties ||= {}
node.data.hProperties['data-annotation-ids'] = annotationIds.join(' ')
```

这样渲染结果会带上：

```html
<p data-annotation-ids="ann_001 ann_002">...</p>
```

## 预览态 UI

预览态只做轻标记。

建议：

- 有批注的块旁边显示一个低存在感标记。
- 点击块或标记后，在侧边或浮层显示批注。
- 不把 AI 批注内容直接插入正文。
- 批注可以隐藏或删除。
- 找不到位置的批注统一放入“无法定位的批注”区域。

简单样式方向：

```css
[data-annotation-ids] {
  position: relative;
}

[data-annotation-ids]::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 0.65em;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: var(--annotation-dot);
}
```

## 编辑态

编辑态批注先暂缓。

如果未来做编辑态批注，建议使用 CodeMirror decorations，不直接操作 DOM。

CodeMirror 可以基于源码 offset 添加 decoration，内部会处理编辑器 DOM 分片问题。

## 暂时不做

- 不把批注写入主日记 Markdown。
- 第一版不做预览态文字级 highlight，后续可用 CSS Custom Highlight API + overlay 增强。
- 不手动操作 DOM Range 包裹文字。
- 不做碎碎念和图片批注。
- 不做复杂 fuzzy matching。
- 不在用户写作时自动插入大量 AI 批注。

## 后续问题

- 批注由用户主动触发，还是写完后提供一次轻量入口。
- 批注最多生成几条。
- 批注卡片的具体视觉形态。
- `orphaned` 批注的恢复和删除流程。
- 是否允许用户自己写批注。
- 是否需要批注历史版本。
