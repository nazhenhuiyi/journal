import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createSketchCanvas,
  DEFAULT_SKETCH_CANVAS_PRESET,
  DEFAULT_SKETCH_TITLE,
  isSketchCanvasPreset,
  SKETCH_DOCUMENT_SCHEMA_VERSION,
  type SketchCanvasPreset,
  type SketchDocument,
  type SketchDocumentSummary,
  type SketchEvent,
  type StoredSketchDocument,
} from '../src/domain/sketch'

const SKETCH_DIRECTORY_NAME = 'sketches'
const SKETCH_ID_PATTERN = /^sketch_[a-zA-Z0-9_-]+$/

export type CreateSketchDocumentPayload = {
  title?: string
  canvasPreset?: SketchCanvasPreset
}

export function getSketchesDirectory(journalDirectory: string) {
  return path.join(journalDirectory, SKETCH_DIRECTORY_NAME)
}

export async function listSketchDocuments(journalDirectory: string): Promise<SketchDocumentSummary[]> {
  const directory = getSketchesDirectory(journalDirectory)
  const fileNames = await readdir(directory).catch((error: unknown) => {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return []
    }

    throw error
  })
  const summaries = await Promise.all(
    fileNames
      .filter((fileName) => /^sketch_[a-zA-Z0-9_-]+\.json$/.test(fileName))
      .map(async (fileName) => {
        const filePath = path.join(directory, fileName)
        const document = await readSketchDocumentFile(filePath).catch(() => null)

        if (!document) {
          return null
        }

        return createSketchDocumentSummary(document, fileName, filePath)
      }),
  )

  return summaries
    .filter((summary): summary is SketchDocumentSummary => summary !== null)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export async function createSketchDocument(
  journalDirectory: string,
  payload: unknown = {},
  now = new Date(),
): Promise<StoredSketchDocument> {
  const directory = getSketchesDirectory(journalDirectory)
  const createdAt = now.toISOString()
  const createPayload = normalizeCreateSketchDocumentPayload(payload)
  const canvasPreset = createPayload.canvasPreset ?? DEFAULT_SKETCH_CANVAS_PRESET
  const document: SketchDocument = {
    schemaVersion: SKETCH_DOCUMENT_SCHEMA_VERSION,
    id: createSketchDocumentId(now),
    title: normalizeSketchTitle(createPayload.title),
    createdAt,
    updatedAt: createdAt,
    canvas: createSketchCanvas(canvasPreset),
    events: [],
  }

  await mkdir(directory, { recursive: true })
  await writeSketchDocumentFile(path.join(directory, `${document.id}.json`), document)

  return withStoredSketchDocumentFields(document, directory)
}

function normalizeCreateSketchDocumentPayload(payload: unknown): CreateSketchDocumentPayload {
  if (!isRecord(payload)) {
    return {}
  }

  return {
    title: typeof payload.title === 'string' ? payload.title : undefined,
    canvasPreset: isSketchCanvasPreset(payload.canvasPreset) ? payload.canvasPreset : undefined,
  }
}

export async function loadSketchDocument(
  journalDirectory: string,
  id: unknown,
): Promise<StoredSketchDocument> {
  assertSketchId(id)

  const directory = getSketchesDirectory(journalDirectory)
  const document = await readSketchDocumentFile(path.join(directory, `${id}.json`))

  return withStoredSketchDocumentFields(document, directory)
}

export async function saveSketchDocument(
  journalDirectory: string,
  payload: unknown,
  now = new Date(),
): Promise<StoredSketchDocument> {
  const document = normalizeSketchDocument(payload, now.toISOString())
  const directory = getSketchesDirectory(journalDirectory)

  await mkdir(directory, { recursive: true })
  await writeSketchDocumentFile(path.join(directory, `${document.id}.json`), document)

  return withStoredSketchDocumentFields(document, directory)
}

export async function importSketchDocumentFromPath(
  journalDirectory: string,
  sourcePath: unknown,
  now = new Date(),
): Promise<StoredSketchDocument> {
  if (typeof sourcePath !== 'string' || path.extname(sourcePath).toLowerCase() !== '.json') {
    throw new TypeError('Sketch import path must point to a JSON file.')
  }

  const sourceDocument = await readSketchDocumentFile(sourcePath)
  const importedAt = now.toISOString()
  const importedDocument: SketchDocument = {
    ...sourceDocument,
    id: createSketchDocumentId(now),
    updatedAt: importedAt,
  }
  const directory = getSketchesDirectory(journalDirectory)

  await mkdir(directory, { recursive: true })
  await writeSketchDocumentFile(path.join(directory, `${importedDocument.id}.json`), importedDocument)

  return withStoredSketchDocumentFields(importedDocument, directory)
}

