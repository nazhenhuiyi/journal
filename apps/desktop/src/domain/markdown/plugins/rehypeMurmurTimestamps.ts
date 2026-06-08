type HastNode = {
  type?: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

export function rehypeMurmurTimestamps() {
  return function transformer(tree: HastNode) {
    visit(tree, (node) => {
      if (node.properties?.dataJournalDirective !== 'murmur') {
        return
      }

      const label = stringProperty(node.properties.dataMurmurLabel)
      const time = stringProperty(node.properties.dataMurmurTime)

      if (!label || !time || hasMurmurTime(node)) {
        return
      }

      node.children = [
        {
          type: 'element',
          tagName: 'time',
          properties: {
            className: ['journal-murmur-time'],
            dateTime: time,
          },
          children: [{ type: 'text', value: label }],
        },
        ...(node.children ?? []),
      ]
    })
  }
}

function hasMurmurTime(node: HastNode) {
  return node.children?.some(
    (child) =>
      child.type === 'element' &&
      child.tagName === 'time' &&
      classList(child.properties?.className).includes('journal-murmur-time'),
  )
}

function stringProperty(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function classList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }

  return typeof value === 'string' ? [value] : []
}

function visit(node: HastNode, visitor: (node: HastNode) => void) {
  visitor(node)

  for (const child of node.children ?? []) {
    visit(child, visitor)
  }
}
