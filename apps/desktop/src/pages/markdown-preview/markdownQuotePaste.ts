import type { EditorView } from 'codemirror'

function getActiveQuotePrefix(view: EditorView) {
  const selection = view.state.selection.main

  if (!selection.empty) {
    return null
  }

  const line = view.state.doc.lineAt(selection.head)
  const quoteMatch = /^(\s*(?:>\s*)+)/.exec(line.text)

  if (!quoteMatch || selection.head - line.from < quoteMatch[1].length) {
    return null
  }

  return quoteMatch[1]
}

export function quoteMultilinePasteInActiveQuote(view: EditorView, text: string) {
  if (!/[\r\n]/.test(text)) {
    return false
  }

  const quotePrefix = getActiveQuotePrefix(view)

  if (!quotePrefix) {
    return false
  }

  const normalizedText = text.replace(/\r\n?/g, '\n')
  const quotedText = normalizedText.replace(/\n(?!$)/g, `\n${quotePrefix}`)

  view.dispatch(view.state.replaceSelection(quotedText))
  return true
}
