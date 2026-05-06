import type { SketchState, Stroke } from './types'

export const SKETCH_CANVAS_WIDTH = 660
export const SKETCH_CANVAS_HEIGHT = 440
export const SKETCH_CANVAS_DISPLAY_WIDTH = 930
export const SKETCH_CANVAS_DISPLAY_HEIGHT = 620
export const SKETCH_THUMBNAIL_WIDTH = 420
export const SKETCH_THUMBNAIL_HEIGHT = 280

const SLOW_BRUSH_SPEED = 0.08
const FAST_BRUSH_SPEED = 1.12
const SLOW_BRUSH_SIZE_MULTIPLIER = 1.14
const FAST_BRUSH_SIZE_MULTIPLIER = 0.56
const MIN_BRUSH_SIZE = 0.8

type SizedSketchPoint = Stroke['points'][number] & {
  width: number
}

type RenderedSizedPoint = SizedSketchPoint & {
  renderX: number
  renderY: number
}

type OutlinePoint = {
  x: number
  y: number
}

export function setupCanvasDpi(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  displayWidth = width,
  displayHeight = height,
): CanvasRenderingContext2D | null {
  const ratio = Math.max(1, window.devicePixelRatio || 1)

  canvas.width = Math.round(displayWidth * ratio)
  canvas.height = Math.round(displayHeight * ratio)
  canvas.style.width = `${displayWidth}px`
  canvas.style.height = `${displayHeight}px`

  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  context.setTransform(
    ratio * (displayWidth / width),
    0,
    0,
    ratio * (displayHeight / height),
    0,
    0,
  )

  return context
}

export function renderSketch(
  context: CanvasRenderingContext2D,
  state: Pick<SketchState, 'activeStroke' | 'strokes'>,
  width: number,
  height: number,
) {
  clearSketchCanvas(context, width, height)

  for (const stroke of state.strokes) {
    drawStroke(context, stroke)
  }

  if (state.activeStroke) {
    drawStroke(context, state.activeStroke)
  }
}

export function clearSketchCanvas(context: CanvasRenderingContext2D, width: number, height: number) {
  context.clearRect(0, 0, width, height)
}

export function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length === 0) {
    return
  }

  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (stroke.tool === 'eraser') {
    context.globalCompositeOperation = 'destination-out'
    context.globalAlpha = 1
    context.strokeStyle = 'rgba(0, 0, 0, 1)'
    context.fillStyle = 'rgba(0, 0, 0, 1)'
    context.lineWidth = stroke.size
    drawSmoothPath(context, stroke, 0, 0)
    context.restore()
    return
  }

  context.globalCompositeOperation = 'source-over'
  context.strokeStyle = stroke.color
  context.fillStyle = stroke.color
  context.globalAlpha = 0.76
  drawVariableWidthPath(context, stroke, 0, 0, 1)

  context.globalAlpha = 0.24
  drawVariableWidthPath(context, stroke, 0.42, -0.3, 0.42)

  context.globalAlpha = 0.16
  drawVariableWidthPath(context, stroke, -0.34, 0.38, 0.28)
  context.restore()
}

export function getVelocityAdjustedBrushSize(size: number, speed: number) {
  const speedRatio = clamp((speed - SLOW_BRUSH_SPEED) / (FAST_BRUSH_SPEED - SLOW_BRUSH_SPEED), 0, 1)
  const easedSpeedRatio = 1 - (1 - speedRatio) ** 2
  const sizeMultiplier = lerp(SLOW_BRUSH_SIZE_MULTIPLIER, FAST_BRUSH_SIZE_MULTIPLIER, easedSpeedRatio)

  return Math.max(MIN_BRUSH_SIZE, size * sizeMultiplier)
}

function drawVariableWidthPath(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  jitterX: number,
  jitterY: number,
  widthScale: number,
) {
  const points = buildSizedPoints(stroke).map((point) => ({
    ...point,
    renderX: point.x + jitterFor(point.t, jitterX),
    renderY: point.y + jitterFor(point.t + 17, jitterY),
  }))

  if (points.length === 1) {
    drawSizedPoint(context, points[0], jitterX, jitterY, widthScale)
    return
  }

  const outline = buildStrokeOutline(points, widthScale)

  if (!outline) {
    drawSizedPoint(context, points[0], jitterX, jitterY, widthScale)
    return
  }

  context.beginPath()
  context.moveTo(outline.left[0].x, outline.left[0].y)

  for (const point of outline.left.slice(1)) {
    context.lineTo(point.x, point.y)
  }

  for (const point of [...outline.right].reverse()) {
    context.lineTo(point.x, point.y)
  }

  context.closePath()
  context.fill()
}

