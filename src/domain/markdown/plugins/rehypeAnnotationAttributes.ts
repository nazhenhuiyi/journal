import type { RenderAnnotation } from '../types'

export type RehypeAnnotationAttributesOptions = {
  annotations?: RenderAnnotation[]
}

type HastNode = {
  type?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

export function rehypeAnnotationAttributes(options: RehypeAnnotationAttributesOptions = {}) {
  return function transformer(tree: HastNode) {
    visit(tree, (node) => {
      if (node.properties?.dataJournalDirective === 'murmur') {
        node.properties.className = mergeClassName(node.properties.className, 'journal-murmur')
      }

      if (node.properties?.dataJournalDirective === 'image') {
        node.properties.className = mergeClassName(node.properties.className, 'journal-image')
      }
    })

    void options
  }
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
