import { annotationIdsForBlock, resolveAnnotationRanges } from '../../annotations'
import type { Annotation, ResolvedAnnotationRange } from '../../annotations'

export type RehypeAnnotationAttributesOptions = {
  annotations?: Annotation[]
  markdown?: string
}

type HastNode = {
  type?: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  position?: {
    start?: {
      offset?: number
    }
    end?: {
      offset?: number
    }
  }
  children?: HastNode[]
}

export function rehypeAnnotationAttributes(options: RehypeAnnotationAttributesOptions = {}) {
  return function transformer(tree: HastNode) {
    const annotationRanges = resolveAnnotationRanges(options.markdown ?? '', options.annotations ?? [])

    visit(tree, (node) => {
      if (node.properties?.dataJournalDirective === 'murmur') {
        node.properties.className = mergeClassName(node.properties.className, 'journal-murmur')
      }

      if (node.properties?.dataJournalDirective === 'image') {
        node.properties.className = mergeClassName(node.properties.className, 'journal-image')
      }

      attachAnnotationIds(node, annotationRanges)
      attachSourceOffsetsToTextChildren(node)
    })
  }
}

function attachAnnotationIds(node: HastNode, annotationRanges: ResolvedAnnotationRange[]) {
  const start = node.position?.start?.offset
  const end = node.position?.end?.offset

  if (!isSupportedAnnotationBlock(node) || typeof start !== 'number' || typeof end !== 'number') {
    return
  }

  const annotationIds = annotationIdsForBlock(start, end, annotationRanges)

  if (annotationIds.length === 0) {
    return
  }

  node.properties = {
    ...node.properties,
    className: mergeClassName(node.properties?.className, 'journal-annotated-block'),
    dataAnnotationIds: annotationIds.join(' '),
  }
}

function isSupportedAnnotationBlock(node: HastNode): boolean {
  return ['blockquote', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'p', 'pre'].includes(
    node.tagName ?? '',
  )
}

function attachSourceOffsetsToTextChildren(node: HastNode) {
  if (!node.children || node.properties?.dataSourceStart) {
    return
  }

  node.children = node.children.map((child) => {
    if (child.type !== 'text' || !child.value) {
      return child
    }

    const start = child.position?.start?.offset
    const end = child.position?.end?.offset

    if (typeof start !== 'number' || typeof end !== 'number') {
      return child
    }

    return {
      type: 'element',
      tagName: 'span',
      properties: {
        dataSourceStart: String(start),
        dataSourceEnd: String(end),
      },
      position: child.position,
      children: [child],
    }
  })
}

function visit(node: HastNode, visitor: (node: HastNode) => void) {
  visitor(node)

  for (const child of node.children ?? []) {
    visit(child, visitor)
  }
}

function mergeClassName(current: unknown, nextClass: string): string[] {
  const classes = Array.isArray(current)
    ? current.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : typeof current === 'string' && current.length > 0
      ? [current]
      : []

  return classes.includes(nextClass) ? classes : [...classes, nextClass]
}
