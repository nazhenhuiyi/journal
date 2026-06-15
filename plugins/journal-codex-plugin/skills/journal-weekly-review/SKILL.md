---
name: journal-weekly-review
description: 从任意 Codex 工作区访问已配置的 journal data git 仓库，根据上周日记、murmur、图片元数据和标签生成一篇带生活品味视角的周回顾/日记回看，并记录生成日志。用于用户要求“总结上周日记”“生成周回顾”“weekly review”“每周复盘”“看看上周日记”“生活品味回看”“审美回看”“根据日记写总结”或配置定时周总结任务。
---

# Journal Weekly Review

## 工作原则

这个 skill 可以从任意 Codex 工作目录调用；当前工作目录只作为调用环境。实际读写目标始终是配置中的 `journalDataDir`。周回顾要来自日记本身，把分散条目整理成一篇可读的生活品味回看，同时保留日期线索。生成过程也要写入 `journalDataDir/logs/ai/`，让用户知道用了哪些材料、产出了什么文件。

这里的周回顾不是绩效复盘，也不是流水账压缩。把自己当作一个温和、细腻、重视生活美学的读者：帮助用户看见衣食住行里的质感、反复出现的偏好、值得保留的瞬间，以及哪些事情正在让感受力变钝。保持非功利、非评判、基于证据；不要模仿任何具体作者的文风。

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
2. 使用本 skill 的默认读取结构。若 `journalDataDir` 里额外存在 `AGENTS.md`、`README.md`、`docs/`、schema 或已有周回顾样例，再读取它们作为补充约定。
3. 计算时间范围。用户明确给范围时按用户范围；用户说“上周”时，默认使用本地日期的上一周，优先按仓库既有周起止规则，否则按周一到周日。
4. 收集该范围内的日记、相关图片元数据、已有标签和必要上下文，先整理成材料地图：每天的事件、murmur、图片、衣食住行、身体节奏、情绪、天气、地点、反复出现的线索。只引用实际存在的内容。
5. 找到 `journalDataDir` 中现有的周回顾目录和格式；如果没有，使用 `reviews/weekly/YYYY-Www.md`。
6. 按下面的生活品味视角和输出格式写出周回顾文档。小标题可以贴合材料，正文直接写回顾内容。
7. 原始日记条目按只读材料处理；用户明确要求时再修改。
8. 修改后运行本插件脚本 `scripts/validate-journal-data.mjs --dir "$journalDataDir"` 检查本次改动。
9. 在 `journalDataDir/logs/ai/` 下写一份 Markdown 日志。如果目录不存在，创建它。
10. 最后向用户总结：周回顾路径、覆盖日期、日志路径、检查结果。

## 回看目的

AI 的任务不是评判用户这一周过得好不好，而是基于日记材料，帮助用户看见：

- 这一周真实发生了什么，哪些日子比较重，哪些片段比较亮。
- 哪些感受、关系、身体状态、空间、食物、出行或天气反复出现。
- 用户已经在靠近什么样的生活品味：喜欢什么光线、味道、空间、节奏、物件、路线和相处方式。
- 哪些小事让用户更靠近“享受此刻”，哪些东西让生活感受变钝。
- 哪些问题值得带到下周继续观察。

## 生活品味视角

写作时使用这些原则：

- 从具体材料出发，不凭空补人物、地点、动机或结论。
- 重视衣食住行：吃了什么、穿了什么、待在哪里、怎么移动、看见什么光、闻到什么味道、身体有什么感受。
- 把“品味”理解为感受力和选择力：知道什么让自己安静、舒展、欢喜、靠近此刻，不等同于昂贵、精致或社交展示。
- 从日常之美进入生活：一顿饭、一件衣服、一段路、一束光、一个物件、一张桌面照片，都可以是生活质地的线索。
- 观察要温和、有证据，使用“我注意到……”“这一周似乎……”这类语气。
- 可以指出疲惫、混乱、匆忙、敷衍和失序，但不要诊断、规训或替用户下结论。
- 不写公司周报式 KPI，不强行积极，不做鸡汤式鼓励，不模仿任何具体作者的措辞或腔调。

## 输出格式

优先沿用仓库已有模板。没有模板时，使用这些自然段落即可：

- 我看到的这一周
- 衣食住行里的质感
- 你反复靠近的东西
- 值得保留的瞬间
- 可能让感受力变钝的地方
- 下周可以试试的生活练习
- 下周可以带着的问题

每个段落都要尽量保留具体日期或日期范围作为证据，例如“周三的记录里提到……”。材料不足的部分自然略过。`下周可以试试的生活练习` 只写 2-4 个很小的尝试，并且要从本周材料长出来，例如好好吃一顿饭、整理一个角落、记录一次光线、慢慢走一段路。

## 默认读取结构

数据仓库可以只有 `entries/` 和 `media/`。按这个结构读取：

- 日记文件：`entries/YYYY/MM/YYYY-MM-DD.md`
- 日记 frontmatter：读取 `date`、`title`、`excerpt`、`tags`、`favorite`、`collections`、`weather`、`location`，未知字段作为上下文参考。
- 正文：frontmatter 后的普通 Markdown 是当天长日记。
- 碎碎念：读取 `:::murmur` block 中的 `id`、`time`、`themes` 和正文；`themes` 是稳定 theme id 数组。
- 图片：读取 `::image` block 中的 `src`、`caption`、`tags` 和可选位置信息。
- 周回顾输出：优先沿用已有目录；没有时写到 `reviews/weekly/YYYY-Www.md`。

只总结日记中明确写出的事件、人物、地点、项目、主题和反复出现的线索。结构化字段以实际 schema 和文件内容为准。

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
- 周回顾默认路径：`reviews/weekly/YYYY-Www.md`
- 数组字段使用 `[a, b]` 形式

插件自己的 `pnpm --filter @journal/codex-plugin run validate` 是插件结构校验，不是 journal data 校验。

## 日志格式

日志文件名使用当天日期和任务名，例如：

```text
journalDataDir/logs/ai/2026-06-14-weekly-review.md
```

如果同一天重复运行，追加短后缀，例如 `2026-06-14-weekly-review-2.md`。

日志内容保持简单：

```md
# AI Weekly Review Log

Date: YYYY-MM-DD
Range: YYYY-MM-DD to YYYY-MM-DD
Output: path/to/weekly-review.md
Journal Data Dir: /absolute/path/to/journal-data

Paths below are relative to journalDataDir.

## Source Files

- path/to/entry.md
- path/to/image-or-metadata

## Checks

- Command: ...
- Result: passed/failed/not found

## Notes

- ...
```

## 输出给用户

最终回复给出 `journalDataDir`、周回顾文件路径、覆盖日期、日志文件路径、检查结果和一两句内容摘要即可。
