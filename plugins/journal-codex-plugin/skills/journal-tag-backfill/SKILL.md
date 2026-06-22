---
name: journal-tag-backfill
description: 从任意 Codex 工作区访问已配置的 journal data git 仓库，为过往日记和图片补充标题、摘要、标签、属性或元数据，并记录批处理日志。用于用户要求“扫描日记”“补 tag”“补标题”“补摘要”“整理图片标签”“完善属性”“批量打标”“回填标签”“根据内容补元数据”等任务。
---

# Journal Tag Backfill

## 工作原则

这个 skill 可以从任意 Codex 工作目录调用；当前工作目录只作为调用环境。实际读写目标始终是配置中的 `journalDataDir`。把 journal 当作一个有约定的数据仓库来维护：补齐标签和结构化属性，保留日记正文，每次批量修改后写日志。

## 执行前检查

1. 读取用户级配置 `~/.config/journal-codex-plugin/config.json`。这个文件用于跨线程记住 journal data 仓库位置，只保存路径和仓库 URL。
2. 配置文件可以包含：

```json
{
  "journalDataGitUrl": "git@github.com:owner/journal-data.git",
  "journalDataDir": "/absolute/path/to/journal-data",
  "updatedAt": "YYYY-MM-DD"
}
```

3. `journalDataDir` 和 `journalDataGitUrl` 的来源是用户明确输入或已有配置。
4. 当前任务需要这些值但配置缺失时，停下来问用户；clone 仓库需要用户明确同意。
5. 确认 `journalDataDir` 存在后，把它作为唯一 journal data 根目录。所有读写、搜索、日志和校验都以它为根目录。
6. 运行 `git -C "$journalDataDir" status --short`。如果它不是 git 仓库，停下来让用户确认路径。
7. 运行 `command -v gh` 检查 GitHub CLI 是否安装。已安装时，再运行 `gh auth status` 检查登录状态。缺失或未登录时，在最终回复和日志里说明；只有当前任务必须访问 GitHub 远端时才停下来让用户处理。
8. 用户给出新的地址或路径后，更新 `~/.config/journal-codex-plugin/config.json`，后续优先使用该配置。

## 流程

1. 完成执行前检查。
2. 使用本 skill 的默认 metadata 形状作为数据约定。若 `journalDataDir` 里额外存在 `AGENTS.md`、`README.md`、`docs/` 或 schema 文档，再读取它们作为补充约定。
3. 确认本次范围。用户给了日期、目录或文件时按用户范围处理；用户没给范围时，先选一个小批次并在日志里写清楚范围。
4. 查找缺少标题、摘要、标签或属性的日记、murmur 和图片。用 `rg`、文件名、frontmatter、目录结构和相邻日记内容判断。
5. 按现有 schema、命名风格和下面的补 Metadata 方法补充结构化字段。保留已有字段，保持字段命名和内容顺序稳定。
6. 图片可以在有帮助时直接查看；也可以结合图片路径、日期、相邻日记、murmur 正文和已有元数据补标签。
7. 日记正文默认只读；用户明确要求时再改正文。
8. 修改后运行本插件脚本 `scripts/validate-journal-data.mjs --dir "$journalDataDir"` 检查本次改动。
9. 在 `journalDataDir/logs/ai/` 下写一份 Markdown 日志。如果目录不存在，创建它。
10. 最后向用户总结：处理范围、改了哪些文件、日志路径、检查结果、还需要用户注意什么。

## 写入规则

- 使用仓库已经存在的 frontmatter、JSON、YAML 或数据库格式。
- 复用已有标签风格；新增标签沿用现有语言、大小写、分隔符和粒度。
- 大范围历史回填分批处理，并让日志能追溯每批。
- 图片 tag 贴近可观察内容或日记上下文。
- 不在日记条目里写“AI 处理说明”；处理说明统一写进 `journalDataDir/logs/ai/`。

