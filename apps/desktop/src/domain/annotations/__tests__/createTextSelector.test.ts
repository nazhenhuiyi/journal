import { describe, expect, it } from 'vitest'
import annotationTargetsEntry from '../../markdown/__fixtures__/annotation-targets.md?raw'
import { parseJournalMarkdown } from '../../markdown'
import { createTextSelector } from '../createTextSelector'

describe('createTextSelector', () => {
  it('creates source, plain, offset, and line selectors for a markdown range', () => {
    const { longEntryMarkdown } = parseJournalMarkdown(annotationTargetsEntry)
    const exact = '今天真的**很累**'
    const start = longEntryMarkdown.indexOf(exact)
    const selector = createTextSelector(longEntryMarkdown, start, start + exact.length)

    expect(selector.sourceQuote.exact).toBe(exact)
    expect(selector.plainQuote.exact).toBe('今天真的很累')
    expect(selector.textPosition).toEqual({ start, end: start + exact.length })
    expect(selector.linePosition).toMatchObject({
      startLine: 3,
      startColumn: 1,
      endLine: 3,
    })
    expect(selector.sourceQuote.prefix).toContain('# 批注目标')
    expect(selector.sourceQuote.suffix).toContain('，但还是把桌面收拾好了。')
  })

  it('rejects invalid source ranges', () => {
    expect(() => createTextSelector('今天', -1, 1)).toThrow(RangeError)
    expect(() => createTextSelector('今天', 2, 1)).toThrow(RangeError)
    expect(() => createTextSelector('今天', 0, 99)).toThrow(RangeError)
  })
})
