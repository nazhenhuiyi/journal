import { render } from '@testing-library/react'
import { EditorView } from 'codemirror'
import { describe, expect, it, vi } from 'vitest'
import JournalMarkdownEditor from './JournalMarkdownEditor'
import { indentMarkdownListWithTab } from './markdownListIndent'
import { quoteMultilinePasteInActiveQuote } from './markdownQuotePaste'

describe('JournalMarkdownEditor', () => {
  it('gives common markdown blocks distinct editing affordances', () => {
    const { container } = render(
      <JournalMarkdownEditor
        onChange={vi.fn()}
        value={`# 今天

~~这段已经划掉。~~

> 留下一点声音。

- 一件小事
1. 第一层
    1. 第二层
        1. 第三层

\`\`\`ts
const mood = 'quiet'
\`\`\`

---`}
      />,
    )

    expect(container.querySelector('.cm-md-heading-line')).toBeInTheDocument()
    expect(container.querySelector('.cm-md-quote-line')).toBeInTheDocument()
    expect(container.querySelectorAll('.cm-md-list-line')).toHaveLength(4)
    expect(container.querySelectorAll('.cm-md-code-line')).toHaveLength(3)
    expect(container.querySelector('.cm-md-separator-line')).toBeInTheDocument()
  })

  it('restarts ordered list markers when indenting an item into a child list', () => {
    const view = new EditorView({
      doc: `1. 第一件事
2. 第二件事
3. 补充说明`,
      selection: { anchor: '1. 第一件事\n2. 第二件事\n'.length },
    })

    expect(indentMarkdownListWithTab(view)).toBe(true)
    expect(view.state.doc.toString()).toBe(`1. 第一件事
2. 第二件事
    1. 补充说明`)

    view.destroy()
  })

  it('keeps every pasted paragraph inside the active quote block', () => {
    const view = new EditorView({
      doc: '> ',
      selection: { anchor: 2 },
    })

    expect(quoteMultilinePasteInActiveQuote(view, '第一段\n\n第二段')).toBe(true)
    expect(view.state.doc.toString()).toBe('> 第一段\n> \n> 第二段')

    view.destroy()
  })

  it('does not add a dangling quote marker for pasted text that ends with a newline', () => {
    const view = new EditorView({
      doc: '> ',
      selection: { anchor: 2 },
    })

    expect(quoteMultilinePasteInActiveQuote(view, '第一段\n\n第二段\n')).toBe(true)
    expect(view.state.doc.toString()).toBe('> 第一段\n> \n> 第二段\n')
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).toBe('')

    view.destroy()
  })

  it('leaves multiline paste alone outside quote blocks', () => {
    const view = new EditorView({
      doc: '',
    })

    expect(quoteMultilinePasteInActiveQuote(view, '第一段\n\n第二段')).toBe(false)
    expect(view.state.doc.toString()).toBe('')

    view.destroy()
  })

  it('leaves multiline paste alone before the quote marker', () => {
    const view = new EditorView({
      doc: '> 引用',
      selection: { anchor: 0 },
    })

    expect(quoteMultilinePasteInActiveQuote(view, '第一段\n第二段')).toBe(false)
    expect(view.state.doc.toString()).toBe('> 引用')

    view.destroy()
  })
})
