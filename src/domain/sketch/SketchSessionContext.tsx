import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react'
import { createReplayTimeline } from './timeline'
import { createInitialSketchState, sketchReducer } from './reducer'
import type { SketchEvent, SketchState } from './types'

type SketchSessionContextValue = {
  state: SketchState
  dispatchSketchEvent: (event: SketchEvent) => void
  canUndo: boolean
  canRedo: boolean
  eventCount: number
  originalDuration: number
  replayDuration: number
}

const SketchSessionContext = createContext<SketchSessionContextValue | null>(null)

export function SketchSessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatchSketchEvent] = useReducer(sketchReducer, undefined, createInitialSketchState)
  const timeline = useMemo(() => createReplayTimeline(state.events), [state.events])
  const value = useMemo<SketchSessionContextValue>(
    () => ({
      state,
      dispatchSketchEvent,
      canUndo: state.strokes.length > 0,
      canRedo: state.undoneStrokes.length > 0,
      eventCount: state.events.length,
      originalDuration: timeline.originalDuration,
      replayDuration: timeline.replayDuration,
    }),
    [state, timeline.originalDuration, timeline.replayDuration],
  )

  return <SketchSessionContext.Provider value={value}>{children}</SketchSessionContext.Provider>
}

export function useSketchSession() {
  const context = useContext(SketchSessionContext)

  if (!context) {
    throw new Error('useSketchSession must be used inside SketchSessionProvider')
  }

  return context
}

