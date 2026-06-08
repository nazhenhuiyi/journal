type MarkdownNode = {
  type: string
  name?: string
  attributes?: Record<string, string | null | undefined>
  data?: {
    hName?: string
    hProperties?: Record<string, unknown>
  }
  children?: MarkdownNode[]
}

const directiveTypes = new Set(['containerDirective', 'leafDirective', 'textDirective'])

export function remarkJournalDirectives() {
  return function transformer(tree: MarkdownNode) {
    visit(tree, (node) => {
      if (!directiveTypes.has(node.type) || !node.name) {
        return
      }

      if (node.name === 'murmur') {
        setDirectiveElement(node, 'section', 'journal-murmur')
      }

      if (node.name === 'image') {
        setDirectiveElement(node, 'figure', 'journal-image')
      }
    })
  }
}

function setDirectiveElement(node: MarkdownNode, hName: string, className: string) {
  node.data = {
    ...node.data,
    hName,
    hProperties: {
      ...node.data?.hProperties,
      ...getDirectiveProperties(node),
      className: [className],
      dataJournalDirective: node.name,
    },
  }
}

function getDirectiveProperties(node: MarkdownNode) {
  if (node.name !== 'murmur') {
    return {}
  }

  return {
    dataMurmurLabel: node.attributes?.murmurLabel,
    dataMurmurTime: node.attributes?.murmurTime,
  }
}

function visit(node: MarkdownNode, visitor: (node: MarkdownNode) => void) {
  visitor(node)

  for (const child of node.children ?? []) {
    visit(child, visitor)
  }
}
