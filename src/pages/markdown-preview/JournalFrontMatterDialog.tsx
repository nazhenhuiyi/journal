import { useState } from 'react'
import type { DayFrontMatter } from '../../domain/markdown'
import { Sparkles } from '../../components/HandDrawnIcons'

export type EditableJournalFrontMatter = Pick<
  DayFrontMatter,
  'collections' | 'excerpt' | 'favorite' | 'tags' | 'title'
>

type JournalFrontMatterDialogProps = {
  collectionLibrary: string[]
  frontMatter: DayFrontMatter
  onClose: () => void
  onGenerateDraft: () => Promise<EditableJournalFrontMatter>
  onSave: (frontMatter: EditableJournalFrontMatter) => void
  tagLibrary: string[]
}

type DraftStatus = 'idle' | 'loading'

function JournalFrontMatterDialog({
  collectionLibrary,
  frontMatter,
  onClose,
  onGenerateDraft,
  onSave,
  tagLibrary,
}: JournalFrontMatterDialogProps) {
  const [title, setTitle] = useState(() => frontMatter.title ?? '')
  const [excerpt, setExcerpt] = useState(() => frontMatter.excerpt ?? '')
  const [tags, setTags] = useState(() => (frontMatter.tags ?? []).join(', '))
  const [collections, setCollections] = useState(() => (frontMatter.collections ?? []).join(', '))
  const [favorite, setFavorite] = useState(() => frontMatter.favorite === true)
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle')
  const [error, setError] = useState('')
  const visibleTagLibrary = tagLibrary
    .filter((tag) => !hasDelimitedValue(tags, tag))
    .slice(0, 14)
  const visibleCollectionLibrary = collectionLibrary
    .filter((collection) => !hasDelimitedValue(collections, collection))
    .slice(0, 10)

  async function handleGenerateDraft() {
    setDraftStatus('loading')
    setError('')

    try {
      const draft = await onGenerateDraft()

      setTitle(draft.title ?? '')
      setExcerpt(draft.excerpt ?? '')
      setTags((draft.tags ?? []).join(', '))
      setCollections((draft.collections ?? []).join(', '))
    } catch {
      setError('AI 暂时没有填好，可以稍后再试。')
    } finally {
      setDraftStatus('idle')
    }
  }

  function handleSave() {
    onSave({
      collections: normalizeDelimitedInput(collections),
      excerpt: normalizeOptionalText(excerpt),
      favorite: favorite ? true : undefined,
      tags: normalizeDelimitedInput(tags),
      title: normalizeOptionalText(title),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/24 px-8 py-8">
      <section
        aria-labelledby="journal-frontmatter-title"
        aria-modal="true"
        className="flex w-[620px] max-h-[calc(100vh-5rem)] flex-col overflow-hidden rounded-lg border border-walnut/15 bg-[#fffdf7] shadow-2xl shadow-ink/15"
        role="dialog"
      >
        <header className="flex items-center justify-between gap-4 border-b border-walnut/10 px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink" id="journal-frontmatter-title">
              策展信息
            </h2>
            <p className="mt-1 text-sm text-ink/55">这些信息会写进 Front Matter，用来搜索、筛选和整理回声。</p>
          </div>
          <button
            className="h-8 w-8 border border-walnut/10 text-sm font-semibold text-ink/60 transition hover:border-walnut/30 hover:text-ink"
            onClick={onClose}
            type="button"
          >
            -
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {error ? (
            <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">{error}</p>
          ) : null}

          <label className="block">
            <span className="text-xs font-semibold text-ink/55">标题</span>
            <input
              className="mt-1 w-full rounded border border-walnut/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-sage"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="雨夜和台灯"
              value={title}
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-ink/55">摘要</span>
            <textarea
              className="mt-1 min-h-20 w-full resize-none rounded border border-walnut/10 bg-white px-3 py-2 text-sm leading-6 text-ink outline-none transition focus:border-sage"
              onChange={(event) => setExcerpt(event.target.value)}
              placeholder="一句话留住这一天。"
              value={excerpt}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-ink/55">标签</span>
              <input
                className="mt-1 w-full rounded border border-walnut/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-sage"
                onChange={(event) => setTags(event.target.value)}
                placeholder="雨, 夜晚, 台灯"
                value={tags}
              />
              {visibleTagLibrary.length > 0 ? (
                <div aria-label="标签库" className="mt-2 flex flex-wrap gap-1.5">
                  {visibleTagLibrary.map((tag) => (
                    <button
                      className="rounded-full border border-walnut/10 bg-white/70 px-2 py-0.5 text-xs font-semibold text-ink/55 transition hover:border-sage/40 hover:bg-sage/10 hover:text-ink"
                      key={tag}
                      onClick={() => setTags((currentTags) => appendDelimitedValue(currentTags, tag))}
                      type="button"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-ink/55">合集</span>
              <input
                className="mt-1 w-full rounded border border-walnut/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-sage"
                onChange={(event) => setCollections(event.target.value)}
                placeholder="雨天, 房间里的光"
                value={collections}
              />
              {visibleCollectionLibrary.length > 0 ? (
                <div aria-label="合集库" className="mt-2 flex flex-wrap gap-1.5">
                  {visibleCollectionLibrary.map((collection) => (
                    <button
                      className="rounded-full border border-walnut/10 bg-white/70 px-2 py-0.5 text-xs font-semibold text-ink/55 transition hover:border-sage/40 hover:bg-sage/10 hover:text-ink"
                      key={collection}
                      onClick={() => setCollections((currentCollections) =>
                        appendDelimitedValue(currentCollections, collection)
                      )}
                      type="button"
                    >
                      {collection}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-ink/70">
            <input
              checked={favorite}
              className="h-4 w-4 accent-sage"
              onChange={(event) => setFavorite(event.target.checked)}
              type="checkbox"
            />
            收藏这一页
          </label>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-walnut/10 px-5 py-4">
          <button
            className="inline-flex items-center gap-2 rounded border border-sage/30 bg-sage/10 px-3 py-2 text-sm font-semibold text-ink transition hover:border-sage hover:bg-sage/15 disabled:cursor-wait disabled:opacity-60"
            disabled={draftStatus === 'loading'}
            onClick={() => void handleGenerateDraft()}
            type="button"
          >
            <Sparkles aria-hidden="true" size={16} strokeWidth={2.2} />
            {draftStatus === 'loading' ? 'AI 正在整理...' : 'AI 自动填充'}
          </button>

          <div className="flex items-center gap-2">
            <button
              className="rounded border border-walnut/10 px-4 py-2 text-sm font-semibold text-ink/60 transition hover:border-walnut/30 hover:text-ink"
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="rounded border border-ink bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-walnut"
              onClick={handleSave}
              type="button"
            >
              保存
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}

function normalizeOptionalText(value: string) {
  const normalized = value.trim()

  return normalized || undefined
}

function normalizeDelimitedInput(value: string) {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function hasDelimitedValue(value: string, candidate: string) {
  const normalizedCandidate = candidate.trim().toLocaleLowerCase()

  return normalizeDelimitedInput(value).some((item) => item.toLocaleLowerCase() === normalizedCandidate)
}

function appendDelimitedValue(value: string, nextValue: string) {
  const items = normalizeDelimitedInput(value)

  if (items.some((item) => item.toLocaleLowerCase() === nextValue.trim().toLocaleLowerCase())) {
    return items.join(', ')
  }

  return [...items, nextValue.trim()].filter(Boolean).join(', ')
}

export default JournalFrontMatterDialog
