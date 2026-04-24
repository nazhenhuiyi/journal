# Web Annotation 调研

这份文档调研 W3C Web Annotation 标准，用于辅助本产品的 AI 批注设计。

我们关心的重点不是完整实现一个开放网页批注协议，而是借鉴它对“批注内容、批注目标、目标片段、定位信息、资源状态”的拆分方式，让本地 Markdown 日记里的 AI 批注保持清楚、可迁移、可恢复。

## 调研目标

我们要解决的问题不是“怎么把 AI 批注写进日记”，而是：

- 如何让批注作为旁路数据存在，不污染用户原文。
- 如何描述批注本身的内容。
- 如何描述批注指向的目标资源。
- 如何描述目标资源中的具体片段。
- 原文变化后，如何尽可能重新定位批注。
- 定位失败时，如何保留批注而不误挂载。
- 哪些标准概念值得借鉴，哪些对本地产品来说过重。

## 主要来源

- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/)
- [W3C Web Annotation Vocabulary](https://www.w3.org/TR/annotation-vocab/)
- [W3C Web Annotation Protocol](https://www.w3.org/TR/annotation-protocol/)

## Web Annotation 是什么

Web Annotation 是 W3C 在 2017 年发布的推荐标准。它提供一个通用批注模型，让不同系统可以表达：

```txt
某个 Body 与某个 Target 有关系
```

最常见的场景是：

```txt
一段评论、解释、标签、修订建议
指向
某个网页、图片、PDF、音视频，或这些资源中的某个片段
```

Web Annotation 的核心价值不是 UI，也不是高亮算法，而是数据模型。它把批注拆成几个稳定概念：

- `Annotation`：批注对象本身。
- `Body`：批注内容。
- `Target`：批注目标。
- `SpecificResource`：带有选择器、状态、样式等约束的具体资源。
- `Selector`：说明目标资源中的哪一部分被选中。
- `State`：说明目标资源应该处于哪个版本或表示状态。
- `Motivation` / `purpose`：说明批注意图。

对本产品来说，这个模型非常适合用作结构参考。

## 核心模型

Web Annotation 的基础结构可以简化为：

```txt
Annotation = Body + Target
```

更完整一点：

```txt
Annotation
  body: 批注内容
  target:
    source: 被批注的资源
    selector: 资源中的具体片段
    state: 资源当时的状态
```

映射到本产品：

```txt
Annotation
  body: AI 生成的批注文本
  target:
    source: 某天日记 / 长日记正文
    selector: Markdown 源码或可见文本中的范围
    state: sourceHash / 文件版本信息
```

我们不需要完整照搬 W3C 的 JSON-LD 形式，因为本产品第一版是本地优先的私有日记，不需要跨平台公开交换。但 `body + target + selector + state` 这个概念结构应该保留。

## Annotation

Web Annotation 中，`Annotation` 是一个独立资源。它可以有自己的：

- `id`
- `type`
- `body`
- `target`
- 创建时间
- 修改时间
- 创建者
- 生成工具
- 权限信息
- 意图信息

这对我们有两个启发：

1. 批注不应该嵌进 Markdown 原文。
2. 批注应该有独立生命周期。

本产品中，AI 批注应存储在旁路 JSON 文件里，而不是写入 `YYYY-MM-DD.md`。

```txt
journal/
  entries/
    2026-04-24.md
  annotations/
    2026-04-24.json
```

这样做和 Web Annotation 的资源模型一致：原文是一个资源，批注是另一个资源，二者通过 `target` 建立关系。

## Body

`Body` 表示批注内容。

Web Annotation 支持多种 Body：

- 外部资源：例如一篇博客文章、一段音频、一个图片说明。
- 内嵌文本：`TextualBody`。
- 简单字符串：`bodyValue`，但标准更推荐使用 `TextualBody`，因为它能携带格式和语言信息。
- 多个 Body：例如一个批注同时包含评论、标签、修订建议。

本产品第一版可以采用更轻的结构：

```ts
body: {
  content: string
}
```

如果后续需要扩展，可以逐步增加：

```ts
body: {
  content: string
  format?: 'text/plain' | 'text/markdown'
  language?: string
}
```

AI 批注通常是文本，因此不需要一开始就支持外部 Body。但保留 `body` 对象，而不是直接使用 `body: string`，会让后续扩展更顺。

## Target

`Target` 表示批注指向的对象。

在 Web Annotation 中，最简单的 Target 可以是一个资源 IRI：

```json
{
  "target": "http://example.org/page1"
}
```

如果需要指向资源中的一部分，就会使用更具体的结构：

```json
{
  "target": {
    "source": "http://example.org/page1",
    "selector": {
      "type": "TextQuoteSelector",
      "exact": "selected text"
    }
  }
}
```

对本产品来说，`target` 至少需要表达两类目标：

- 指向整天：例如 AI 对当天整体状态的总结。
- 指向长日记中的一段文字：例如 AI 对某句话的观察或提问。

第一版可以设计为：

```ts
type AnnotationTarget =
  | {
      type: 'day'
    }
  | {
      type: 'longEntryRange'
      selector: TextSelector
    }
```

后续如果支持碎碎念、图片或附件，可以继续扩展 target 类型，而不影响已有批注。

## SpecificResource

Web Annotation 使用 `SpecificResource` 表达“资源的某个具体版本、片段或呈现方式”。

它的典型结构是：

```txt
SpecificResource
  source: 原始资源
  selector: 选中片段
  state: 资源状态
  style: 呈现提示
  purpose: 角色或用途
```

这个概念对我们非常重要。因为 AI 批注真正指向的不是“某个 JSON 字段”，而是：

```txt
某天日记里的长日记正文，在某个版本下，其中某一段 Markdown 文本
```

因此本产品里的 `target` 可以看作一个轻量版 SpecificResource：

```ts
target: {
  type: 'longEntryRange'
  source: {
    date: '2026-04-24'
    section: 'longEntry'
  }
  selector: TextSelector
  state: {
    sourceHash: string
  }
}
```

实际实现中不一定要把 `source` 和 `state` 都放进每条 annotation。它们也可以放在外层 `AnnotationFile` 里，避免重复：

```ts
type AnnotationFile = {
  version: 1
  date: string
  source: string
  sourceHash: string
  annotations: Annotation[]
}
```

这相当于给同一天的所有批注共享同一个 source/state。

## Selector

`Selector` 用来描述批注指向资源中的哪一部分。

Web Annotation 定义了多种 Selector：

- `FragmentSelector`
- `CssSelector`
- `XPathSelector`
- `TextQuoteSelector`
- `TextPositionSelector`
- `DataPositionSelector`
- `SvgSelector`
- `RangeSelector`

不是每一种都适合本产品。

对 Markdown 日记最重要的是：

- `TextQuoteSelector`
- `TextPositionSelector`
- `RangeSelector` 的思想
- `refinedBy` 的思想

CSS、XPath 更适合网页 DOM；SVG、DataPosition 更适合图像或二进制资源；FragmentSelector 在未来支持图片区域、音视频片段或文档页码时可能有用，但不是第一版重点。

## TextQuoteSelector

`TextQuoteSelector` 通过文本内容定位选区。它包含：

- `exact`：被选中的文本。
- `prefix`：选中文本之前的一小段上下文。
- `suffix`：选中文本之后的一小段上下文。

它的价值是：即使文本位置发生变化，只要这段文字和上下文还在，就有机会重新找到批注位置。

这和我们当前设计中的 `sourceQuote` / `plainQuote` 一致。

```ts
type TextQuote = {
  exact: string
  prefix?: string
  suffix?: string
}
```

本产品建议保留两套 quote：

```ts
sourceQuote: TextQuote
plainQuote: TextQuote
```

原因是 Markdown 有两套文本形态：

```txt
Markdown 源码文本
渲染后的可见文本
```

例如：

```md
今天真的**很累**。
```

源码文本是：

```txt
今天真的**很累**。
```

可见文本是：

```txt
今天真的很累。
```

如果用户只是调整了 Markdown 样式，源码 quote 可能失效，但 plain quote 仍然能帮助恢复定位。

## TextPositionSelector

`TextPositionSelector` 通过字符 offset 定位选区。它包含：

- `start`
- `end`

它的语义是：

```txt
从 start 字符位置开始
到 end 字符位置结束
包含 start，不包含 end
```

它的优点：

- 定位快。
- 数据小。
- 实现简单。
- 适合 sourceHash 未变化时直接复用。

它的缺点：

- 原文前方插入或删除内容后容易漂移。
- 单独使用时无法判断 offset 指向的文本是否仍然正确。

因此本产品不应该只保存 offset，而应该保存：

```ts
textPosition: {
  start: number
  end: number
}
```

同时用 `sourceQuote.exact` 做校验：

```txt
先按 offset 取文本
如果文本等于 sourceQuote.exact，则认为定位可信
如果不等，则进入 quote 搜索
```

## RangeSelector

`RangeSelector` 用两个选择器描述一个范围：

```txt
startSelector -> endSelector
```

它适合跨结构边界的选区，比如跨表格单元格、跨 DOM 节点、跨复杂文档结构。

本产品第一版不需要直接实现 W3C 的 `RangeSelector`，但它的思想值得借鉴：

```txt
一个批注范围可以由多个局部定位信息共同描述
```

例如长日记中的批注可以同时保存：

- 源码 offset。
- 源码 quote。
- 可见文本 quote。
- 行列位置。
- 所属 Markdown block 信息。

这些信息不是互相替代，而是共同提高恢复定位的成功率。

## Selector Refinement

Web Annotation 支持 `refinedBy`，也就是先用一个粗粒度 selector 选中范围，再用另一个 selector 在其中进一步细化。

例如：

```txt
先定位到第 5 段
再定位第 5 段里的某个短语
```

这对本产品的预览态很有启发。

我们的渲染链路可以是：

```txt
Markdown source range
-> Markdown AST block
-> block 内部的文字范围
```

第一版可以先只做块级挂载：

```txt
存储是文字级锚点
预览是块级呈现
```

后续如果需要更精确的文字级高亮，可以把块级节点当作粗 selector，再在块内做文字 selector。

## State

Web Annotation 的 `State` 用来描述目标资源当时应该处于什么状态。标准里常见的思路包括：

- 时间状态：资源在某个时间点的版本。
- 请求头状态：请求资源时需要使用的 HTTP header。
- 多个 state：提高恢复到正确资源表示的概率。

开放网页里，资源可能频繁变化，批注系统不一定能控制原文版本。

本产品比开放网页简单，因为日记文件是本地数据。我们可以直接保存：

```ts
sourceHash: string
```

`sourceHash` 的作用是：

- 判断长日记正文是否变化。
- 如果没有变化，直接信任已有定位。
- 如果发生变化，再进入重新定位流程。

注意：`sourceHash` 建议基于 `longEntryMarkdown` 计算，不基于完整 `YYYY-MM-DD.md` 文件。碎碎念、图片 block 或 front matter 的变化，不应该导致长日记批注重新挂载。

## Motivation 和 Purpose

Web Annotation 使用 `Motivation` 描述批注意图，例如：

- commenting
- describing
- tagging
- questioning
- replying
- editing

它还允许给 Body 或 Target 设置 `purpose`，说明某个资源在批注中的角色。

本产品不需要直接使用 W3C 的 motivation IRI，但可以保留一个产品化的 `kind` 字段：

```ts
kind: 'observation' | 'question' | 'format' | 'spelling'
```

大致对应：

- `observation`：观察、解释、共鸣。
- `question`：追问、反思提示。
- `format`：结构或表达建议。
- `spelling`：错别字、标点、轻量编辑建议。

这比直接暴露标准词汇更贴近日记产品的语义。

## Lifecycle

Web Annotation 允许记录创建、修改、生成工具、创建者等生命周期信息。

本产品建议保留：

```ts
id: string
author: 'ai' | 'user'
createdAt: string
updatedAt?: string
```

如果未来需要解释 AI 批注来源，可以扩展：

```ts
generatedBy?: {
  provider: string
  model: string
  promptVersion: string
}
```

第一版可以不加，避免把模型供应商和文件格式过早绑定。

## Style

Web Annotation 中的 `Style` 是给客户端的呈现提示，例如高亮颜色或 CSS 类。

本产品第一版不建议把具体 UI 样式写进 annotation 数据。

原因：

- 批注数据应该表达语义，不应该绑定当前主题。
- 高亮颜色、侧栏样式、块级标记属于 UI 层。
- 后续换主题或换视图时，不应该迁移历史批注数据。

如果确实需要样式控制，可以优先从 `kind` 推导：

```txt
question -> 问题样式
spelling -> 修订样式
observation -> 普通观察样式
```

## Collections 和 Protocol

Web Annotation 还定义了：

- `Annotation Collection`
- `Annotation Page`
- Web Annotation Protocol

这些主要服务于网络环境中的批注发布、分页获取、创建、更新、删除和同步。

本产品第一版是本地优先，不需要实现协议层。旁路 JSON 文件已经足够：

```txt
一个日期文件
对应
一个 annotation JSON
```

如果未来需要跨设备同步或云端协作，可以再参考 Web Annotation Protocol 的资源组织方式。

## 建议映射到当前方案

### AnnotationFile

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
- `source`：对应主日记文件路径。
- `sourceHash`：长日记正文 hash。
- `annotations`：批注列表。

### Annotation

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

对应关系：

- `Annotation` 对应 Web Annotation 的批注资源。
- `body.content` 对应文本 Body。
- `target` 对应 Target / SpecificResource。
- `kind` 对应产品化 motivation。
- `status` 是本产品的 UI 和锚定状态，不是标准字段。

### AnnotationTarget

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

对应关系：

- `day` 是整天级 Target。
- `longEntryRange` 是带 selector 的 SpecificResource。

### TextSelector

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

对应关系：

- `sourceQuote` 借鉴 `TextQuoteSelector`，但作用于 Markdown 源码。
- `plainQuote` 借鉴 `TextQuoteSelector`，但作用于渲染后的可见文本。
- `textPosition` 借鉴 `TextPositionSelector`，但作用于长日记 Markdown 源码。
- `linePosition` 是产品自定义补充，用于编辑器呈现和调试。

## 重新定位策略

基于 Web Annotation 的 selector/state 思想，本产品可以采用分层恢复策略。

### 1. sourceHash 未变化

如果 `sourceHash` 与当前长日记正文 hash 一致：

```txt
直接信任 textPosition
```

这是最快路径。

### 2. offset 校验

如果 hash 变化，先尝试原 offset：

```txt
取 markdown.slice(start, end)
对比 sourceQuote.exact
```

如果相等，说明虽然文件 hash 变化，但批注范围仍然有效。

### 3. sourceQuote 精确搜索

如果 offset 失败，在 Markdown 源码中搜索：

```txt
prefix + exact + suffix
```

或至少搜索：

```txt
exact
```

如果出现多个匹配，优先选择上下文最接近原 `prefix/suffix` 的位置。

### 4. plainQuote 精确搜索

如果源码 quote 失败，再在可见文本中搜索 `plainQuote`。

成功后需要把可见文本范围映射回 Markdown AST 或源码范围。

这一步实现成本更高，可以作为第二阶段增强。第一版也可以只把它作为辅助信息保存，暂不自动恢复。

### 5. orphaned

如果所有定位方式失败：

```ts
status: 'orphaned'
```

处理原则：

- 不删除批注。
- 不强行挂到错误位置。
- 在 UI 中放到“无法定位的批注”区域。
- 显示原始 quote，让用户知道它原本指向什么。
- 允许用户手动重新绑定或删除。

`orphaned` 不是 Web Annotation 标准字段，但它符合标准的核心精神：批注是独立资源，不应该因为目标暂时无法定位而静默消失。

## 预览态渲染

Web Annotation 只定义数据模型，不规定客户端如何高亮或渲染。

本产品的预览态可以走自己的 Markdown-aware 渲染链路：

```txt
Markdown source
-> Markdown AST with position
-> 根据 annotation source range 找到相交 block node
-> 给 block node 添加 data-annotation-ids
-> React 渲染批注标记
```

第一版建议采用：

```txt
存储是文字级锚点
预览是块级呈现
```

原因：

- Markdown 行内结构会拆成多个 DOM 节点。
- 精确文字级 highlight 会涉及跨 inline 节点范围。
- 块级挂载足以支撑 AI 批注的初版体验。
- 以后仍然可以在块内继续做文字级 refinement。

## 和标准的差异

我们不完整照搬 W3C，主要因为：

- W3C 面向跨系统互操作，我们第一版是本地私有日记。
- JSON-LD 对当前产品过重。
- Web Annotation 的 `id` 通常是 IRI，本产品可以使用本地字符串 id。
- 我们需要 Markdown-specific 的源码 quote 和可见文本 quote。
- 我们需要基于 `longEntryMarkdown` 的本地坐标系。
- 我们需要 `sourceHash` 这种本地文件版本判断。
- 我们第一版只做块级挂载，不做网页级 DOM 精确高亮。

这些差异是产品约束下的轻量化取舍，不是方向偏离。

## 最终结论

Web Annotation 提供了正确的数据模型方向：

```txt
annotation = body + target + selector + state
```

本产品应该借鉴这个模型，但保持本地优先和 Markdown-aware：

- 批注旁路存储，不污染主日记 Markdown。
- 使用 `body + target` 表达批注内容和目标。
- 使用 `TextQuoteSelector` 思想保存 `exact/prefix/suffix`。
- 使用 `TextPositionSelector` 思想保存源码 offset。
- 用 `sourceHash` 表达本地资源状态。
- 用多重锚点提高重新定位成功率。
- 定位失败时进入 `orphaned`，不静默删除。
- 预览态基于 Markdown AST 做块级挂载。

这与当前 `AI批注.md` 中的方案一致，也为后续支持碎碎念、图片、附件和跨设备同步保留了扩展空间。
