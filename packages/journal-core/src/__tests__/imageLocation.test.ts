import { describe, expect, it } from 'vitest'
import {
  hasUsableImageLocationCoordinates,
  isUsableImageCoordinatePair,
} from '../index'

describe('image location coordinates', () => {
  it('accepts finite latitude and longitude inside the world bounds', () => {
    expect(isUsableImageCoordinatePair(30.657, 104.066)).toBe(true)
    expect(isUsableImageCoordinatePair(-33.8688, 151.2093)).toBe(true)
    expect(hasUsableImageLocationCoordinates({
      latitude: 39.992,
      longitude: 116.277,
      source: 'exif',
    })).toBe(true)
  })

  it('rejects missing, non-finite, out-of-range, and zero-zero coordinates', () => {
    expect(isUsableImageCoordinatePair(undefined, 104.066)).toBe(false)
    expect(isUsableImageCoordinatePair(Number.NaN, 104.066)).toBe(false)
    expect(isUsableImageCoordinatePair(30.657, Number.POSITIVE_INFINITY)).toBe(false)
    expect(isUsableImageCoordinatePair(91, 104.066)).toBe(false)
    expect(isUsableImageCoordinatePair(30.657, 181)).toBe(false)
    expect(isUsableImageCoordinatePair(0, 0)).toBe(false)
    expect(hasUsableImageLocationCoordinates({
      latitude: 0,
      longitude: 0,
      source: 'exif',
    })).toBe(false)
  })
})
