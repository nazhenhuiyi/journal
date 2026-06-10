# Electron 桌面端验收工具链

这份文档梳理桌面端 Electron 应用的真实验收流程。下面统一把这套能力叫“验收工具链”。

目标不是把验收做得很重，而是让每次检查都更快、更稳定：知道怎么启动、怎么输入、怎么等待、怎么查 Git 仓库、失败后看哪里。

## 1. 核心思路

桌面端验收要拆成三件事，不要混在一起：

- 界面验收：确认页面能打开、能输入、能本地保存、布局没有明显问题。
- 同步验收：确认本地 Git 仓库能提交、推送到 GitHub，并且不会产生多余提交。
- 视觉确认：看真实 Electron 窗口，确认它长得对。

默认情况下，界面验收不要连真实 GitHub，也不要直接用真实 `~/.journal`。只有用户明确说“真实环境验收”或“验证 GitHub 同步”，才使用真实数据目录和真实远端仓库。

## 2. 为什么之前会慢

之前桌面端验收容易绕来绕去，主要是因为这些事情混在了一起：

- `npm run dev` 会启动开发服务器，也会通过插件自动拉起 Electron，容易同时出现多个窗口。
- 旧的 Electron 窗口可能还在跑旧代码，容易误判。
- 电脑操作工具（Computer Use）很适合看真实窗口，但不一定稳定点击和输入。
- 日记正文使用 CodeMirror 编辑器，不是普通输入框，直接改网页内容可能不会触发保存。
- 自动保存、天气刷新、定时拉取、提交、推送可能同时发生。
- 真实 `~/.journal` 里有历史数据、未跟踪文件、远端状态和旧提交，会影响判断。

所以验收工具链要做的事，是把这些变量拆开，让每一步都有清楚的证据。

## 3. 本次真实验收复盘

这次我们在真实 Electron 窗口里写了日记，并检查了真实 `~/.journal` 仓库和 GitHub 远端。

### 3.1 有效做法

- 先重新构建桌面端主进程，避免 Electron 跑旧代码。
- 不直接跑 `npm run dev`，而是单独启动网页开发服务器，再手动启动 Electron。
- 给 Electron 打开远程调试端口，用远程调试协议操作真实页面。
- 电脑操作工具只用来看窗口和读页面结构，不承担主要输入。
- 通过远程调试协议聚焦“日记正文”编辑器，再插入文字，让输入经过真实编辑器链路。
- 写入后同时检查四类证据：页面状态、日记文件、本地 Git、远端 GitHub。
- 验收结束只清理本轮启动的进程，不碰其他应用进程。

### 3.2 发现的问题

这次真实验收发现了两个关键问题：

- 分支引用问题：同步核心使用短分支名时，可能留下 `.git/main`，后续让仓库进入“游离 HEAD”状态。表现是 `git status` 里出现 `HEAD (no branch)`。
- 空日记提交问题：空白日记只写入日期、位置、天气这类系统信息时，也可能产生提交。这样的提交没有用户内容，应该避免。

所以真实同步验收不能只看页面显示“已同步”，还要看 Git 日志和最新提交内容。

## 4. 三层验收

### 4.1 启动验收

启动验收只负责把应用稳定打开。

它应该做：

- 启动网页开发服务器。
- 启动一个 Electron 进程。
- 记录这两个进程的进程号。
- 等待页面真正打开。
- 保存主进程日志和页面日志。
- 结束时只清理本轮启动的进程。

它不负责：

- 判断页面好不好看。
- 连接 GitHub。
- 验证复杂业务。

### 4.2 界面验收

界面验收负责稳定操作桌面端界面。

它应该做：

- 定位真实 Electron 窗口。
- 找到“日记正文”编辑器。
- 输入一段验收文字。
- 等待本地文件保存完成。
- 截图或读取窗口状态，供视觉确认。

它不负责：

- 验证 GitHub 推送。
- 靠屏幕坐标完成主要操作。

### 4.3 同步验收

同步验收负责验证 Git 同步链路。

它应该做：

- 使用专用测试仓库，或在用户明确要求时使用真实 `~/.journal`。
- 检查本地分支、未提交改动、最近提交、远端分支。
- 确认连续输入不会产生很多提交。
- 确认没有“只有系统元数据”的空提交。
- 确认没有密集重试提交。

它不负责：

- 判断页面排版。
- 验证每个按钮是否美观。

## 5. 当前可执行流程

优先使用已经落地的 Playwright Electron E2E：

```sh
npm run e2e:desktop
npm run e2e:desktop:sync
```

`npm run e2e:desktop` 使用隔离 journal 目录、隔离 Electron userData，并设置 `JOURNAL_DISABLE_WEATHER=1`，适合日常界面和本地保存回归。

