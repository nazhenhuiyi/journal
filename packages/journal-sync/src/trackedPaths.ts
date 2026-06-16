const trackedPathPrefixes = [
  'annotations/',
  'entries/',
  'media/',
  'reviews/',
]
const trackedPathFiles = new Set(['manifest.json'])
const journalEntryPathPattern = /^entries\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.md$/
const journalAnnotationPathPattern = /^annotations\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/
const journalReviewPathPattern = /^reviews\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.json$/

export const trackedStatusFilepaths = [
  ...trackedPathPrefixes.map((pathPrefix) => pathPrefix.slice(0, -1)),
  ...trackedPathFiles,
]

export function normalizeCheckoutFilepaths(filepaths: readonly string[]) {
  return [...new Set(filepaths.map(normalizeRepositoryPath))]
    .filter(isSafeRepositoryPath)
    .sort()
}

export function normalizeRepositoryPath(filepath: string) {
  return filepath.trim().replace(/\\/g, '/').replace(/^\.?\//, '')
}

export function isJournalEntryPath(filepath: string) {
  return journalEntryPathPattern.test(filepath)
}

export function isTrackedJournalEntryPath(filepath: string) {
  return (
    isJournalEntryPath(filepath) ||
    (filepath.startsWith('entries/') && filepath.endsWith('.md') && !hasTemporaryOrHiddenPathSegment(filepath))
  )
}

export function isTrackedJournalPath(filepath: string) {
  return trackedPathFiles.has(filepath) ||
    isTrackedJournalEntryPath(filepath) ||
    isTrackedJournalAnnotationPath(filepath) ||
    isTrackedJournalReviewPath(filepath) ||
    isTrackedJournalMediaPath(filepath)
}

export function isTextMergeJournalPath(filepath: string) {
  return filepath.endsWith('.md') || filepath.endsWith('.json')
}

export function isTrackedJournalReviewPath(filepath: string) {
  return (
    journalReviewPathPattern.test(filepath) ||
    (filepath.startsWith('reviews/') && !hasTemporaryOrHiddenPathSegment(filepath))
  )
}

export function isTrackedJournalAnnotationPath(filepath: string) {
  return (
    journalAnnotationPathPattern.test(filepath) ||
    (filepath.startsWith('annotations/') && !hasTemporaryOrHiddenPathSegment(filepath))
  )
}

export function isSafeRepositoryPath(filepath: string) {
  const parts = normalizeRepositoryPath(filepath).split('/')

  return parts.length > 0 &&
    parts.every((part) => part !== '' && part !== '.' && part !== '..' && part !== '.git')
}

export function isTrackedJournalMediaPath(filepath: string) {
  return filepath.startsWith('media/') && !hasTemporaryOrHiddenPathSegment(filepath)
}

function hasTemporaryOrHiddenPathSegment(filepath: string) {
  return filepath.split('/').some((segment) => {
    return segment === '' ||
      segment.startsWith('.') ||
      segment.endsWith('.tmp')
  })
}
