/// <reference path="./diff3.d.ts" />

import {
  createJournalMarkdownWithFrontMatter,
  parseJournalMarkdown,
  serializeJournalMarkdownBody,
  type DayFrontMatter,
  type MurmurBlock,
} from '@journal/core'
import diff3Merge from 'diff3'
import type { MergeDriverCallback } from 'isomorphic-git'
import {
  chooseFallbackMergeContent,
  type FallbackMergeSide,
} from './lastWriteWins'

export type JournalMergeStats = {
  conflictPaths: number
  fallbackPaths: number
  journalStructurePaths: number
  markdownPaths: number
}

export type TextMergeInput = {
  base: string
  ours: string
  oursName?: string
  theirs: string
  theirsName?: string
}

export type TextMergeResult = {
  cleanMerge: boolean
  mergedText: string
}

const lineBreaksPattern = /^.*(\r?\n|$)/gm
const conflictMarkerSize = 7
const deletedMurmur = Symbol('deletedMurmur')

export function createJournalMergeStats(): JournalMergeStats {
  return {
    conflictPaths: 0,
    fallbackPaths: 0,
    journalStructurePaths: 0,
    markdownPaths: 0,
  }
}

export function createJournalMergeDriver(
  fallbackSide: FallbackMergeSide = 'theirs',
  stats: JournalMergeStats = createJournalMergeStats(),
): MergeDriverCallback {
  return ({ branches, contents, path }) => {
    const base = contents.length >= 3 ? contents[0] : ''
    const ours = contents.length >= 3 ? contents[1] : contents[0] ?? ''
    const theirs = contents.length >= 3 ? contents[2] : contents[1] ?? ''

    if (isMarkdownPath(path)) {
      stats.markdownPaths += 1

      const result = mergeTextDiff3({
        base,
        ours,
        oursName: branches[1] ?? 'ours',
        theirs,
        theirsName: branches[2] ?? 'theirs',
      })

      if (!result.cleanMerge) {
        const journalMerge = mergeJournalMarkdownStructure({
          base,
          ours,
          theirs,
        })

        if (journalMerge) {
          stats.journalStructurePaths += 1

          return journalMerge
        }

        stats.conflictPaths += 1
      }

      return result
    }

    stats.fallbackPaths += 1

    const result = chooseFallbackMergeContent({
      fallbackSide,
      ours,
      path,
      theirs,
    })

    return {
      cleanMerge: true,
      mergedText: result.content,
    }
  }
}

export function mergeJournalMarkdownStructure(input: TextMergeInput): TextMergeResult | null {
  const base = parseJournalMarkdown(input.base)
  const ours = parseJournalMarkdown(input.ours)
  const theirs = parseJournalMarkdown(input.theirs)

  if (
    hasErrorDiagnostic(base.diagnostics) ||
    hasErrorDiagnostic(ours.diagnostics) ||
    hasErrorDiagnostic(theirs.diagnostics)
  ) {
    return null
  }

  const longEntryMerge = mergeTextDiff3({
    base: base.longEntryMarkdown,
    ours: ours.longEntryMarkdown,
    oursName: input.oursName,
    theirs: theirs.longEntryMarkdown,
    theirsName: input.theirsName,
  })

  if (!longEntryMerge.cleanMerge) {
    return null
  }

  const murmurs = mergeMurmursById(base.murmurs, ours.murmurs, theirs.murmurs)

  if (!murmurs) {
    return null
  }

  const body = serializeJournalMarkdownBody(longEntryMerge.mergedText, murmurs)

  return {
    cleanMerge: true,
    mergedText: createJournalMarkdownWithFrontMatter(
      body,
      chooseFrontMatter(base.frontMatter, ours.frontMatter, theirs.frontMatter),
    ),
  }
}

