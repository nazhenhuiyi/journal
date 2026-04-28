export type SketchTool = 'pencil' | 'eraser'

export type SketchPoint = {
  x: number
  y: number
  t: number
  pressure?: number
}

export type Stroke = {
  id: string
  tool: SketchTool
  color: string
  size: number
  points: SketchPoint[]
}

export type StrokeStartEvent = {
  type: 'stroke:start'
  id: string
  at: number
  strokeId: string
  tool: SketchTool
  color: string
  size: number
  point: SketchPoint
}

export type StrokePointEvent = {
  type: 'stroke:point'
  id: string
  at: number
  strokeId: string
  point: SketchPoint
}

export type StrokeEndEvent = {
  type: 'stroke:end'
  id: string
  at: number
  strokeId: string
}

export type SketchHistoryEvent = {
  type: 'undo' | 'redo' | 'clear'
  id: string
  at: number
}

export type SketchEvent = StrokeStartEvent | StrokePointEvent | StrokeEndEvent | SketchHistoryEvent

export type SketchState = {
  events: SketchEvent[]
  strokes: Stroke[]
  undoneStrokes: Stroke[]
  activeStroke: Stroke | null
}

