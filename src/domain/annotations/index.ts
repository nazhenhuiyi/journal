export { annotationIdsForBlock, resolveAnnotationRanges } from './attachAnnotationsToBlocks'
export {
  createAnnotationFromDraft,
  findDraftAnchorRange,
  resolveAnnotationDraft,
} from './annotationDrafts'
export { createTextSelector } from './createTextSelector'
export { createDomRangesByAnnotation, createDomRangesForSourceRange } from './domRanges'
export { createPlainTextSnapshot, markdownToPlainText } from './plainText'
export { resolveTextSelector } from './resolveTextSelector'
export type {
  Annotation,
  AnnotationFile,
  AnnotationTarget,
  LinePosition,
  ResolvedAnnotationRange,
  ResolvedTextSelector,
  TextPosition,
  TextQuote,
  TextSelector,
} from './types'
export type { AiAnnotationDraft, ResolvedAnnotationDraft } from './annotationDrafts'
