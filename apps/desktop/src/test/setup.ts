import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

const canvasContext = {
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
}

Object.defineProperty<HTMLCanvasElement>(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn((contextId: string) =>
    contextId === '2d' ? (canvasContext as unknown as CanvasRenderingContext2D) : null,
  ) as unknown as HTMLCanvasElement['getContext'],
})