function buildSizedPoints(stroke: Stroke): SizedSketchPoint[] {
  const minWidth = Math.min(stroke.size * FAST_BRUSH_SIZE_MULTIPLIER, MIN_BRUSH_SIZE)
  const maxWidth = Math.max(MIN_BRUSH_SIZE, stroke.size * SLOW_BRUSH_SIZE_MULTIPLIER)
  let previousWidth = getVelocityAdjustedBrushSize(stroke.size, 0)

  return stroke.points.map((point, index) => {
    const previousPoint = stroke.points[index - 1]

    if (!previousPoint) {
      return {
        ...point,
        width: previousWidth,
      }
    }

    const speed = distanceBetween(previousPoint, point) / Math.max(1, point.t - previousPoint.t)
    const rawWidth = getVelocityAdjustedBrushSize(stroke.size, speed)
    const width = clamp(previousWidth * 0.56 + rawWidth * 0.44, minWidth, maxWidth)
    previousWidth = width

    return {
      ...point,
      width,
    }
  })
}

function drawSizedPoint(
  context: CanvasRenderingContext2D,
  point: SizedSketchPoint,
  jitterX: number,
  jitterY: number,
  widthScale: number,
) {
  const radius = Math.max(0.35, (point.width * widthScale) / 2)
  const x = point.x + jitterFor(point.t, jitterX)
  const y = point.y + jitterFor(point.t + 17, jitterY)

  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()
}

function buildStrokeOutline(points: RenderedSizedPoint[], widthScale: number) {
  const left: OutlinePoint[] = []
  const right: OutlinePoint[] = []

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const previousPoint = points[index - 1]
    const nextPoint = points[index + 1]
    const tangentX = nextPoint && previousPoint
      ? nextPoint.renderX - previousPoint.renderX
      : nextPoint
        ? nextPoint.renderX - point.renderX
        : previousPoint
          ? point.renderX - previousPoint.renderX
          : 0
    const tangentY = nextPoint && previousPoint
      ? nextPoint.renderY - previousPoint.renderY
      : nextPoint
        ? nextPoint.renderY - point.renderY
        : previousPoint
          ? point.renderY - previousPoint.renderY
          : 0
    const tangentLength = Math.hypot(tangentX, tangentY)

    if (tangentLength === 0) {
      continue
    }

    const isEndpoint = index === 0 || index === points.length - 1
    const radius = isEndpoint ? 0 : Math.max(0.35, (point.width * widthScale) / 2)
    const normalX = -tangentY / tangentLength
    const normalY = tangentX / tangentLength

    const leftPoint = {
      x: point.renderX + normalX * radius,
      y: point.renderY + normalY * radius,
    }
    const rightPoint = {
      x: point.renderX - normalX * radius,
      y: point.renderY - normalY * radius,
    }

    left.push(leftPoint)
    right.push(rightPoint)
  }

  if (left.length < 2 || right.length < 2) {
    return null
  }

  return { left, right }
}

function drawSmoothPath(context: CanvasRenderingContext2D, stroke: Stroke, jitterX: number, jitterY: number) {
  const [firstPoint, ...restPoints] = stroke.points
  const radius = Math.max(0.6, stroke.size / 2)

  if (restPoints.length === 0) {
    context.beginPath()
    context.arc(firstPoint.x + jitterX, firstPoint.y + jitterY, radius, 0, Math.PI * 2)
    context.fill()
    return
  }

  context.beginPath()
  context.moveTo(firstPoint.x + jitterFor(firstPoint.t, jitterX), firstPoint.y + jitterFor(firstPoint.t + 17, jitterY))

  for (let index = 0; index < restPoints.length - 1; index += 1) {
    const currentPoint = restPoints[index]
    const nextPoint = restPoints[index + 1]
    const midX = (currentPoint.x + nextPoint.x) / 2
    const midY = (currentPoint.y + nextPoint.y) / 2

    context.quadraticCurveTo(
      currentPoint.x + jitterFor(currentPoint.t, jitterX),
      currentPoint.y + jitterFor(currentPoint.t + 17, jitterY),
      midX + jitterFor(nextPoint.t, jitterX),
      midY + jitterFor(nextPoint.t + 17, jitterY),
    )
  }

  const lastPoint = restPoints[restPoints.length - 1]
  context.lineTo(lastPoint.x + jitterFor(lastPoint.t, jitterX), lastPoint.y + jitterFor(lastPoint.t + 17, jitterY))
  context.stroke()
}

function jitterFor(seed: number, amount: number) {
  if (amount === 0) {
    return 0
  }

  return Math.sin(seed * 12.9898) * amount
}

function distanceBetween(
  firstPoint: Pick<SizedSketchPoint, 'x' | 'y'>,
  secondPoint: Pick<SizedSketchPoint, 'x' | 'y'>,
) {
  return Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y)
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
