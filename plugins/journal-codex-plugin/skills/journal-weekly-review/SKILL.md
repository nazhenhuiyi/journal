---
name: journal-weekly-review
description: 从任意 Codex 工作区访问已配置的 journal data git 仓库，根据上周日记、murmur、图片元数据和标签生成一篇带生活品味视角的周回顾/日记回看，并记录生成日志。默认可参考蒋勋式的人文美学和日常观看方式来写。用于用户要求“总结上周日记”“生成周回顾”“weekly review”“每周复盘”“看看上周日记”“生活品味回看”“审美回看”“根据日记写总结”或配置定时周总结任务。
---

# Journal Weekly Review

## 工作原则

这个 skill 可以从任意 Codex 工作目录调用；当前工作目录只作为调用环境，实际读写目标始终是配置中的 `journalDataDir`。原始日记只读，输出一篇周回顾和一份生成日志。

周回顾不是绩效复盘，也不是流水账压缩。它要从日记里选出一个能承载这一周的画面、物件、身体感或句子，写成一篇有生活品味的日记回看。写作上可以直接以蒋勋式的人文美学观看作为参照：慢下来，从日常小物进入人的处境和生活的美。

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
2. 使用本 skill 的默认读取结构。若 `journalDataDir` 里有明确的 schema、模板或已有周回顾样例，只把它们作为路径、字段和文件头等硬约定，不让模板压住本次文风。
3. 计算时间范围。用户明确给范围时按用户范围；用户说“上周”时，默认使用本地日期的上一周，优先按仓库既有周起止规则，否则按周一到周日。
4. 浏览该范围内的日记、murmur、图片 metadata 和必要图片，做一个轻量取材池：哪些画面、句子、身体反馈或生活细节有温度。取材池只是为了选择中心，不要变成正文大纲。
5. 找到 `journalDataDir` 中现有的周回顾目录和命名方式；如果没有，使用 `reviews/weekly/YYYY-Www.md`。
6. 按下面的写作方向写出周回顾文档，末尾保留一个问题。
7. 原始日记条目按只读材料处理；用户明确要求时再修改。
8. 修改后运行 `git -C "$journalDataDir" diff --check` 做轻量检查。
9. 在 `journalDataDir/logs/ai/` 下写一份 Markdown 日志。如果目录不存在，创建它。
10. 最后向用户总结：周回顾路径、覆盖日期、日志路径、检查结果。

## 写作方向

默认写成一篇有余韵的日记回看，而不是结构化报告。

把蒋勋代表的慢、人文、感官、慈悲作为观看方式，按照第三人称的角度去回看上周的日记，并且使用温柔的笔触来进行书写文章，允许铺陈、回环、停顿和句子节奏，让文章有一点散文感。

写作时只做三件事：

- 从日记里选一个最有感觉的画面、物件、身体感或句子作为中心。
- 围绕这个中心写；其他材料只在能照亮中心时出现，不追求覆盖完整。
- 写完删掉周报感、盘点感和结论先行的句子，末尾添加 `## 问题`，只写一个问题。

## 默认读取结构

数据仓库可以只有 `entries/` 和 `media/`。按这个结构读取：

- 日记文件：`entries/YYYY/MM/YYYY-MM-DD.md`
- 日记 frontmatter：读取 `date`、`title`、`excerpt`、`tags`、`favorite`、`collections`、`weather`、`location`，未知字段作为上下文参考。
- 正文：frontmatter 后的普通 Markdown 是当天长日记。
- 碎碎念：读取 `:::murmur` block 中的 `id`、`time`、`themes` 和正文；`themes` 是稳定 theme id 数组。
- 图片：读取 `::image` block 中的 `src`、`caption`、`tags` 和可选位置信息。
- 周回顾输出：优先沿用已有目录；没有时写到 `reviews/weekly/YYYY-Www.md`。

只使用日记中明确写出的事件、人物、地点、项目、主题和可见图片内容。结构化字段以实际 schema 和文件内容为准。

## 轻量检查

周回顾默认只写 `reviews/` 和 `logs/`，不需要校验日记、murmur 或图片结构。完成后运行：

```bash
git -C "$journalDataDir" diff --check
```

插件自己的 `pnpm --filter @journal/codex-plugin run validate` 只用于开发插件本身，执行周回顾时不用运行。

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
