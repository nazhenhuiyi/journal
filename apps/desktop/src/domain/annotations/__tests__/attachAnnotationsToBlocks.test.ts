import { describe, expect, it } from 'vitest'
import annotationTargetsEntry from '../../markdown/__fixtures__/annotation-targets.md?raw'
import { parseJournalMarkdown } from '../../markdown'
import { createTextSelector } from '../createTextSelector'
import { annotationIdsForBlock, resolveAnnotationRanges } from '../attachAnnotationsToBlocks'
import type { Annotation, TextSelector } from '../types'

describe('attachAnnotationsToBlocks helpers', () => {
  it('resolves visible long-entry annotations into source ranges', () => {
    const { longEntryMarkdown } = parseJournalMarkdown(annotationTargetsEntry)
    const exact = '今天真的**很累**'
    const start = longEntryMarkdown.indexOf(exact)
    const annotation = createAnnotation(
      'ann_1',
      createTextSelector(longEntryMarkdown, start, start + exact.length),
    )

    expect(resolveAnnotationRanges(longEntryMarkdown, [annotation])).toEqual([
      {
        annotationId: 'ann_1',
        start,
        end: start + exact.length,
      },
    ])
  })

  it('ignores hidden, orphaned, and day-level annotations', () => {
    const { longEntryMarkdown } = parseJournalMarkdown(annotationTargetsEntry)
    const selector = createTextSelector(longEntryMarkdown, 0, 4)
    const hidden = { ...createAnnotation('hidden', selector), status: 'hidden' as const }
    const orphaned = { ...createAnnotation('orphaned', selector), status: 'orphaned' as const }
    const day: Annotation = {
      ...createAnnotation('day', selector),
      target: { type: 'day' },
    }

    expect(resolveAnnotationRanges(longEntryMarkdown, [hidden, orphaned, day])).toEqual([])
  })

  it('finds annotation ids for intersecting block ranges', () => {
    const ids = annotationIdsForBlock(10, 20, [
      { annotationId: 'before', start: 0, end: 10 },
      { annotationId: 'inside', start: 12, end: 16 },
      { annotationId: 'after', start: 20, end: 30 },
      { annotationId: 'overlap', start: 5, end: 12 },
    ])

    expect(ids).toEqual(['inside', 'overlap'])
  })
})

function createAnnotation(id: string, selector: TextSelector): Annotation {
  return {
    id,
    author: 'ai',
    kind: 'observation',
    target: {
      type: 'longEntryRange',
      selector,
    },
    body: {
      content: '测试批注',
    },
    status: 'visible',
    createdAt: '2026-04-24T00:00:00+08:00',
  }
}
