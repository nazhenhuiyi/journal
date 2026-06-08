import { indentWithTab } from '@codemirror/commands'
import { EditorView, type Command } from '@codemirror/view'

const listIndent = '    '
const markdownListPattern = /^\s*(?:[-*+]|\d+[.)])\s+/
const orderedListPattern = /^(\s*)(\d+)([.)])(\s+)/

export const indentMarkdownListWithTab: Command = (view) => {
  const selectedLines = selectedDocumentLines(view)

  if (!selectedLines.some((line) => markdownListPattern.test(line.text))) {
    return indentWithTab.run?.(view) ?? false
  }

  const changes = selectedLines.flatMap((line) => {
    const orderedListMatch = orderedListPattern.exec(line.text)
    const lineChanges: Array<{ from: number; to?: number; insert: string }> = [
      { from: line.from, insert: listIndent },
    ]

    if (orderedListMatch && orderedListMatch[2] !== '1') {
      const markerStart = line.from + orderedListMatch[1].length

      lineChanges.push({
        from: markerStart,
        to: markerStart + orderedListMatch[2].length,
        insert: '1',
      })
    }

    return lineChanges
  })

  view.dispatch({ changes })

  return true
}

function selectedDocumentLines(view: EditorView) {
  const lines = new Map<number, { from: number; number: number; text: string }>()

  for (const range of view.state.selection.ranges) {
    const startLine = view.state.doc.lineAt(range.from)
    const endPosition = range.empty ? range.to : Math.max(range.from, range.to - 1)
    const endLine = view.state.doc.lineAt(endPosition)

    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
      lines.set(lineNumber, view.state.doc.line(lineNumber))
    }
  }

  return [...lines.values()]
}