export function mergeTextDiff3(input: TextMergeInput): TextMergeResult {
  const blocks = diff3Merge(
    splitMergeLines(input.ours),
    splitMergeLines(input.base),
    splitMergeLines(input.theirs),
  )
  const oursName = input.oursName ?? 'ours'
  const theirsName = input.theirsName ?? 'theirs'
  let cleanMerge = true
  let mergedText = ''

  for (const block of blocks) {
    if ('ok' in block) {
      mergedText += block.ok.join('')
      continue
    }

    cleanMerge = false
    mergedText += `${'<'.repeat(conflictMarkerSize)} ${oursName}\n`
    mergedText += block.conflict.a.join('')
    mergedText += `${'='.repeat(conflictMarkerSize)}\n`
    mergedText += block.conflict.b.join('')
    mergedText += `${'>'.repeat(conflictMarkerSize)} ${theirsName}\n`
  }

  return {
    cleanMerge,
    mergedText,
  }
}

function splitMergeLines(content: string) {
  return content.match(lineBreaksPattern) ?? []
}

function isMarkdownPath(path: string) {
  return path.endsWith('.md')
}

function mergeMurmursById(
  base: MurmurBlock[],
  ours: MurmurBlock[],
  theirs: MurmurBlock[],
) {
  const baseMap = new Map(base.map((murmur) => [murmur.id, murmur]))
  const oursMap = new Map(ours.map((murmur) => [murmur.id, murmur]))
  const theirsMap = new Map(theirs.map((murmur) => [murmur.id, murmur]))
  const merged = new Map<string, MurmurBlock>()

  for (const id of new Set([...baseMap.keys(), ...oursMap.keys(), ...theirsMap.keys()])) {
    const baseMurmur = baseMap.get(id)
    const oursMurmur = oursMap.get(id)
    const theirsMurmur = theirsMap.get(id)
    const resolved = resolveMurmur(baseMurmur, oursMurmur, theirsMurmur)

    if (resolved === null) {
      return null
    }

    if (resolved === deletedMurmur) {
      continue
    }

    merged.set(id, resolved)
  }

  return [...merged.values()].sort(compareMurmurs)
}

function resolveMurmur(
  base: MurmurBlock | undefined,
  ours: MurmurBlock | undefined,
  theirs: MurmurBlock | undefined,
) {
  const baseSignature = base ? getMurmurSignature(base) : null
  const oursSignature = ours ? getMurmurSignature(ours) : null
  const theirsSignature = theirs ? getMurmurSignature(theirs) : null

  if (!base) {
    if (ours && theirs && oursSignature !== theirsSignature) {
      return null
    }

    return ours ?? theirs ?? null
  }

  if (oursSignature === null && theirsSignature === null) {
    return deletedMurmur
  }

  if (oursSignature === theirsSignature) {
    return ours ?? theirs ?? base
  }

  if (!ours) {
    return theirsSignature === baseSignature ? deletedMurmur : null
  }

  if (!theirs) {
    return oursSignature === baseSignature ? deletedMurmur : null
  }

  if (oursSignature === baseSignature) {
    return theirs
  }

  if (theirsSignature === baseSignature) {
    return ours
  }

  return null
}

function compareMurmurs(left: MurmurBlock, right: MurmurBlock) {
  const leftTime = Date.parse(left.time)
  const rightTime = Date.parse(right.time)

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime
  }

  return left.id.localeCompare(right.id)
}

function chooseFrontMatter(
  base: DayFrontMatter,
  ours: DayFrontMatter,
  theirs: DayFrontMatter,
) {
  const baseSignature = getFrontMatterSignature(base)
  const oursSignature = getFrontMatterSignature(ours)
  const theirsSignature = getFrontMatterSignature(theirs)

  if (oursSignature === theirsSignature) {
    return ours
  }

  if (oursSignature === baseSignature) {
    return theirs
  }

  if (theirsSignature === baseSignature) {
    return ours
  }

  return getFrontMatterUpdatedAt(ours) >= getFrontMatterUpdatedAt(theirs) ? ours : theirs
}

function getFrontMatterSignature(frontMatter: DayFrontMatter) {
  return JSON.stringify(frontMatter)
}

function getFrontMatterUpdatedAt(frontMatter: DayFrontMatter) {
  const timestamp = typeof frontMatter.updatedAt === 'string'
    ? Date.parse(frontMatter.updatedAt)
    : Number.NEGATIVE_INFINITY

  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

function getMurmurSignature(murmur: MurmurBlock) {
  return JSON.stringify(murmur)
}

function hasErrorDiagnostic(diagnostics: Array<{ severity: string }>) {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error')
}
