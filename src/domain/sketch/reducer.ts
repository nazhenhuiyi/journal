import type { SketchEvent, SketchState, Stroke } from './types'

export function createInitialSketchState(): SketchState {
  return {
    events: [],
    strokes: [],
    undoneStrokes: [],
    activeStroke: null,
  }
}

export function sketchReducer(state: SketchState, event: SketchEvent): SketchState {
  return applySketchEvent(
    {
      events: [...state.events, event],
      strokes: state.strokes,
      undoneStrokes: state.undoneStrokes,
      activeStroke: state.activeStroke,
    },
    event,
  )
}

export function deriveSketchState(events: SketchEvent[]): SketchState {
  return events.reduce((state, event) => applySketchEvent(state, event), createInitialSketchState())
}

function applySketchEvent(state: SketchState, event: SketchEvent): SketchState {
  switch (event.type) {
    case 'stroke:start':
      return {
        ...state,
        activeStroke: {
          id: event.strokeId,
          tool: event.tool,
          color: event.color,
          size: event.size,
          points: [event.point],
        },
        undoneStrokes: [],
      }

    case 'stroke:point':
      if (!state.activeStroke || state.activeStroke.id !== event.strokeId) {
        return state
      }

      return {
        ...state,
        activeStroke: {
          ...state.activeStroke,
          points: appendPoint(state.activeStroke.points, event.point),
        },
      }

    case 'stroke:end':
      if (!state.activeStroke || state.activeStroke.id !== event.strokeId) {
        return state
      }

      return {
        ...state,
        strokes: [...state.strokes, state.activeStroke],
        activeStroke: null,
        undoneStrokes: [],
      }

    case 'undo': {
      if (state.strokes.length === 0) {
        return state
      }

      const nextStrokes = state.strokes.slice(0, -1)
      const undoneStroke = state.strokes[state.strokes.length - 1]

      return {
        ...state,
        strokes: nextStrokes,
        undoneStrokes: [undoneStroke, ...state.undoneStrokes],
        activeStroke: null,
      }
    }

    case 'redo': {
      if (state.undoneStrokes.length === 0) {
        return state
      }

      const [restoredStroke, ...remainingUndone] = state.undoneStrokes

      return {
        ...state,
        strokes: [...state.strokes, restoredStroke],
        undoneStrokes: remainingUndone,
        activeStroke: null,
      }
    }

    case 'clear':
      return {
        ...state,
        strokes: [],
        undoneStrokes: [],
        activeStroke: null,
      }

    default:
      return state
  }
}

function appendPoint(points: Stroke['points'], point: Stroke['points'][number]) {
  const lastPoint = points[points.length - 1]

  if (lastPoint && lastPoint.x === point.x && lastPoint.y === point.y && lastPoint.t === point.t) {
    return points
  }

  return [...points, point]
}

