import type { SketchEvent } from './types'

export const SKETCH_DOCUMENT_SCHEMA_VERSION = 1
export const DEFAULT_SKETCH_TITLE = '未命名随画'

export type SketchCanvasPreset =
  | 'landscape-3-2'
  | 'classic-4-3'
  | 'square-1-1'
  | 'wide-16-9'
  | 'portrait-4-5'

export type SketchCanvas = {
  preset: SketchCanvasPreset
  width: number
  height: number
}

export type SketchDocument = {
  schemaVersion: typeof SKETCH_DOCUMENT_SCHEMA_VERSION
  id: string
  title: string
  createdAt: string
  updatedAt: string
  canvas: SketchCanvas
  events: SketchEvent[]
}

export type StoredSketchDocument = SketchDocument & {
  fileName: string
  filePath: string
}

export type SketchDocumentSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  canvas: SketchCanvas
  eventCount: number
  fileName: string
  filePath: string
}

export type SketchCanvasPresetDefinition = SketchCanvas & {
  label: string
  description: string
}

export const SKETCH_CANVAS_PRESETS: SketchCanvasPresetDefinition[] = [
  {
    preset: 'landscape-3-2',
    label: '3:2 横版',
    description: '默认',
    width: 660,
    height: 440,
  },
  {
    preset: 'classic-4-3',
    label: '4:3 经典',
    description: '更稳的纸页',
    width: 640,
    height: 480,
  },
  {
    preset: 'square-1-1',
    label: '1:1 方形',
    description: '适合贴纸感',
    width: 560,
    height: 560,
  },
  {
    preset: 'wide-16-9',
    label: '16:9 宽屏',
    description: '横向叙事',
    width: 704,
    height: 396,
  },
  {
    preset: 'portrait-4-5',
    label: '4:5 竖版',
    description: '像小卡片',
    width: 528,
    height: 660,
  },
]

export const DEFAULT_SKETCH_CANVAS_PRESET: SketchCanvasPreset = 'landscape-3-2'

export function getSketchCanvasPreset(preset: SketchCanvasPreset): SketchCanvasPresetDefinition {
  return (
    SKETCH_CANVAS_PRESETS.find((definition) => definition.preset === preset) ??
    SKETCH_CANVAS_PRESETS[0]
  )
}

export function createSketchCanvas(preset: SketchCanvasPreset = DEFAULT_SKETCH_CANVAS_PRESET): SketchCanvas {
  const definition = getSketchCanvasPreset(preset)

  return {
    preset: definition.preset,
    width: definition.width,
    height: definition.height,
  }
}

export function isSketchCanvasPreset(value: unknown): value is SketchCanvasPreset {
  return (
    typeof value === 'string' &&
    SKETCH_CANVAS_PRESETS.some((definition) => definition.preset === value)
  )
}

export function fitSketchCanvasDisplay(
  canvas: Pick<SketchCanvas, 'width' | 'height'>,
  maxWidth = 930,
  maxHeight = 620,
) {
  const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height)

  return {
    width: Math.round(canvas.width * ratio),
    height: Math.round(canvas.height * ratio),
  }
}
