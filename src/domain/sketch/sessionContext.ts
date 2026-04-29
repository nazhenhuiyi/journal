import { createContext } from 'react'
import type { SketchEvent, SketchState } from './types'

export type SketchSessionContextValue = {
  state: SketchState
  dispatchSketchEvent: (event: SketchEvent) => void
  canUndo: boolean
  canRedo: boolean
  eventCount: number
  originalDuration: number
  replayDuration: number
}

export const SketchSessionContext = createContext<SketchSessionContextValue | null>(null)
