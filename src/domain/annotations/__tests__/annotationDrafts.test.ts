import { describe, expect, it, vi } from 'vitest'
import {
  createAnnotationFromDraft,
  findDraftAnchorRange,
  resolveAnnotationDraft,
} from '../annotationDrafts'

describe('annotationDrafts', () => {
  it('resolves a draft anchor into a long-entry range selector', () => {
    const markdown = '# 今天\n我先出门，然后回来写字。'
    const resolved = resolveAnnotationDraft(
      {
        kind: 'observation',
        content: '这里把行动和回到自己身边放在一起。',
        anchorQuote: '然后回来写字',
      },
      markdown,
    )

    expect(resolved.matchStatus).toBe('anchored')
    expect(resolved.target.type).toBe('longEntryRange')

    if (resolved.target.type === 'longEntryRange') {
      expect(resolved.target.selector.sourceQuote.exact).toBe('然后回来写字')
    }
  })

  it('uses draft prefix and suffix to choose between repeated anchor quotes', () => {
    const markdown = '早上：这句话会重复出现。\n\n晚上：这句话会重复出现。后来我松了一点。'
    const range = findDraftAnchorRange(markdown, {
      anchorQuote: '这句话会重复出现。',
      anchorPrefix: '晚上：',
      anchorSuffix: '后来我松了一点。',
    })

    expect(range).not.toBeNull()
    expect(range ? markdown.slice(Math.max(0, range.start - 3), range.end) : '').toBe(
      '晚上：这句话会重复出现。',
    )
  })

  it('falls back to a day-level target when the anchor quote cannot be found', () => {
    const resolved = resolveAnnotationDraft(
      {
        kind: 'question',
        content: '这也许适合放成整天的追问。',
        anchorQuote: '不存在的句子',
      },
      '今天没有那句话。',
    )

    expect(resolved.matchStatus).toBe('day')
    expect(resolved.target).toEqual({ type: 'day' })
  })

  it('creates a visible AI annotation from a draft', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1777392000000)

    const annotation = createAnnotationFromDraft(
      {
        kind: 'observation',
        content: '一个温和的观察。',
        anchorQuote: '今天',
      },
      '今天有点慢。',
      '2026-04-29T12:00:00.000Z',
    )

    expect(annotation).toMatchObject({
      author: 'ai',
      kind: 'observation',
      status: 'visible',
      createdAt: '2026-04-29T12:00:00.000Z',
      body: { content: '一个温和的观察。' },
    })
    expect(annotation.id).toMatch(/^ann_ai_/)
  })
})
