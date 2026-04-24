import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { createTextSelector } from '../domain/annotations'
import type { Annotation } from '../domain/annotations'
import annotationTargetsEntry from '../domain/markdown/__fixtures__/annotation-targets.md?raw'
import { parseJournalMarkdown, renderJournalMarkdown } from '../domain/markdown'

const annotationKinds: Record<Annotation['kind'], string> = {
  observation: '观察',
  question: '追问',
  format: '结构',
  spelling: '校对',
}

function buildDemoAnnotations(markdown: string): Annotation[] {
  const { longEntryMarkdown } = parseJournalMarkdown(markdown)
  const tiredText = '今天真的**很累**'
  const repeatedText = '这句话会重复出现。'
  const tiredStart = longEntryMarkdown.indexOf(tiredText)
  const repeatedStart = longEntryMarkdown.lastIndexOf(repeatedText)

  return [
    {
      id: 'ann_tired',
      author: 'ai',
      kind: 'observation',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, tiredStart, tiredStart + tiredText.length),
      },
      body: {
        content: '这里保留了疲惫，也保留了行动。可以不用急着把它解释成积极或消极。',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:40:00+08:00',
    },
    {
      id: 'ann_repeat',
      author: 'ai',
      kind: 'question',
      target: {
        type: 'longEntryRange',
        selector: createTextSelector(longEntryMarkdown, repeatedStart, repeatedStart + repeatedText.length),
      },
      body: {
        content: '这句重复出现，像是在提醒某个还没说完的重点。要不要给它补一句原因？',
      },
      status: 'visible',
      createdAt: '2026-04-24T21:42:00+08:00',
    },
  ]
}

const demoAnnotations = buildDemoAnnotations(annotationTargetsEntry)

function MarkdownPreviewPage() {
  const [activeAnnotationId, setActiveAnnotationId] = useState(demoAnnotations[0]?.id ?? '')
  const previewRef = useRef<HTMLDivElement>(null)
  const renderedMarkdown = useMemo(
    () => renderJournalMarkdown({ markdown: annotationTargetsEntry, annotations: demoAnnotations }),
    [],
  )

  useEffect(() => {
    const preview = previewRef.current

    if (!preview) {
      return
    }

    for (const block of preview.querySelectorAll<HTMLElement>('[data-annotation-ids]')) {
      const ids = getAnnotationIds(block)
      block.dataset.annotationActive = ids.includes(activeAnnotationId) ? 'true' : 'false'
    }
  }, [activeAnnotationId])

  function selectAnnotation(annotationId: string, shouldScroll: boolean) {
    setActiveAnnotationId(annotationId)

    if (!shouldScroll) {
      return
    }

    const targetBlock = findBlockForAnnotation(annotationId)
    targetBlock?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null
    const annotatedBlock = target?.closest<HTMLElement>('[data-annotation-ids]')
    const firstAnnotationId = annotatedBlock ? getAnnotationIds(annotatedBlock)[0] : undefined

    if (firstAnnotationId) {
      selectAnnotation(firstAnnotationId, false)
    }
  }

  function findBlockForAnnotation(annotationId: string): HTMLElement | null {
    const preview = previewRef.current

    if (!preview) {
      return null
    }

    return Array.from(preview.querySelectorAll<HTMLElement>('[data-annotation-ids]')).find((block) =>
      getAnnotationIds(block).includes(annotationId),
    ) ?? null
  }

  return (
    <main className="min-h-screen bg-[#f4efe2] px-4 py-5 font-sans text-ink sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-7xl flex-col overflow-hidden border border-walnut/15 bg-[#fbf8ef] shadow-xl shadow-walnut/10">
        <header className="flex flex-col gap-4 border-b border-walnut/10 bg-white/65 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-7">
          <div>
            <p className="text-xs font-semibold uppercase text-sage">Markdown Preview</p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-3xl">2026-04-24 日记预览</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink/60">
            <span className="border border-sage/25 bg-sage/10 px-3 py-1 text-sage">块级批注</span>
            <span className="border border-brass/30 bg-brass/15 px-3 py-1 text-walnut">
              {demoAnnotations.length} 条批注
            </span>
          </div>
        </header>

        <section className="grid flex-1 min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <article className="min-h-0 overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
            <div
              ref={previewRef}
              className="markdown-preview mx-auto max-w-3xl"
              onClick={handlePreviewClick}
            >
              {renderedMarkdown}
            </div>
          </article>

          <aside className="border-t border-walnut/10 bg-white/70 px-4 py-5 lg:border-l lg:border-t-0">
            <div className="sticky top-5">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase text-sage">Annotations</p>
                <h2 className="mt-2 font-display text-xl font-semibold text-ink">批注</h2>
              </div>

              <div className="space-y-3">
                {demoAnnotations.map((annotation) => {
                  const isActive = annotation.id === activeAnnotationId

                  return (
                    <button
                      key={annotation.id}
                      className={`w-full border px-4 py-3 text-left transition ${
                        isActive
                          ? 'border-sage bg-sage/10 shadow-sm'
                          : 'border-walnut/10 bg-[#fbf8ef] hover:border-sage/40 hover:bg-white'
                      }`}
                      onClick={() => selectAnnotation(annotation.id, true)}
                      type="button"
                    >
                      <span className="text-xs font-semibold text-sage">{annotationKinds[annotation.kind]}</span>
                      <span className="mt-2 block text-sm leading-6 text-ink/75">{annotation.body.content}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

function getAnnotationIds(element: HTMLElement): string[] {
  return (element.dataset.annotationIds ?? '').split(/\s+/).filter(Boolean)
}

export default MarkdownPreviewPage
