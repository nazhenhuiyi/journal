import { useEffect, useRef } from 'react'
import { indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { GFM } from '@lezer/markdown'
import { EditorView, minimalSetup } from 'codemirror'
import {
  Decoration,
  keymap,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { indentMarkdownListWithTab } from './markdownListIndent'
import { quoteMultilinePasteInActiveQuote } from './markdownQuotePaste'

type JournalMarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  onCompositionChange?: (isComposing: boolean, value: string) => void
}

const journalHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, class: 'tok-heading tok-heading-1' },
  { tag: tags.heading2, class: 'tok-heading tok-heading-2' },
  { tag: tags.heading3, class: 'tok-heading tok-heading-3' },
  { tag: tags.heading, class: 'tok-heading' },
  { tag: tags.emphasis, class: 'tok-emphasis' },
  { tag: tags.strong, class: 'tok-strong' },
  { tag: tags.strikethrough, class: 'tok-strikethrough' },
  { tag: tags.quote, class: 'tok-quote' },
  { tag: tags.list, class: 'tok-list' },
  { tag: tags.monospace, class: 'tok-monospace' },
  { tag: tags.link, class: 'tok-link' },
  { tag: tags.url, class: 'tok-url' },
  { tag: tags.contentSeparator, class: 'tok-content-separator' },
  { tag: tags.meta, class: 'tok-meta' },
])

function getMarkdownLineClasses(text: string, isInsideCodeFence: boolean) {
  const trimmedText = text.trim()
  const headingMatch = /^(#{1,6})\s+/.exec(trimmedText)

  if (/^(`{3,}|~{3,})/.test(trimmedText)) {
    return ['cm-md-code-line', 'cm-md-code-boundary']
  }

  if (isInsideCodeFence) {
    return ['cm-md-code-line']
  }

  if (headingMatch) {
    return ['cm-md-heading-line', `cm-md-heading-${Math.min(headingMatch[1].length, 6)}`]
  }

  if (/^>\s?/.test(trimmedText)) {
    return ['cm-md-quote-line']
  }

  if (/^([-*+]\s+|\d+[.)]\s+)/.test(trimmedText)) {
    return ['cm-md-list-line']
  }

  if (/^(([-*_])\s*){3,}$/.test(trimmedText)) {
    return ['cm-md-separator-line']
  }

  return []
}

function buildMarkdownLineDecorations(view: EditorView) {
  const decorations = []
  let isInsideCodeFence = false

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber)
    const classes = getMarkdownLineClasses(line.text, isInsideCodeFence)

    if (/^(`{3,}|~{3,})/.test(line.text.trim())) {
      isInsideCodeFence = !isInsideCodeFence
    }

    if (classes.length > 0) {
      decorations.push(Decoration.line({ class: classes.join(' ') }).range(line.from))
    }
  }

  return Decoration.set(decorations, true)
}

const journalMarkdownLineDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildMarkdownLineDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildMarkdownLineDecorations(update.view)
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
)

const journalEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--journal-text-primary)',
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
    padding: 'var(--journal-space-12) var(--journal-space-10) var(--journal-space-10) var(--journal-space-12)',
    caretColor: 'var(--color-primary)',
  },
  '.cm-line': {
    borderRadius: 'var(--journal-radius-control)',
    padding: '0 0.35rem',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 9%, transparent)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--color-primary)',
  },
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--color-primary-soft) 62%, transparent)',
    outline: '1px solid color-mix(in srgb, var(--color-primary) 16%, transparent)',
  },
  '.tok-heading': {
    color: 'var(--color-foreground)',
    fontWeight: '650',
  },
  '.tok-heading-1': {
    fontSize: '1.38em',
    lineHeight: '1.55',
  },
  '.tok-heading-2': {
    fontSize: '1.2em',
    lineHeight: '1.65',
  },
  '.tok-heading-3': {
    fontSize: '1.08em',
  },
  '.tok-heading.tok-meta': {
    color: 'var(--journal-text-quaternary)',
  },
  '.tok-emphasis': {
    color: 'var(--color-primary)',
    fontStyle: 'italic',
  },
  '.tok-strong': {
    color: 'var(--color-primary-hover)',
    fontWeight: '700',
  },
  '.tok-strikethrough': {
    borderRadius: 'var(--radius-sm)',
    color: 'var(--journal-text-tertiary)',
    backgroundColor: 'var(--journal-danger-background)',
    textDecoration: 'line-through',
    textDecorationColor: 'color-mix(in srgb, var(--color-destructive) 46%, transparent)',
    textDecorationThickness: '0.08em',
  },
  '.tok-quote': {
    color: 'var(--color-primary)',
  },
  '.tok-list': {
    color: 'var(--color-primary)',
    fontWeight: '550',
  },
  '.tok-monospace': {
    border: '1px solid var(--journal-line-control)',
    borderRadius: 'var(--radius-sm)',
    padding: '0.04rem 0.24rem',
    color: 'var(--color-primary-hover)',
    backgroundColor: 'color-mix(in srgb, var(--color-primary-soft) 42%, transparent)',
    fontFamily: '"SFMono-Regular", "Menlo", "Consolas", monospace',
    fontSize: '0.9em',
  },
  '.tok-link': {
    color: 'var(--color-primary)',
    textDecoration: 'underline',
    textUnderlineOffset: '0.16em',
  },
  '.tok-url': {
    color: 'color-mix(in srgb, var(--color-info) 72%, var(--color-muted-fg))',
  },
  '.tok-content-separator': {
    color: 'var(--journal-text-quaternary)',
  },
  '.tok-meta': {
    color: 'var(--journal-text-quaternary)',
  },
  '.tok-strong.tok-meta, .tok-emphasis.tok-meta, .tok-link.tok-meta': {
    color: 'var(--journal-text-disabled)',
    fontWeight: '500',
    textDecoration: 'none',
  },
  '.cm-md-heading-line': {
    paddingTop: '0.18rem',
    paddingBottom: '0.12rem',
  },
  '.cm-md-heading-1': {
    marginTop: '0.4rem',
  },
  '.cm-md-quote-line': {
    borderLeft: '2px solid color-mix(in srgb, var(--color-primary) 24%, transparent)',
    borderRadius: '0 var(--journal-radius-card) var(--journal-radius-card) 0',
    paddingLeft: '0.9rem',
    color: 'var(--journal-text-secondary)',
    backgroundColor: 'color-mix(in srgb, var(--color-primary-soft) 34%, transparent)',
  },
  '.cm-md-code-line': {
    borderRadius: '0',
    paddingLeft: '0.85rem',
    color: 'var(--color-primary-hover)',
    backgroundColor: 'color-mix(in srgb, var(--color-muted) 70%, transparent)',
    fontFamily: '"SFMono-Regular", "Menlo", "Consolas", monospace',
    fontSize: '0.9em',
    lineHeight: '1.75',
  },
  '.cm-md-code-boundary': {
    color: 'var(--journal-text-quaternary)',
    backgroundColor: 'var(--color-muted)',
  },
  '.cm-md-code-line .tok-monospace': {
    border: '0',
    borderRadius: '0',
    padding: '0',
    color: 'inherit',
    backgroundColor: 'transparent',
    fontSize: 'inherit',
  },
  '.cm-md-code-line .tok-meta': {
    color: 'var(--journal-text-quaternary)',
  },
  '.cm-md-separator-line': {
    color: 'var(--journal-text-quaternary)',
    textAlign: 'center',
    letterSpacing: '0',
  },
})

function JournalMarkdownEditor({ value, onChange, onCompositionChange }: JournalMarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const initialValueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const onCompositionChangeRef = useRef(onCompositionChange)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onCompositionChangeRef.current = onCompositionChange
  }, [onCompositionChange])

  useEffect(() => {
    if (!hostRef.current) {
      return
    }

    const view = new EditorView({
      doc: initialValueRef.current,
      parent: hostRef.current,
      extensions: [
        minimalSetup,
        indentUnit.of('    '),
        markdown({ extensions: [GFM] }),
        syntaxHighlighting(journalHighlightStyle),
        journalMarkdownLineDecorations,
        keymap.of([{ key: 'Tab', run: indentMarkdownListWithTab, shift: indentWithTab.shift }]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': '日记正文' }),
        EditorView.domEventHandlers({
          compositionstart(_event, view) {
            onCompositionChangeRef.current?.(true, view.state.doc.toString())
            return false
          },
          compositionend(_event, view) {
            onCompositionChangeRef.current?.(false, view.state.doc.toString())
            return false
          },
          paste(event, view) {
            const text = event.clipboardData?.getData('text/plain') ?? ''

            if (!quoteMultilinePasteInActiveQuote(view, text)) {
              return false
            }

            event.preventDefault()
            return true
          },
        }),
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