export async function deleteSketchDocument(journalDirectory: string, id: unknown) {
  assertSketchId(id)

  const filePath = path.join(getSketchesDirectory(journalDirectory), `${id}.json`)

  await unlink(filePath).catch((error: unknown) => {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return
    }

    throw error
  })

  return { id }
}

function createSketchDocumentId(now: Date) {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14)

  return `sketch_${stamp}_${randomUUID().slice(0, 8)}`
}

function createSketchDocumentSummary(
  document: SketchDocument,
  fileName: string,
  filePath: string,
): SketchDocumentSummary {
  return {
    id: document.id,
    title: document.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    canvas: document.canvas,
    eventCount: document.events.length,
    fileName,
    filePath,
  }
}

function withStoredSketchDocumentFields(
  document: SketchDocument,
  directory: string,
): StoredSketchDocument {
  const fileName = `${document.id}.json`

  return {
    ...document,
    fileName,
    filePath: path.join(directory, fileName),
  }
}

async function readSketchDocumentFile(filePath: string): Promise<SketchDocument> {
  const content = await readFile(filePath, 'utf8')
  const document = normalizeSketchDocument(JSON.parse(content))

  await stat(filePath)

  return document
}

async function writeSketchDocumentFile(filePath: string, document: SketchDocument) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`

  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

function normalizeSketchDocument(payload: unknown, updatedAt?: string): SketchDocument {
  if (!isRecord(payload)) {
    throw new TypeError('Sketch document must be an object.')
  }

  assertSketchId(payload.id)

  if (payload.schemaVersion !== SKETCH_DOCUMENT_SCHEMA_VERSION) {
    throw new TypeError('Unsupported sketch document schema version.')
  }

  const canvas = normalizeSketchCanvas(payload.canvas)
  const events = normalizeSketchEvents(payload.events)
  const createdAt = normalizeIsoDate(payload.createdAt, 'createdAt')

  return {
    schemaVersion: SKETCH_DOCUMENT_SCHEMA_VERSION,
    id: payload.id,
    title: normalizeSketchTitle(payload.title),
    createdAt,
    updatedAt: updatedAt ?? normalizeIsoDate(payload.updatedAt, 'updatedAt'),
    canvas,
    events,
  }
}

function normalizeSketchCanvas(value: unknown) {
  if (!isRecord(value) || !isSketchCanvasPreset(value.preset)) {
    throw new TypeError('Sketch canvas preset is invalid.')
  }

  const presetCanvas = createSketchCanvas(value.preset)

  return {
    preset: presetCanvas.preset,
    width: presetCanvas.width,
    height: presetCanvas.height,
  }
}

function normalizeSketchEvents(value: unknown): SketchEvent[] {
  if (!Array.isArray(value) || !value.every(isSketchEventLike)) {
    throw new TypeError('Sketch document events are invalid.')
  }

  return value as SketchEvent[]
}

function isSketchEventLike(value: unknown) {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.at !== 'number') {
    return false
  }

  if (value.type === 'undo' || value.type === 'redo' || value.type === 'clear') {
    return true
  }

  if (value.type === 'stroke:end') {
    return typeof value.strokeId === 'string'
  }

  if (value.type === 'stroke:start') {
    return (
      typeof value.strokeId === 'string' &&
      (value.tool === 'pencil' || value.tool === 'eraser') &&
      typeof value.color === 'string' &&
      typeof value.size === 'number' &&
      isSketchPointLike(value.point)
    )
  }

  if (value.type === 'stroke:point') {
    return typeof value.strokeId === 'string' && isSketchPointLike(value.point)
  }

  return false
}

function isSketchPointLike(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.t === 'number' &&
    (typeof value.pressure === 'number' || value.pressure === undefined)
  )
}

function normalizeSketchTitle(value: unknown) {
  const title = typeof value === 'string' ? value.trim() : ''

  return title.length > 0 ? title.slice(0, 80) : DEFAULT_SKETCH_TITLE
}

function normalizeIsoDate(value: unknown, field: string) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`Sketch document ${field} must be an ISO date.`)
  }

  return value
}

function assertSketchId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !SKETCH_ID_PATTERN.test(value)) {
    throw new TypeError('Sketch id is invalid.')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error
}
