import { describe, expect, it } from 'vitest'
import { createInitialSketchState, sketchReducer } from '../reducer'
import type { SketchEvent } from '../types'

const strokeEvents: SketchEvent[] = [
  {
    type: 'stroke:start',
    id: 'event-1',
    at: 0,
    strokeId: 'stroke-1',
    tool: 'pencil',
    color: '#2f261f',
    size: 4,
    point: { x: 10, y: 12, t: 0 },
  },
  {
    type: 'stroke:point',
    id: 'event-2',
    at: 16,
    strokeId: 'stroke-1',
    point: { x: 18, y: 20, t: 16 },
  },
  {
    type: 'stroke:end',
    id: 'event-3',
    at: 32,
    strokeId: 'stroke-1',
  },
]

describe('sketchReducer', () => {
  it('builds a committed stroke from stroke events', () => {
    const state = strokeEvents.reduce(sketchReducer, createInitialSketchState())

    expect(state.strokes).toHaveLength(1)
    expect(state.strokes[0]).toMatchObject({
      id: 'stroke-1',
      tool: 'pencil',
      color: '#2f261f',
      size: 4,
    })
    expect(state.strokes[0].points).toHaveLength(2)
    expect(state.activeStroke).toBeNull()
    expect(state.events).toHaveLength(3)
  })

  it('undoes and redoes committed strokes only', () => {
    const withStroke = strokeEvents.reduce(sketchReducer, createInitialSketchState())
    const undone = sketchReducer(withStroke, { type: 'undo', id: 'event-4', at: 48 })
    const redone = sketchReducer(undone, { type: 'redo', id: 'event-5', at: 64 })

    expect(undone.strokes).toHaveLength(0)
    expect(undone.undoneStrokes).toHaveLength(1)
    expect(redone.strokes).toHaveLength(1)
    expect(redone.undoneStrokes).toHaveLength(0)
  })

  it('clears strokes and records the clear event', () => {
    const withStroke = strokeEvents.reduce(sketchReducer, createInitialSketchState())
    const cleared = sketchReducer(withStroke, { type: 'clear', id: 'event-4', at: 48 })

    expect(cleared.strokes).toHaveLength(0)
    expect(cleared.undoneStrokes).toHaveLength(0)
    expect(cleared.events.map((event) => event.type)).toEqual([
      'stroke:start',
      'stroke:point',
      'stroke:end',
      'clear',
    ])
  })
})

