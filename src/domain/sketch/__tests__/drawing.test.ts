import { describe, expect, it, vi } from 'vitest'
import { drawStroke, getVelocityAdjustedBrushSize } from '../drawing'
import type { Stroke } from '../types'

describe('getVelocityAdjustedBrushSize', () => {
  it('keeps slow strokes close to or slightly wider than the selected brush size', () => {
    expect(getVelocityAdjustedBrushSize(4, 0.02)).toBeGreaterThan(4)
    expect(getVelocityAdjustedBrushSize(4, 0.02)).toBeLessThan(4.7)
  })

  it('narrows the brush as stroke speed increases', () => {
    const slowWidth = getVelocityAdjustedBrushSize(4, 0.06)
    const fastWidth = getVelocityAdjustedBrushSize(4, 1.3)

    expect(fastWidth).toBeLessThan(slowWidth)
    expect(fastWidth).toBeLessThan(3)
  })

  it('fills multi-point pencil strokes as one outline without extra endpoint circles', () => {
    const context = createCanvasContextSpy()
    const stroke: Stroke = {
      id: 'stroke-1',
      tool: 'pencil',
      color: '#2f261f',
      size: 4,
      points: [
        { x: 10, y: 10, t: 0 },
        { x: 20, y: 16, t: 16 },
        { x: 35, y: 22, t: 32 },
        { x: 52, y: 28, t: 48 },
        { x: 70, y: 32, t: 64 },
      ],
    }

    drawStroke(context as unknown as CanvasRenderingContext2D, stroke)

    expect(context.arc).not.toHaveBeenCalled()
    expect(context.closePath).toHaveBeenCalledTimes(3)
    expect(context.fill).toHaveBeenCalledTimes(3)
  })
})

function createCanvasContextSpy() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineCap: 'round',
    lineJoin: 'round',
    lineWidth: 1,
    strokeStyle: '',
  }
}
