import type { ResolvedAnnotationRange, TextPosition } from './types'

const sourceNodeSelector = '[data-source-start][data-source-end]'

export function createDomRangesForSourceRange(root: ParentNode, sourceRange: TextPosition): Range[] {
  const ownerDocument = getOwnerDocument(root)

  return getSourceOffsetElements(root).flatMap((element) => {
    const nodeRange = getElementSourceRange(element)

    if (!nodeRange || !intersects(nodeRange.start, nodeRange.end, sourceRange.start, sourceRange.end)) {
      return []
    }

    const textNode = getSingleTextNode(element)

    if (!textNode) {
      return []
    }

    const start = Math.max(0, sourceRange.start - nodeRange.start)
    const end = Math.min(textNode.data.length, sourceRange.end - nodeRange.start)

    if (start >= end) {
      return []
    }

    const range = ownerDocument.createRange()
    range.setStart(textNode, start)
    range.setEnd(textNode, end)

    return [range]
  })
}

export function createDomRangesByAnnotation(
  root: ParentNode,
  annotationRanges: ResolvedAnnotationRange[],
): Map<string, Range[]> {
  return new Map(
    annotationRanges.map((annotationRange) => [
      annotationRange.annotationId,
      createDomRangesForSourceRange(root, annotationRange),
    ]),
  )
}

function getSourceOffsetElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(sourceNodeSelector))
}

function getElementSourceRange(element: HTMLElement): TextPosition | null {
  const start = Number(element.dataset.sourceStart)
  const end = Number(element.dataset.sourceEnd)

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null
  }

  return { start, end }
}

function getSingleTextNode(element: HTMLElement): Text | null {
  return element.childNodes.length === 1 && element.firstChild?.nodeType === Node.TEXT_NODE
    ? (element.firstChild as Text)
    : null
}

function getOwnerDocument(root: ParentNode): Document {
  return root instanceof Document ? root : ((root as Node).ownerDocument ?? document)
}

function intersects(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}
