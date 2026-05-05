import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSketchDocument,
  deleteSketchDocument,
  getSketchesDirectory,
  importSketchDocumentFromPath,
  listSketchDocuments,
  loadSketchDocument,
  saveSketchDocument,
} from './sketchStore'

const temporaryDirectories: string[] = []

async function createTemporaryJournalDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'journal-sketches-'))

  temporaryDirectories.push(directory)

  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('sketch store', () => {
  it('creates, lists, loads, saves, and deletes sketch documents', async () => {
    const journalDirectory = await createTemporaryJournalDirectory()
    const created = await createSketchDocument(
      journalDirectory,
      { title: ' 午后线条 ', canvasPreset: 'square-1-1' },
      new Date('2026-05-05T08:00:00.000Z'),
    )

    expect(created.title).toBe('午后线条')
    expect(created.canvas).toMatchObject({ preset: 'square-1-1', width: 560, height: 560 })
    await expect(readFile(created.filePath, 'utf8')).resolves.toContain('"schemaVersion": 1')

    const listed = await listSketchDocuments(journalDirectory)

    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      id: created.id,
      title: '午后线条',
      eventCount: 0,
    })

    const loaded = await loadSketchDocument(journalDirectory, created.id)

    expect(loaded.id).toBe(created.id)

    const saved = await saveSketchDocument(
      journalDirectory,
      {
        ...loaded,
        title: '更新后的随画',
        events: [
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
          { type: 'stroke:end', id: 'event-2', at: 12, strokeId: 'stroke-1' },
        ],
      },
      new Date('2026-05-05T09:00:00.000Z'),
    )

    expect(saved.title).toBe('更新后的随画')
    expect(saved.updatedAt).toBe('2026-05-05T09:00:00.000Z')
    expect(saved.events).toHaveLength(2)

    await deleteSketchDocument(journalDirectory, created.id)

    await expect(listSketchDocuments(journalDirectory)).resolves.toEqual([])
  })

  it('rejects invalid ids and never resolves paths outside sketches', async () => {
    const journalDirectory = await createTemporaryJournalDirectory()

    await expect(loadSketchDocument(journalDirectory, '../2026-05-05')).rejects.toThrow(
      'Sketch id is invalid.',
    )
    await expect(deleteSketchDocument(journalDirectory, 'sketch_../oops')).rejects.toThrow(
      'Sketch id is invalid.',
    )
  })

  it('skips broken documents while listing and rejects broken loads', async () => {
    const journalDirectory = await createTemporaryJournalDirectory()
    const sketchesDirectory = getSketchesDirectory(journalDirectory)

    await createSketchDocument(journalDirectory, {}, new Date('2026-05-05T08:00:00.000Z'))
    await mkdir(sketchesDirectory, { recursive: true })
    await writeFile(path.join(sketchesDirectory, 'sketch_broken.json'), '{broken', 'utf8')

    await expect(listSketchDocuments(journalDirectory)).resolves.toHaveLength(1)
    await expect(loadSketchDocument(journalDirectory, 'sketch_broken')).rejects.toThrow()
  })

  it('imports a historical sketch json into the sketch library', async () => {
    const journalDirectory = await createTemporaryJournalDirectory()
    const sourceDirectory = await createTemporaryJournalDirectory()
    const sourcePath = path.join(sourceDirectory, 'old-sketch.json')
    const sourceDocument = {
      schemaVersion: 1,
      id: 'sketch_old',
      title: '旧画布',
      createdAt: '2026-05-01T08:00:00.000Z',
      updatedAt: '2026-05-01T09:00:00.000Z',
      canvas: {
        preset: 'classic-4-3',
        width: 640,
        height: 480,
      },
      events: [{ type: 'clear', id: 'event-1', at: 0 }],
    }

    await writeFile(sourcePath, `${JSON.stringify(sourceDocument)}\n`, 'utf8')

    const imported = await importSketchDocumentFromPath(
      journalDirectory,
      sourcePath,
      new Date('2026-05-05T10:00:00.000Z'),
    )

    expect(imported.id).not.toBe('sketch_old')
    expect(imported.title).toBe('旧画布')
    expect(imported.canvas.preset).toBe('classic-4-3')
    expect(imported.events).toHaveLength(1)
    expect(imported.filePath).toContain(getSketchesDirectory(journalDirectory))
    await expect(listSketchDocuments(journalDirectory)).resolves.toHaveLength(1)
  })
})
