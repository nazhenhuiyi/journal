/// <reference types="vite/client" />

interface HighlightRegistry {
  delete(name: string): boolean
  set(name: string, highlight: Highlight): HighlightRegistry
}

declare class Highlight {
  constructor(...ranges: AbstractRange[])
}

interface CSS {
  highlights: HighlightRegistry
}
