import { useCallback, useRef, useState } from 'react'
import {
  serializeJournalFrontMatter,
  type DayFrontMatter,
} from '@journal/core'

type SavedJournalSnapshot = {
  frontMatter: DayFrontMatter
  markdown: string
}

type UseJournalFileInput = {
  hasLoadedJournal: boolean
  journalFrontMatter: DayFrontMatter
  journalMarkdown: string
}

export function useJournalFile({
  hasLoadedJournal,
  journalFrontMatter,
  journalMarkdown,
}: UseJournalFileInput) {
  const [lastSavedJournalSnapshot, setLastSavedJournalSnapshot] = useState<SavedJournalSnapshot>(() => ({
    frontMatter: {},
    markdown: '',
  }))
  const lastSavedMarkdownRef = useRef('')
  const lastSavedFrontMatterRef = useRef<DayFrontMatter>({})
  const updateLastSavedJournalSnapshot = useCallback((
    snapshot: SavedJournalSnapshot,
    options: { updateState?: boolean } = {},
  ) => {
    lastSavedMarkdownRef.current = snapshot.markdown
    lastSavedFrontMatterRef.current = snapshot.frontMatter

    if (options.updateState ?? true) {
      setLastSavedJournalSnapshot(snapshot)
    }
  }, [])
  const hasUnsavedJournalChanges = hasLoadedJournal && (
    journalMarkdown !== lastSavedJournalSnapshot.markdown ||
    hasFrontMatterChanged(journalFrontMatter, lastSavedJournalSnapshot.frontMatter)
  )

  return {
    hasUnsavedJournalChanges,
    lastSavedFrontMatterRef,
    lastSavedMarkdownRef,
    updateLastSavedJournalSnapshot,
  }
}

export function hasFrontMatterChanged(currentFrontMatter: DayFrontMatter, savedFrontMatter: DayFrontMatter) {
  return serializeJournalFrontMatter(currentFrontMatter) !== serializeJournalFrontMatter(savedFrontMatter)
}