`npm run e2e:desktop:sync` 使用真实 GitHub 测试仓库，需要 `JOURNAL_E2E_GITHUB_REMOTE_URL` 和 `JOURNAL_E2E_GITHUB_TOKEN`，适合验证应用层真实同步。不要用真实日记仓库跑这条测试。

下面的手动流程只作为临场排查、视觉确认或远程调试 fallback。

### 5.1 重新构建桌面端

先构建一次，确保 Electron 主进程使用最新代码：

```sh
npm --workspace @journal/desktop exec vite build
```

### 5.2 单独启动网页开发服务器

不要直接用 `npm run dev` 做验收。它可能自动启动 Electron，导致多个窗口混在一起。

当前可以用这个命令只启动网页开发服务器：

```sh
node --input-type=module -e "import { createServer } from 'vite'; import react from '@vitejs/plugin-react'; import tailwindcss from '@tailwindcss/vite'; const server = await createServer({ configFile: false, root: 'apps/desktop', plugins: [react(), tailwindcss()], server: { host: '127.0.0.1', port: 5174, strictPort: false } }); await server.listen(); server.printUrls(); setInterval(() => {}, 1 << 30);"
```

这里最重要的是 `configFile: false`。它可以避免加载桌面端 Vite 配置里的 Electron 插件，从而避免自动开 Electron 窗口。

### 5.3 手动启动 Electron

另起一个进程启动 Electron：

```sh
cd apps/desktop
VITE_DEV_SERVER_URL=http://127.0.0.1:5174/ ../../node_modules/.bin/electron --remote-debugging-port=9223 .
```

然后检查远程调试目标：

```sh
curl -s http://127.0.0.1:9223/json/list
```

期望看到页面标题是“且留”，地址类似：

```txt
http://127.0.0.1:5174/#/preview
```

### 5.4 看真实窗口

用电脑操作工具看真实 Electron 窗口，主要确认：

- 应用是否打开。
- 日期是否正确。
- 今日页、日历页、设置页入口是否可见。
- 同步状态是否显示正常。
- 页面有没有明显错位、重叠、空白。

如果电脑操作工具能看窗口但不能点击，不要反复重启。直接改用远程调试协议输入。

### 5.5 输入日记正文

日记正文不是普通输入框，而是 CodeMirror 编辑器。要先定位它：

```js
document.querySelector('[aria-label="日记正文"][role="textbox"]')
```

输入时不要直接改 `textContent`。推荐先让编辑器获得焦点：

```js
const editor = document.querySelector('[aria-label="日记正文"][role="textbox"]')
editor?.focus()
```

然后通过远程调试协议调用插入文字能力：

```txt
Input.insertText
```

这样输入会经过真实编辑器，能触发 React 状态、本地保存和同步调度。

## 6. 等待和判断

验收不要只靠“睡几秒”。每一步都要看事实。

### 6.1 判断本地保存

检查日记文件：

```sh
sed -n '1,120p' ~/.journal/entries/2026/06/2026-06-09.md
```

检查同步范围内有没有未提交改动：

```sh
git -C ~/.journal status --short -- entries media annotations manifest.json
```

### 6.2 判断推送完成

检查本地分支和远端分支是否一致：

```sh
git -C ~/.journal rev-parse HEAD
git -C ~/.journal rev-parse origin/main
git -C ~/.journal ls-remote origin refs/heads/main
```

这三个值应该一样。

### 6.3 判断页面状态

可以在页面里读取：

```js
(() => ({
  sync: document.querySelector('.journal-sync-button')?.textContent ?? '',
  editor: document.querySelector('[aria-label="日记正文"][role="textbox"]')?.textContent ?? '',
  page: location.hash,
}))()
```

其中：

- `sync` 是页面上的同步状态。
- `editor` 是当前编辑器正文。
- `page` 是当前页面路由。

## 7. 真实同步验收清单

只有明确要验收真实同步时，才使用这部分。

### 7.1 开始前先记录

```sh
git -C ~/.journal remote -v
git -C ~/.journal status --short --branch
git -C ~/.journal branch --show-current
git -C ~/.journal log --oneline --decorate -8 --stat
test -f ~/.journal/.git/main && echo short-ref-exists || echo short-ref-missing
sed -n '1p' ~/.journal/.git/HEAD
```

要重点看：

- 当前分支是不是 `main`。
- 是否出现 `HEAD (no branch)`。
- 是否存在 `.git/main`。
- 最近有没有密集的重试提交。

### 7.2 写入后检查

```sh
git -C ~/.journal status --short --branch
git -C ~/.journal status --short -- entries media annotations manifest.json
git -C ~/.journal log --oneline --decorate -10 --stat
git -C ~/.journal show --format=fuller --stat --patch --max-count=1 HEAD
git -C ~/.journal rev-parse HEAD
git -C ~/.journal rev-parse origin/main
git -C ~/.journal ls-remote origin refs/heads/main
```

