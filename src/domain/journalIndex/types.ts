export type JournalIndexEntry = {
  date: string
  fileName: string
  filePath: string
  updatedAt: string | null
  title?: string
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
    tags: string[]
  }[]
  searchableText: string
}

export type JournalIndexFile = {
  version: 1
  generatedAt: string
  entries: JournalIndexEntry[]
}
