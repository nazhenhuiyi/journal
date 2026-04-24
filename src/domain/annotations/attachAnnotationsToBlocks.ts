import type { Annotation, ResolvedAnnotationRange } from './types'
import { resolveTextSelector } from './resolveTextSelector'

export function resolveAnnotationRanges(
  markdown: string,
  annotations: Annotation[],
): ResolvedAnnotationRange[] {
  return annotations.flatMap((annotation) => {
    if (annotation.status !== 'visible' || annotation.target.type !== 'longEntryRange') {
      return []
    }

    const resolved = resolveTextSelector(markdown, annotation.target.selector)

    if (resolved.status !== 'resolved') {
      return []
    }

    return [
      {
        annotationId: annotation.id,
        start: resolved.range.start,
        end: resolved.range.end,
      },
    ]
  })
}

export function annotationIdsForBlock(
  blockStart: number,
  blockEnd: number,
  ranges: ResolvedAnnotationRange[],
): string[] {
  return ranges
    .filter((range) => intersects(blockStart, blockEnd, range.start, range.end))
    .map((range) => range.annotationId)
}

function intersects(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}
