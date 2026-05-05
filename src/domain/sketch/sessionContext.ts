import { createContext } from 'react'
import type { SketchCanvasPreset, SketchDocumentSummary, StoredSketchDocument } from './document'
import type {
  SketchEvent,
  SketchState,
} from './types'

export type SketchSessionContextValue = {
  currentDocument: StoredSketchDocument | null
  documents: SketchDocumentSummary[]
  status: 'loading' | 'ready' | 'saving' | 'error'
  error: string | null
  state: SketchState
  dispatchSketchEvent: (event: SketchEvent) => void
  resetSketch: () => void
  selectSketch: (id: string) => Promise<void>
  createSketch: (payload?: { title?: string; canvasPreset?: SketchCanvasPreset }) => Promise<void>
  importSketch: () => Promise<void>
  deleteCurrentSketch: () => Promise<void>
  renameCurrentSketch: (title: string) => void
  setCurrentCanvasPreset: (preset: SketchCanvasPreset) => void
  canUndo: boolean
  canRedo: boolean
  eventCount: number
  originalDuration: number
  replayDuration: number
}

export const SketchSessionContext = createContext<SketchSessionContextValue | null>(null)
