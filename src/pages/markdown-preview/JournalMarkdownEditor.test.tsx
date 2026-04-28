import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import JournalMarkdownEditor from './JournalMarkdownEditor'

describe('JournalMarkdownEditor', () => {
  it('gives common markdown blocks distinct editing affordances', () => {
    const { container } = render(
      <JournalMarkdownEditor
        onChange={vi.fn()}
        value={`# 今天

~~这段已经划掉。~~

> 留下一点声音。

- 一件小事

\`\`\`ts
const mood = 'quiet'
\`\`\`

---`}
      />,
    )

    expect(container.querySelector('.cm-md-heading-line')).toBeInTheDocument()
    expect(container.querySelector('.tok-strikethrough')).toBeInTheDocument()
    expect(container.querySelector('.cm-md-quote-line')).toBeInTheDocument()
    expect(container.querySelector('.cm-md-list-line')).toBeInTheDocument()
    expect(container.querySelectorAll('.cm-md-code-line')).toHaveLength(3)
    expect(container.querySelector('.cm-md-separator-line')).toBeInTheDocument()
  })
})
