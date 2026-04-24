import { createPlainTextSnapshot } from './plainText'
import type { ResolvedTextSelector, TextPosition, TextQuote, TextSelector } from './types'

export function resolveTextSelector(markdown: string, selector: TextSelector): ResolvedTextSelector {
  const lineRange = linePositionToRange(markdown, selector)

  if (lineRange && matchesSourceSelector(markdown, lineRange, selector.sourceQuote)) {
    return {
      status: 'resolved',
      range: lineRange,
      method: 'linePosition',
    }
  }

  if (matchesSourceSelector(markdown, selector.textPosition, selector.sourceQuote)) {
    return {
      status: 'resolved',
      range: selector.textPosition,
      method: 'textPosition',
    }
  }

  const sourceQuoteRange = findBestSourceQuoteRange(markdown, selector.sourceQuote)

  if (sourceQuoteRange) {
    return {
      status: 'resolved',
      range: sourceQuoteRange,
      method: 'sourceQuote',
    }
  }

  const plainQuoteRange = findPlainQuoteRange(markdown, selector.plainQuote)

  if (plainQuoteRange) {
    return {
      status: 'resolved',
      range: plainQuoteRange,
      method: 'plainQuote',
    }
  }

  return {
    status: 'orphaned',
  }
}

function matchesSourceSelector(markdown: string, range: TextPosition, quote: TextQuote): boolean {
  return markdown.slice(range.start, range.end) === quote.exact && scoreContext(markdown, range, quote) > 0
}

function findBestSourceQuoteRange(markdown: string, quote: TextQuote): TextPosition | null {
  const candidates = findAllRanges(markdown, quote.exact)

  if (candidates.length === 0) {
    return null
  }

  return rankByContext(markdown, candidates, quote)[0]
}

function findPlainQuoteRange(markdown: string, quote: TextQuote): TextPosition | null {
  const snapshot = createPlainTextSnapshot(markdown)
  const candidates = findAllRanges(snapshot.text, quote.exact)

  if (candidates.length === 0) {
    return null
  }

  const bestPlainRange = rankByContext(snapshot.text, candidates, quote)[0]
  const mappedStart = snapshot.sourceOffsets[bestPlainRange.start]
  const mappedEnd = snapshot.sourceOffsets[bestPlainRange.end - 1]

  if (typeof mappedStart !== 'number' || typeof mappedEnd !== 'number' || mappedStart < 0 || mappedEnd < 0) {
    return null
  }

  return {
    start: mappedStart,
    end: mappedEnd + 1,
  }
}

function findAllRanges(text: string, exact: string): TextPosition[] {
  if (!exact) {
    return []
  }

  const ranges: TextPosition[] = []
  let fromIndex = 0

  while (fromIndex <= text.length) {
    const start = text.indexOf(exact, fromIndex)

    if (start === -1) {
      break
    }

    ranges.push({
      start,
      end: start + exact.length,
    })
    fromIndex = start + 1
  }

  return ranges
}

function rankByContext(text: string, ranges: TextPosition[], quote: TextQuote): TextPosition[] {
  return [...ranges].sort((left, right) => {
    return scoreContext(text, right, quote) - scoreContext(text, left, quote)
  })
}

function scoreContext(text: string, range: TextPosition, quote: TextQuote): number {
  let score = 0

  if (quote.prefix && text.slice(Math.max(0, range.start - quote.prefix.length), range.start) === quote.prefix) {
    score += quote.prefix.length
  }

  if (quote.suffix && text.slice(range.end, range.end + quote.suffix.length) === quote.suffix) {
    score += quote.suffix.length
  }

  return score
}

function linePositionToRange(markdown: string, selector: TextSelector): TextPosition | null {
  const start = lineColumnToOffset(
    markdown,
    selector.linePosition.startLine,
    selector.linePosition.startColumn,
  )
  const end = lineColumnToOffset(
    markdown,
    selector.linePosition.endLine,
    selector.linePosition.endColumn,
  )

  if (start === null || end === null || end < start) {
    return null
  }

  return { start, end }
}

function lineColumnToOffset(markdown: string, targetLine: number, targetColumn: number): number | null {
  if (targetLine < 1 || targetColumn < 1) {
    return null
  }

  let line = 1
  let column = 1

  for (let offset = 0; offset <= markdown.length; offset += 1) {
    if (line === targetLine && column === targetColumn) {
      return offset
    }

    if (offset === markdown.length) {
      break
    }

    if (markdown[offset] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }

  return null
}
