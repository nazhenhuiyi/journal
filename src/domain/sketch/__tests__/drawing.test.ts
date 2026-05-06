import { describe, expect, it } from 'vitest'
import { getVelocityAdjustedBrushSize } from '../drawing'

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
})
