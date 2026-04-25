import { createTextSelector } from '../../domain/annotations'
import type { Annotation } from '../../domain/annotations'
import annotationTargetsEntry from '../../domain/markdown/__fixtures__/annotation-targets.md?raw'
import { parseJournalMarkdown } from '../../domain/markdown'

export { annotationTargetsEntry }

export const { longEntryMarkdown: demoLongEntryMarkdown } = parseJournalMarkdown(annotationTargetsEntry)

function buildDemoAnnotations(longEntryMarkdown: string): Annotation[] {
  const tiredText = '今天真的**很累**'
  const deskText = '桌面慢慢露出来'
  const pauseText = '不急着把今天解释清楚'
  const multiLineText = '台灯下面终于空出了一小块可以写字的地方。做这些的时候脑子还是有点钝，可是看到桌面慢慢露出来，心里也跟着松了一点'
  const repeatedText = '这句话会重复出现。'
  const linkText = '链接'
  const punctuationText = '中文标点：嗯，好'
  const tiredStart = longEntryMarkdown.indexOf(tiredText)
  const deskStart = longEntryMarkdown.indexOf(deskText)
  const pauseStart = longEntryMarkdown.indexOf(pauseText)
  const multiLineStart = longEntryMarkdown.indexOf(multiLineText)
  const repeatedStart = longEntryMarkdown.lastIndexOf(repeatedText)
  const linkStart = longEntryMarkdown.indexOf(linkText)
  const punctuationStart = longEntryMarkdown.indexOf(punctuationText)

  return [
    {
      id: 'ann_tired',
      author: 'ai',
      kind: 'observation',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, tiredStart, tiredStart + tiredText.length),
      },
      body: {
        content: '这里保留了疲惫，也保留了行动。可以不用急着把它解释成积极或消极。',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:40:00+08:00',
    },
    {
      id: 'ann_desk',
      author: 'ai',
      kind: 'observation',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, deskStart, deskStart + deskText.length),
      },
      body: {
        content: '这里的动作很小，但画面感很清楚：桌面露出来，也像是给自己腾出一点呼吸的位置。',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:41:00+08:00',
    },
    {
      id: 'ann_multiline',
      author: 'ai',
      kind: 'observation',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(
          longEntryMarkdown,
          multiLineStart,
          multiLineStart + multiLineText.length,
        ),
      },
      body: {
        content: '这条故意跨过视觉换行，用来检查高亮底色和选中轮廓是否能按每一行拆成连续区域。',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:41:15+08:00',
    },
    {
      id: 'ann_pause',
      author: 'ai',
      kind: 'question',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, pauseStart, pauseStart + pauseText.length),
      },
      body: {
        content: '“不急着解释清楚”很有力量。这里是在放过今天，还是在给明天留一个入口？',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:41:30+08:00',
    },
    {
      id: 'ann_repeat',
      author: 'ai',
      kind: 'question',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, repeatedStart, repeatedStart + repeatedText.length),
      },
      body: {
        content: '这句重复出现，像是在提醒某个还没说完的重点。要不要给它补一句原因？',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:42:00+08:00',
    },
    {
      id: 'ann_link',
      author: 'ai',
      kind: 'format',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, linkStart, linkStart + linkText.length),
      },
      body: {
        content: '链接文字可以被单独定位，高亮不会把 URL 或 Markdown 语法一起框进去。',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:43:00+08:00',
    },
    {
      id: 'ann_punctuation',
      author: 'ai',
      kind: 'spelling',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(
          longEntryMarkdown,
          punctuationStart,
          punctuationStart + punctuationText.length,
        ),
      },
      body: {
        content: '这段用来检查中文标点附近的范围边界，避免高亮多吞或少吞字符。',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:44:00+08:00',
    },
  ]
}

export const demoAnnotations = buildDemoAnnotations(demoLongEntryMarkdown)
