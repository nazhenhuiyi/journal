import type { AnnotationOverlayRect } from './types'

const textHighlightKey = 'journal-annotation-text'
const activeHighlightKey = 'journal-annotation-active'

export function getAnnotationIds(element: HTMLElement): string[] {
  return (element.dataset.annotationIds ?? '').split(/\s+/).filter(Boolean)
}

export function sourceOffsetAtPoint(root: ParentNode, clientX: number, clientY: number): number | null {
  const textPoint = textPointAt(clientX, clientY)
  const sourceElement = textPoint?.node.parentElement?.closest<HTMLElement>(
    '[data-source-start][data-source-end]',
  )

  if (!textPoint || !sourceElement || !root.contains(sourceElement)) {
    return null
  }

  const sourceStart = Number(sourceElement.dataset.sourceStart)

  return Number.isFinite(sourceStart) ? sourceStart + textPoint.offset : null
}

export function registerAnnotationHighlights(
  rangesByAnnotation: Map<string, Range[]>,
  activeAnnotationId: string,
): () => void {
  const registry = getHighlightRegistry()

  if (!registry || typeof Highlight === 'undefined') {
    return () => undefined
  }

  const ranges = Array.from(rangesByAnnotation.values()).flat()
  const activeRanges = rangesByAnnotation.get(activeAnnotationId) ?? []

  registry.delete(textHighlightKey)
  registry.delete(activeHighlightKey)

  if (ranges.length > 0) {
    registry.set(textHighlightKey, new Highlight(...ranges))
  }

  if (activeRanges.length > 0) {
    registry.set(activeHighlightKey, new Highlight(...activeRanges))
  }

  return () => {
    registry.delete(textHighlightKey)
    registry.delete(activeHighlightKey)
  }
}

export function watchActiveOverlayRects(
  preview: HTMLElement,
  ranges: Range[],
  setRects: (rects: AnnotationOverlayRect[]) => void,
): () => void {
  let cancelled = false
  const update = () => {
    if (!cancelled) {
      setRects(createOverlayRects(preview, ranges))
    }
  }

  update()

  const animationFrame = window.requestAnimationFrame(update)
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)

  resizeObserver?.observe(preview)
  window.addEventListener('resize', update)
  void document.fonts?.ready.then(update)

  return () => {
    cancelled = true
    window.cancelAnimationFrame(animationFrame)
    window.removeEventListener('resize', update)
    resizeObserver?.disconnect()
  }
}

function textPointAt(clientX: number, clientY: number): { node: Text; offset: number } | null {
  if ('caretPositionFromPoint' in document) {
    const position = document.caretPositionFromPoint(clientX, clientY)

    if (position?.offsetNode.nodeType === Node.TEXT_NODE) {
      return {
        node: position.offsetNode as Text,
        offset: position.offset,
      }
    }
  }

  if ('caretRangeFromPoint' in document) {
    const range = document.caretRangeFromPoint(clientX, clientY)

    if (range?.startContainer.nodeType === Node.TEXT_NODE) {
      return {
        node: range.startContainer as Text,
        offset: range.startOffset,
      }
    }
  }

  return null
}

function createOverlayRects(preview: HTMLElement, ranges: Range[]): AnnotationOverlayRect[] {
  const previewRect = preview.getBoundingClientRect()

  return ranges.flatMap((range, rangeIndex) => {
    if (typeof range.getClientRects !== 'function') {
      return []
    }

    return Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect, rectIndex) => ({
        key: `${rangeIndex}-${rectIndex}`,
        left: rect.left - previewRect.left,
        top: rect.top - previewRect.top,
        width: rect.width,
        height: rect.height,
      }))
  })
}

function getHighlightRegistry(): HighlightRegistry | null {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) {
    return null
  }

  return CSS.highlights
}
