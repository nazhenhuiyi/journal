import { useEffect, useRef } from 'react'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { EditorView, minimalSetup } from 'codemirror'

type JournalMarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
}

const journalHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, class: 'tok-heading' },
  { tag: tags.emphasis, class: 'tok-emphasis' },
  { tag: tags.strong, class: 'tok-strong' },
  { tag: tags.link, class: 'tok-link' },
  { tag: tags.url, class: 'tok-url' },
  { tag: tags.meta, class: 'tok-meta' },
])

const journalEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--color-ink)',
    backgroundColor: 'transparent',
    fontFamily: 'var(--font-display)',
    fontSize: '1.1rem',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit',
    lineHeight: '2',
  },
  '.cm-content': {
    minHeight: '34rem',
    padding: '3.1rem 2.8rem 2.4rem 4.2rem',
    caretColor: 'var(--color-walnut)',
  },
  '.cm-line': {
    padding: '0 0.1rem',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(215, 166, 75, 0.08)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(215, 166, 75, 0.28)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--color-walnut)',
  },
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    backgroundColor: 'rgba(111, 126, 99, 0.16)',
    outline: '1px solid rgba(111, 126, 99, 0.28)',
  },
  '.tok-heading': {
    color: 'var(--color-walnut)',
    fontWeight: '650',
  },
  '.tok-emphasis': {
    color: '#4d6545',
    fontStyle: 'italic',
  },
  '.tok-strong': {
    color: '#263f35',
    fontWeight: '700',
  },
  '.tok-link': {
    color: '#416f83',
    textDecoration: 'underline',
    textUnderlineOffset: '0.16em',
  },
  '.tok-url': {
    color: 'rgba(65, 111, 131, 0.72)',
  },
  '.tok-meta': {
    color: 'rgba(122, 79, 50, 0.6)',
  },
})

function JournalMarkdownEditor({ value, onChange }: JournalMarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const initialValueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!hostRef.current) {
      return
    }

    const view = new EditorView({
      doc: initialValueRef.current,
      parent: hostRef.current,
      extensions: [
        minimalSetup,
        markdown(),
        syntaxHighlighting(journalHighlightStyle),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': '日记正文' }),
        journalEditorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current

    if (!view) {
      return
    }

    const currentValue = view.state.doc.toString()

    if (value === currentValue) {
      return
    }

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    })
  }, [value])

  return <div className="journal-editor" ref={hostRef} />
}

export default JournalMarkdownEditor