## 补 Metadata 方法

先分清写入目标：

- 日记 frontmatter `title`：当天内容的短标题。
- 日记 frontmatter `excerpt`：当天内容的可选摘要。
- `murmur.themes`：使用稳定 theme id，描述这条 murmur 的记录入口或回顾锚点。
- 图片 `tags`：描述图片可见内容、场景、时间感、颜色、氛围和上下文中的具体对象。
- 图片 `caption`：一句自然短描述，优先写清主体和场景。
- 日记 frontmatter `tags`：只在用户要求或当天有清晰总主题时补，描述整天的高层主题。

选择 tag 时按这个顺序：

1. 先读当天 frontmatter、正文、每条 murmur、图片 metadata 和相邻上下文。
2. 抽取候选信息：主体、动作、地点、食物、天气、季节、时间段、视觉特征、情绪或想法。
3. 复用仓库已有写法；遇到同义词时选历史里更常见的一个。
4. 保持可复用：tag 要能帮助以后搜索或回顾。`咖啡`、`窗边`、`雨` 比过长的描述更好。
5. 保持有证据：正文说到或图片看得到再写。拿不准的 tag 不写，把疑问放进日志 `Notes`。
6. 控制数量：每条 murmur 通常 1-2 个 `themes`；每张图片通常 2-6 个 `tags`；当天 `tags` 通常 0-4 个。

标题和摘要写法：

- `title` 使用自然短句，不加日期，不写成营销标题；优先概括当天最有代表性的事件、感受或画面。
- `excerpt` 用 1 句概括当天内容；多条 murmur 时抓共同线索或最重要的一条，不逐条罗列。
- 内容很少时可以只补 `title`，或都不补并在日志 `Notes` 写明。
- 只根据已有正文、murmur、图片 metadata 和可见图片内容生成，不补正文里没有依据的人名、地点或结论。

`murmur.themes` 从这些内置 theme id 中选择：

| theme id | 适用场景 |
| --- | --- |
| `sky-now` | 天空、云、天气状态、抬头看到的天色 |
| `quick-photo` | 随手拍、无明显其他主题的图片记录 |
| `small-thing` | 日常小事、短事件、轻量生活片段 |
| `food-today` | 饭、饮料、零食、餐厅、做饭 |
| `funny-today` | 好笑的事、荒诞瞬间、轻松吐槽 |
| `thought-maybe` | 想法、判断、灵感、还没定论的念头 |
| `shower-thought` | 发散的脑洞、突然冒出的抽象思考 |
| `breathe-moment` | 放松、休息、喘口气、让生活慢下来的片刻 |
| `light-shadow` | 光线、影子、反光、画面明暗关系明显的照片 |
| `curious-colors` | 颜色本身很突出或有趣的照片 |
| `sunrise-sunset` | 日出、日落、晚霞、晨昏天色 |
| `season-report` | 明确的季节变化、植物生长、温度、节气、天气带来的生活变化 |

`season-report` 不要泛化成普通自然照片桶。只有当正文、天气、植物状态或图片明显指向季节/植物/温度/节气/天气变化时才使用；小鸟、池塘、锦鲤、园林水面等单张自然照片优先用 `quick-photo`，除非它们明确承载季节观察。

图片 tag 写法：

- 使用短词或短语，不加 `#`，数组保持 `[雨, 窗户, 夜晚]` 形式。
- 先写主体，再写场景或特征，例如 `[咖啡, 桌面, 暖光]`。
- 可以用上下文补充 `通勤`、`晚餐`、`散步` 这类活动 tag。
- 不把 caption 拆成一串 tag；caption 负责描述，tags 负责检索。

## 默认 Metadata 形状

数据仓库可以只有 `entries/` 和 `media/`。使用这个默认形状补任务需要的字段，保留未知字段。

日记文件路径：

```text
entries/YYYY/MM/YYYY-MM-DD.md
```

日记 frontmatter：

