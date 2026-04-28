import type { SketchState, Stroke } from './types'

export const SKETCH_CANVAS_WIDTH = 660
export const SKETCH_CANVAS_HEIGHT = 440
export const SKETCH_THUMBNAIL_WIDTH = 420
export const SKETCH_THUMBNAIL_HEIGHT = 280

export function setupCanvasDpi(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  const ratio = Math.max(1, window.devicePixelRatio || 1)

  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const context = canvas.getContext('2d')

  if (!context) {
    return null
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0)

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
  context.lineWidth = stroke.size
  drawSmoothPath(context, stroke, 0, 0)

  context.globalAlpha = 0.24
  context.lineWidth = Math.max(0.8, stroke.size * 0.42)
  drawSmoothPath(context, stroke, 0.42, -0.3)

  context.globalAlpha = 0.16
  context.lineWidth = Math.max(0.7, stroke.size * 0.28)
  drawSmoothPath(context, stroke, -0.34, 0.38)
  context.restore()
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
