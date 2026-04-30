export type DayFrontMatter = {
  date?: string
  createdAt?: string
  updatedAt?: string
  weather?: {
    text?: string
    temperature?: number
    feelsLike?: number
    humidity?: number
    windSpeed?: number
    updatedAt?: string
  }
  location?: {
    name?: string
    region?: string
    country?: string
    query?: string
  }
  [key: string]: unknown
}

export type ImageLocation = {
  name?: string
  latitude?: number
  longitude?: number
  source?: 'exif' | 'manual' | 'system'
}

export type ImageBlock = {
  id: string
  src: string
  caption?: string
  tags: string[]
  location?: ImageLocation
}

export type MurmurBlock = {
  id: string
  time: string
  body: string
  images: ImageBlock[]
}

export type MarkdownDiagnostic = {
  severity: 'warning' | 'error'
  message: string
  line?: number
  column?: number
}

export type ParsedJournalEntry = {
  frontMatter: DayFrontMatter
  longEntryMarkdown: string
  murmurs: MurmurBlock[]
  diagnostics: MarkdownDiagnostic[]
}

export type RenderJournalMarkdownOptions = {
  markdown: string
  annotations?: Annotation[]
  sourceFilePath?: string
}
import type { Annotation } from '../annotations'
