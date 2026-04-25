# Motion 动效使用指南

## 为什么选 Motion

本项目是 Vite + React + Electron 应用，主要界面动效都和 React 状态有关，例如页面进入、批注选中、侧栏列表、文本高亮框切换。Motion 的声明式 API 能直接绑定组件状态，比手写 DOM 动画或复杂 CSS keyframes 更适合当前结构。

官方文档入口：

- [Motion for React](https://motion.dev/docs/react)
- [Motion accessibility](https://motion.dev/docs/react-accessibility)

当前项目使用包：

```tsx
import { AnimatePresence, motion } from 'motion/react'
import type { Transition } from 'motion/react'
```

## 什么时候用 Motion

优先使用 Motion 的场景：

- 动画依赖 React 状态，例如选中、展开、关闭、切换视图。
- 组件进入或离开 DOM，需要入场/离场动画。
- 列表需要错落出现、排序、插入、删除。
- 元素位置或尺寸会变化，希望自动补间。
- 交互反馈需要兼顾鼠标、触摸、键盘状态。

继续使用 CSS transition 的场景：

- hover 时改颜色、边框、阴影。
- 单个元素的轻量视觉反馈。
- 不依赖 React 状态的装饰性过渡。

暂不引入 GSAP 或 React Spring：

- GSAP 更适合复杂时间轴、SVG、滚动叙事或高度定制动画。
- React Spring 更偏物理弹性手感。当前项目的批注、阅读、编辑体验更需要安静、克制、状态驱动的动效。

## 全局配置

项目在 `src/App.tsx` 使用 `MotionConfig`：

```tsx
import { MotionConfig } from 'motion/react'
import MarkdownPreviewPage from './pages/MarkdownPreviewPage'

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <MarkdownPreviewPage />
    </MotionConfig>
  )
}
```

`reducedMotion="user"` 会尊重系统的减少动态效果设置。原则上，页面位移、缩放、布局动画都应该允许 Motion 自动降级；必要时可以用 `useReducedMotion` 手动替换成 opacity 或颜色变化。

## 核心概念

### motion 组件

把普通元素替换成 `motion.*` 后，就可以使用动画属性：

```tsx
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  内容
</motion.div>
```

常用属性：

- `initial`：初始状态。
- `animate`：目标状态。
- `exit`：离场状态，需要配合 `AnimatePresence`。
- `transition`：动画参数，例如时长、缓动、延迟、弹簧。
- `whileHover`：hover 时状态。
- `whileTap`：按下时状态。
- `layout`：开启布局变化补间。

### Transition

建议把可复用的动效参数抽出来，并用 `Transition` 类型约束：

```tsx
const panelTransition: Transition = {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1],
}
```

当前项目的默认手感：

- 页面和大面板：`duration` 约 `0.3` 到 `0.36`。
- 列表和小组件：`duration` 约 `0.18` 到 `0.24`。
- 动效方向要轻：位移通常控制在 `8px` 到 `16px`。
- 阅读型界面避免弹跳过强，优先使用柔和 ease。

### AnimatePresence

React 条件渲染会立即卸载组件，`exit` 动画没有机会执行：

```tsx
{show && <motion.div exit={{ opacity: 0 }} />}
```

使用 `AnimatePresence` 后，Motion 会在组件离开前保留它，等 `exit` 动画结束再卸载：

```tsx
<AnimatePresence>
  {show && (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    />
  )}
</AnimatePresence>
```

如果不希望首次渲染播放入场动画，可以加：

```tsx
<AnimatePresence initial={false}>
  {children}
</AnimatePresence>
```

当前项目用它处理选中批注的高亮描边切换。

### Variants

`variants` 适合父子组件联动，例如列表错落进入：

```tsx
<motion.div
  initial="hidden"
  animate="visible"
  variants={{
    hidden: {},
    visible: {
      transition: {
        delayChildren: 0.18,
        staggerChildren: 0.035,
      },
    },
  }}
>
  {items.map((item) => (
    <motion.button
      key={item.id}
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0 },
      }}
    />
  ))}
</motion.div>
```

### Layout 动画

元素尺寸、位置变化时，`layout` 可以自动补间：

```tsx
<motion.button layout animate={{ scale: isActive ? 1.012 : 1 }}>
  批注内容
</motion.button>
```

适合：

- 选中态改变尺寸或视觉重量。
- 批注列表新增、删除、重排。
- 面板展开/折叠。

使用时注意：

- 不要让文字重排过于频繁。
- 不要在大面积滚动正文上滥用 `layout`。
- 对阅读界面保持轻微变化，避免干扰内容。

## 当前项目接入点

### 全局可访问性

文件：`src/App.tsx`

用途：

- 提供 Motion 全局配置。
- 统一尊重系统减少动态效果设置。

### Markdown 预览页

文件：`src/pages/MarkdownPreviewPage.tsx`

已接入：

- 页面根节点淡入。
- 主容器轻微上浮进入。
- header、正文区、批注侧栏分区进入。
- 批注按钮 stagger 进入。
- 批注按钮 hover 上移、tap 缩放。
- 选中批注轻微放大。
- 活跃高亮描边使用 `AnimatePresence` 做切换动画。

## 项目动效原则

这个应用偏阅读、记录、批注，不适合夸张动效。新增动效时遵守以下原则：

- 动效服务于状态理解，不做纯炫技装饰。
- 大面积内容只做 opacity 或极小位移。
- 列表和按钮反馈可以稍微明显，但时间要短。
- 选中态变化要帮助用户定位，不要抢正文注意力。
- 必须尊重 `prefers-reduced-motion`。
- 不添加无限循环动效，除非它表达明确的进行中状态。
- 避免同时动画多个大区域，减少视觉负担。

## 常见模式

### 页面进入

```tsx
<motion.main
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.3 }}
>
  页面内容
</motion.main>
```

### 面板进入

```tsx
<motion.aside
  initial={{ opacity: 0, x: 14 }}
  animate={{ opacity: 1, x: 0 }}
  transition={panelTransition}
>
  侧栏
</motion.aside>
```

### 按钮反馈

```tsx
<motion.button
  whileHover={{ y: -2 }}
  whileTap={{ scale: 0.99 }}
  transition={{ duration: 0.2 }}
>
  操作
</motion.button>
```

### 条件渲染离场

```tsx
<AnimatePresence initial={false}>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
    />
  )}
</AnimatePresence>
```

### 选中态

```tsx
<motion.button
  layout
  animate={{ scale: isActive ? 1.012 : 1 }}
>
  {content}
</motion.button>
```

## 验证清单

新增或调整动效后至少检查：

- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- `npx vite build`

视觉检查：

- 页面首次进入是否自然。
- 点击批注时选中态是否清楚。
- 切换批注时高亮描边是否稳定。
- 小屏下动效是否造成布局跳动。
- 开启系统减少动态效果后是否舒适。

## 后续可扩展方向

- 路由切换时用 `AnimatePresence` 做页面离场。
- 批注新增/删除时用 `layout` 和 `exit` 补足列表动画。
- 批注详情面板展开/折叠时使用高度或 opacity 动画。
- 搜索结果定位正文时，加轻微闪烁或描边淡出，帮助用户找到目标。
- 如果未来有编辑器光标、选区、悬浮工具条，可以用 Motion 做低幅度跟随和出现动画。