```yaml
---
date: YYYY-MM-DD
createdAt: YYYY-MM-DDTHH:mm:ss+08:00
updatedAt: YYYY-MM-DDTHH:mm:ss+08:00
title: 可选标题
excerpt: 可选摘要
tags: [主题标签]
favorite: false
collections: [集合名]
weather:
  text: 天气文字
  temperature: 18
  feelsLike: 17
  humidity: 82
  windSpeed: 11
  updatedAt: YYYY-MM-DDTHH:mm:ss+08:00
location:
  name: 城市或地点名
  region: 省市或区域
  country: 国家
  query: 原始查询词
---
```

已知日记 frontmatter 字段为 `date`、`createdAt`、`updatedAt`、`title`、`excerpt`、`tags`、`favorite`、`collections`、`weather`、`location`。

默认补全目标是日记 frontmatter 的 `title` 和 `excerpt`、murmur 的 `themes`，以及图片 `::image` block 的 `caption` 和 `tags`。日记级 `tags` 按仓库已有格式或用户要求处理。

murmur metadata 位于 `:::murmur` block 头部：

```md
:::murmur
id: m_YYYYMMDD_HHMMSS
time: YYYY-MM-DDTHH:mm:ss+08:00
themes: [theme-id]
---
碎碎念正文
:::
```

murmur 字段：

- `id`：murmur 唯一标识。
- `time`：murmur 发生或创建时间。
- `themes`：稳定 theme id 数组，使用本 skill 列出的内置 theme id。
- block 正文：murmur 的文字内容。

只给已有 murmur 补 `themes`。图片仍然写在 murmur 正文里的 `::image` 子 block 中。

内置 theme id 的使用含义见“补 Metadata 方法”。

图片 metadata 位于 `::image` block 内：

```md
::image
id: img_YYYYMMDD_HHMMSS
src: media/YYYY/MM/file.jpg
caption: 图片说明
tags: [图片标签]
location: 地点名
latitude: 31.1885
longitude: 121.4365
locationSource: exif
::
```

图片字段优先补 `caption` 和 `tags`；有 EXIF 或上下文时可补位置信息。

## 结构自检

数据仓库默认没有校验脚本。使用本插件脚本检查结构：

```bash
node <plugin-root>/scripts/validate-journal-data.mjs --dir "$journalDataDir"
```

默认只检查本次改动的 `entries/` 和 `reviews/` 文件；全量检查加 `--all`。

脚本会检查：

- `git diff --check`
- 日记文件路径：`entries/YYYY/MM/YYYY-MM-DD.md`
- frontmatter 成对 `---`
- `:::murmur` block 成对 `:::`，并保留 `id`、`time`
- `murmur.themes` 只使用内置 theme id
- `::image` block 成对 `::`，并保留 `id`、`src`
- 数组字段使用 `[a, b]` 形式

插件自己的 `pnpm --filter @journal/codex-plugin run validate` 是插件结构校验，不是 journal data 校验。

## 日志格式

日志文件名使用当天日期和任务名，例如：

```text
journalDataDir/logs/ai/2026-06-14-tag-backfill.md
```

如果同一天重复运行，追加短后缀，例如 `2026-06-14-tag-backfill-2.md`。

日志内容保持简单：

```md
# AI Tag Backfill Log

Date: YYYY-MM-DD
Scope: 本次处理范围
Journal Data Dir: /absolute/path/to/journal-data

Paths below are relative to journalDataDir.

## Changed Files

- path/to/entry.md
  - Added tags: ...
  - Added title/excerpt: ...
  - Added properties: ...
  - Added murmur themes: ...

- path/to/image-or-metadata
  - Added image tags: ...

## Checks

- Command: ...
- Result: passed/failed/not found

## Notes

- ...
```

## 输出给用户

最终回复给出 `journalDataDir`、日志文件路径、检查结果、主要变更文件和简短风险提示即可。