通过标准：

- 仓库仍在 `main` 分支。
- 同步范围内没有未提交改动。
- 最新提交只包含这次预期的日记内容。
- 连续输入应该合并成一个提交。
- 本地 `HEAD`、`origin/main`、远端 `refs/heads/main` 三者一致。

### 7.3 看 GitHub 日志页

如果连接了 GitHub，最好打开仓库提交列表多看几眼。

重点看：

- 最新提交数量是否符合预期。
- 是否出现很多连续的“重试同步”提交。
- 最新提交是否只改了日记相关文件。
- 是否出现空日记提交。
- 是否出现只有日期、天气、位置的系统信息提交。

不要只看“已同步”。GitHub 日志页最容易看出是否提交太频繁。

## 8. 常见失败信号

### 8.1 Git 相关

- `HEAD (no branch)`：仓库进入游离 HEAD，说明分支处理有问题。
- `.git/main` 存在：可能有短分支引用残留。
- 本地 `HEAD` 和 `origin/main` 长时间不一致：推送或拉取可能失败。
- 同步范围内一直有未提交改动：提交或合并可能没完成。
- 最新提交只包含日期、天气、位置：空日记判断有问题。

### 8.2 同步节奏相关

- 连续出现很多 `Retry journal sync after remote update`：重试太激进。
- 没有编辑内容，但页面频繁显示“同步中”：状态刷新或定时拉取可能太打扰。
- 连续输入产生多个提交：本地保存和延迟推送没有配合好。

### 8.3 界面相关

- 输入了内容但文件没变：可能没有通过真实编辑器输入。
- 电脑操作工具能看到窗口但不能点击：改用远程调试协议。
- 日期不对：先确认本机日期和时区，避免误判。

## 9. 默认数据隔离

界面验收默认不要使用真实 `~/.journal`。

推荐临时目录结构：

```txt
/tmp/journal-e2e-<timestamp>/
  entries/
  annotations/
  media/
  manifest.json
  settings.json
  .git/
```

这样界面改动不会污染真实日记，也不会误触发真实 GitHub 同步。

只有用户明确要求“真实环境验收”，才使用真实 `~/.journal`。使用前必须先记录当前分支、远端、最近提交和未提交改动。

## 10. 页面可测试性要求

桌面端关键区域要有稳定定位方式：

- 日记正文：`aria-label="日记正文"`。
- 同步设置面板：`aria-label="同步设置"`。
- 立即同步按钮：按钮文字是“立即同步”。
- 保存/同步状态：能通过语义、类名或测试标记查询。
- 当前页面：能通过 `location.hash` 判断。

优先使用语义和 `aria-label`。只有语义不够稳定时，再加测试标记。

## 11. 脚本维护建议

当前根目录已经有这些稳定入口：

```json
{
  "scripts": {
    "e2e:desktop": "npm --workspace @journal/desktop exec vite build && playwright test e2e/desktop.spec.ts",
    "e2e:desktop:sync": "npm --workspace @journal/desktop exec vite build && playwright test e2e/desktop-sync.spec.ts",
    "e2e:desktop:all": "npm --workspace @journal/desktop exec vite build && playwright test e2e/desktop.spec.ts e2e/desktop-sync.spec.ts"
  }
}
```

继续维护这些脚本时要保证：

- 自动选择隔离 `JOURNAL_DIR` 和 `JOURNAL_USER_DATA_DIR`。
- 默认关闭天气请求。
- 启动真实 Electron 应用，而不是只测浏览器预览。
- 使用 CodeMirror 的真实 textbox 输入路径。
- 同步测试只使用专用 GitHub 测试仓库。
- 失败时输出 journal 目录、关键日志和 Git 状态摘要，但不要把 GitHub token 写进截图、trace 或对话。
- 退出时只清理本轮启动的进程和临时目录。

如果以后需要补 `qa:*` 脚本，应复用现有 `e2e/desktopApp.ts` 的隔离启动能力，而不是重新写一套启动流程。

## 12. 后续补强顺序

建议按这个顺序继续补：

1. 继续补齐关键控件的可访问名称，少依赖 CSS class。
2. 页面暴露更稳定的“已就绪”和当前保存/同步状态，方便脚本等待。
3. 给失败输出补结构化摘要：当前路由、保存状态、同步状态、dirty paths、最近 commit。
4. 视觉确认仍以真实 Electron 窗口为准，浏览器预览只作为补充。
5. 真实 `~/.journal` 验收只在用户明确要求时执行。

这样既能提高验收效率，也能减少对真实日记和真实远端仓库的打扰。
