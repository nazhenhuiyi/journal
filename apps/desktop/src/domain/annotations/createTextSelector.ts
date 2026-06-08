import { createPlainTextSnapshot, markdownToPlainText } from './plainText'
import type { LinePosition, TextSelector } from './types'

const contextLength = 32

export function createTextSelector(markdown: string, start: number, end: number): TextSelector {
  if (start < 0 || end < start || end > markdown.length) {
    throw new RangeError('选区范围超出 Markdown 文本边界。')
  }

  const sourceExact = markdown.slice(start, end)
  const plainSnapshot = createPlainTextSnapshot(markdown)
  const plainRange = sourceRangeToPlainRange(plainSnapshot.sourceOffsets, start, end)
  const plainExact =
    plainRange.start === -1 || plainRange.end === -1
      ? markdownToPlainText(sourceExact).trim()
      : plainSnapshot.text.slice(plainRange.start, plainRange.end)

  return {
    sourceQuote: {
      exact: sourceExact,
      ...createSourceContext(markdown, start, end),
    },
    plainQuote: {
      exact: plainExact,
      ...createPlainContext(plainSnapshot.text, plainRange.start, plainRange.end),
    },
    textPosition: {
      start,
      end,
    },
    linePosition: offsetsToLinePosition(markdown, start, end),
  }
}

function createSourceContext(markdown: string, start: number, end: number) {
  return {
    prefix: markdown.slice(Math.max(0, start - contextLength), start),
    suffix: markdown.slice(end, Math.min(markdown.length, end + contextLength)),
  }
}

function createPlainContext(plainText: string, start: number, end: number) {
  if (start === -1 || end === -1) {
    return {}
  }

  return {
    prefix: plainText.slice(Math.max(0, start - contextLength), start),
    suffix: plainText.slice(end, Math.min(plainText.length, end + contextLength)),
  }
}

function sourceRangeToPlainRange(sourceOffsets: number[], start: number, end: number) {
  let plainStart = -1
  let plainEnd = -1

  for (let index = 0; index < sourceOffsets.length; index += 1) {
    const sourceOffset = sourceOffsets[index]

    if (sourceOffset >= start && sourceOffset < end) {
      if (plainStart === -1) {
        plainStart = index
      }

      plainEnd = index + 1
    }
  }

  return {
    start: plainStart,
    end: plainEnd,
  }
}

function offsetsToLinePosition(markdown: string, start: number, end: number): LinePosition {
  const startPoint = offsetToLineColumn(markdown, start)
  const endPoint = offsetToLineColumn(markdown, end)

  return {
    startLine: startPoint.line,
    startColumn: startPoint.column,
    endLine: endPoint.line,
    endColumn: endPoint.column,
  }
}

function offsetToLineColumn(markdown: string, offset: number) {
  let line = 1
  let column = 1

  for (let index = 0; index < offset; index += 1) {
    if (markdown[index] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }

  return { line, column }
}
