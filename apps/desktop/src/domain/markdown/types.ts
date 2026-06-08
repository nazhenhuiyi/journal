import type { Annotation } from '@journal/core'

export type {
  DayFrontMatter,
  ImageBlock,
  ImageLocation,
  MarkdownDiagnostic,
  MurmurBlock,
  ParsedJournalEntry,
} from '@journal/core'

export type RenderJournalMarkdownOptions = {
  markdown: string
  annotations?: Annotation[]
  sourceFilePath?: string
}
