import { useMemo, useReducer, type ReactNode } from 'react'
import { createInitialSketchState, sketchReducer } from './reducer'
import { SketchSessionContext, type SketchSessionContextValue } from './sessionContext'
import { createReplayTimeline } from './timeline'

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
