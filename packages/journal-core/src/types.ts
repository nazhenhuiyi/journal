export type AnnotationFile = {
  version: 1
  date: string
  source: string
  sourceHash: string
  annotations: Annotation[]
}

export type Annotation = {
  id: string
  author: 'ai' | 'user'
  kind: 'observation' | 'question' | 'format' | 'spelling'
  target: AnnotationTarget
  body: {
    content: string
  }
  status: 'visible' | 'hidden' | 'orphaned'
  createdAt: string
  updatedAt?: string
  ai?: {
    threadId?: string
  }
}

export type AnnotationTarget =
  | {
      type: 'longEntryRange'
      selector: TextSelector
    }
  | {
      type: 'day'
    }

export type TextSelector = {
  sourceQuote: TextQuote
  plainQuote: TextQuote
  textPosition: TextPosition
  linePosition: LinePosition
}

export type TextQuote = {
  exact: string
  prefix?: string
  suffix?: string
}

export type TextPosition = {
  start: number
  end: number
}

export type LinePosition = {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export type ResolvedTextSelector =
  | {
      status: 'resolved'
      range: TextPosition
      method: 'linePosition' | 'textPosition' | 'sourceQuote' | 'plainQuote'
    }
  | {
      status: 'orphaned'
    }

export type ResolvedAnnotationRange = {
  annotationId: string
  start: number
  end: number
}

export type DayFrontMatter = {
  date?: string
  createdAt?: string
  updatedAt?: string
  title?: string
  excerpt?: string
  tags?: string[]
  favorite?: boolean
  collections?: string[]
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

export type JournalIndexEntry = {
  date: string
  fileName: string
  filePath: string
  updatedAt: string | null
  title?: string
  // Legacy cached indexes may still include this; new index files do not persist it.
  excerpt?: string
  tags: string[]
  favorite: boolean
  collections: string[]
  stats: {
    wordCount: number
    murmurCount: number
    imageCount: number
  }
  murmurs: {
    id: string
    time: string
    excerpt: string
    imageCount: number
  }[]
  images: {
    id: string
    murmurId: string
    src: string
    caption?: string
    location?: ImageLocation
    tags: string[]
  }[]
  searchableText: string
}

export type JournalIndexFile = {
  version: 1
  generatedAt: string
  entries: JournalIndexEntry[]
}
