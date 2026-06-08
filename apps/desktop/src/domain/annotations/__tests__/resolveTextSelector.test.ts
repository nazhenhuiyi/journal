import { describe, expect, it } from 'vitest'
import annotationTargetsEntry from '../../markdown/__fixtures__/annotation-targets.md?raw'
import { parseJournalMarkdown } from '../../markdown'
import { createTextSelector } from '../createTextSelector'
import { resolveTextSelector } from '../resolveTextSelector'

describe('resolveTextSelector', () => {
  it('resolves by line position when the source has not changed', () => {
    const { longEntryMarkdown } = parseJournalMarkdown(annotationTargetsEntry)
    const exact = '今天真的**很累**'
    const start = longEntryMarkdown.indexOf(exact)
    const selector = createTextSelector(longEntryMarkdown, start, start + exact.length)

    expect(resolveTextSelector(longEntryMarkdown, selector)).toEqual({
      status: 'resolved',
      range: { start, end: start + exact.length },
      method: 'linePosition',
    })
  })

  it('falls back to source quote after content is inserted before the target', () => {
    const source = '今天真的**很累**，但还是出门了。'
    const selector = createTextSelector(source, 0, '今天真的**很累**'.length)
    const changed = `前面新增一段。\n\n${source}`
    const resolved = resolveTextSelector(changed, selector)

    expect(resolved).toMatchObject({
      status: 'resolved',
      method: 'sourceQuote',
    })
    expect(resolved.status === 'resolved' ? changed.slice(resolved.range.start, resolved.range.end) : '').toBe(
      '今天真的**很累**',
    )
  })

  it('falls back to plain quote when markdown styling changes', () => {
    const source = '今天真的很累，但还是出门了。'
    const selector = createTextSelector(source, 0, '今天真的很累'.length)
    const changed = '今天真的**很累**，但还是出门了。'
    const resolved = resolveTextSelector(changed, selector)

    expect(resolved).toMatchObject({
      status: 'resolved',
      method: 'plainQuote',
    })
  })

  it('uses prefix and suffix to choose between repeated sentences', () => {
    const source = '第一段：这句话会重复出现。\n\n第二段：这句话会重复出现。'
    const secondStart = source.lastIndexOf('这句话会重复出现。')
    const selector = createTextSelector(source, secondStart, secondStart + '这句话会重复出现。'.length)
    const changed = `新增开头。\n\n${source}`
    const resolved = resolveTextSelector(changed, selector)

    expect(resolved.status).toBe('resolved')

    if (resolved.status === 'resolved') {
      expect(changed.slice(resolved.range.start - 4, resolved.range.end)).toBe('第二段：这句话会重复出现。')
    }
  })

  it('returns orphaned when the target no longer exists', () => {
    const source = '今天真的很累，但还是出门了。'
    const selector = createTextSelector(source, 0, '今天真的很累'.length)

    expect(resolveTextSelector('完全不同的内容。', selector)).toEqual({ status: 'orphaned' })
  })
})
