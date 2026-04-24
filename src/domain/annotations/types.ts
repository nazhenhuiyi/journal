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
