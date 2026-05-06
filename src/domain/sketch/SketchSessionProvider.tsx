import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  createInitialSketchState,
  deriveSketchState,
  sketchReducer,
} from './reducer'
import { SketchSessionContext, type SketchSessionContextValue } from './sessionContext'
import { createReplayTimeline } from './timeline'
import type { SketchEvent, SketchState } from './types'
import {
  createSketchCanvas,
  DEFAULT_SKETCH_CANVAS_PRESET,
  DEFAULT_SKETCH_TITLE,
  SKETCH_DOCUMENT_SCHEMA_VERSION,
  type SketchCanvasPreset,
  type SketchDocument,
  type SketchDocumentSummary,
  type StoredSketchDocument,
} from './document'

const AUTOSAVE_DELAY = 360

export function SketchSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SketchState>(() => createInitialSketchState())
  const [currentDocument, setCurrentDocument] = useState<StoredSketchDocument | null>(null)
  const [documents, setDocuments] = useState<SketchDocumentSummary[]>([])
  const [status, setStatus] = useState<SketchSessionContextValue['status']>('loading')
  const [error, setError] = useState<string | null>(null)
  const didInitializeRef = useRef(false)
  const saveTimeoutRef = useRef<number | null>(null)
  const saveVersionRef = useRef(0)
  const timeline = useMemo(() => createReplayTimeline(state.events), [state.events])

  const applyDocument = useCallback((document: StoredSketchDocument) => {
    setCurrentDocument(document)
    setState(deriveSketchState(document.events))
  }, [])

  const upsertDocumentSummary = useCallback((document: StoredSketchDocument) => {
    setDocuments((currentDocuments) => {
      const nextSummary = createSketchDocumentSummary(document)
      const remainingDocuments = currentDocuments.filter((summary) => summary.id !== document.id)

      return [nextSummary, ...remainingDocuments].sort(
        (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      )
    })
  }, [])

  const saveDocument = useCallback(
    (document: StoredSketchDocument) => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current)
      }

      const saveVersion = saveVersionRef.current + 1
      saveVersionRef.current = saveVersion
      setStatus('saving')
      saveTimeoutRef.current = window.setTimeout(async () => {
        try {
          const savedDocument = window.sketchStore
            ? await window.sketchStore.save(stripStoredSketchDocumentFields(document))
            : saveSketchDocumentInMemory(document)

          if (saveVersionRef.current !== saveVersion) {
            return
          }

          setCurrentDocument(savedDocument)
          upsertDocumentSummary(savedDocument)
          setStatus('ready')
          setError(null)
        } catch (saveError) {
          if (saveVersionRef.current !== saveVersion) {
            return
          }

          setStatus('error')
          setError(saveError instanceof Error ? saveError.message : '保存随画失败')
        }
      }, AUTOSAVE_DELAY)
    },
    [upsertDocumentSummary],
  )

  useEffect(() => {
    if (didInitializeRef.current) {
      return
    }

    didInitializeRef.current = true

    let isCancelled = false

    async function initialize() {
      try {
        setStatus('loading')

        if (!window.sketchStore) {
          const fallbackDocument = createFallbackStoredSketchDocument()

          if (!isCancelled) {
            setDocuments([createSketchDocumentSummary(fallbackDocument)])
            applyDocument(fallbackDocument)
            setStatus('ready')
          }

          return
        }

        const sketchDocuments = await window.sketchStore.list()
        const document =
          sketchDocuments.length > 0
            ? await window.sketchStore.load(sketchDocuments[0].id)
            : await window.sketchStore.create({
                title: DEFAULT_SKETCH_TITLE,
                canvasPreset: DEFAULT_SKETCH_CANVAS_PRESET,
              })

        if (!isCancelled) {
          setDocuments(
            sketchDocuments.length > 0
              ? sketchDocuments
              : [createSketchDocumentSummary(document)],
          )
          applyDocument(document)
          setStatus('ready')
          setError(null)
        }
      } catch (loadError) {
        if (!isCancelled) {
          setStatus('error')
          setError(loadError instanceof Error ? loadError.message : '加载随画失败')
        }
      }
    }

    void initialize()

    return () => {
      isCancelled = true

      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [applyDocument])

  const updateDocumentWithState = useCallback(
    (nextState: SketchState, updates: Partial<StoredSketchDocument> = {}) => {
      setCurrentDocument((document) => {
        if (!document) {
          return document
        }

        const nextDocument: StoredSketchDocument = {
          ...document,
          ...updates,
          events: nextState.events,
          updatedAt: new Date().toISOString(),
        }

        saveDocument(nextDocument)

        return nextDocument
      })
    },
    [saveDocument],
  )

  const dispatchSketchEvent = useCallback(
    (event: SketchEvent) => {
      setState((currentState) => {
        const nextState = sketchReducer(currentState, event)

        updateDocumentWithState(nextState)

        return nextState
      })
    },
    [updateDocumentWithState],
  )

  const resetSketch = useCallback(() => {
    const nextState = createInitialSketchState()

    setState(nextState)
    updateDocumentWithState(nextState)
  }, [updateDocumentWithState])

  const selectSketch = useCallback(
    async (id: string) => {
      setStatus('loading')

      try {
        const document = window.sketchStore
          ? await window.sketchStore.load(id)
          : currentDocument

        if (document) {
          applyDocument(document)
          upsertDocumentSummary(document)
        }

        setStatus('ready')
        setError(null)
      } catch (selectError) {
        setStatus('error')
        setError(selectError instanceof Error ? selectError.message : '切换随画失败')
      }
    },
    [applyDocument, currentDocument, upsertDocumentSummary],
  )

  const createSketch = useCallback(
    async (payload: { title?: string; canvasPreset?: SketchCanvasPreset } = {}) => {
      setStatus('loading')

      try {
        const document = window.sketchStore
          ? await window.sketchStore.create(payload)
          : createFallbackStoredSketchDocument(payload)

        applyDocument(document)
        upsertDocumentSummary(document)
        setStatus('ready')
        setError(null)
      } catch (createError) {
        setStatus('error')
        setError(createError instanceof Error ? createError.message : '新建随画失败')
      }
    },
    [applyDocument, upsertDocumentSummary],
  )

  const refreshSketchList = useCallback(async () => {
    if (!window.sketchStore) {
      const document = currentDocument ?? createFallbackStoredSketchDocument()

      setDocuments([createSketchDocumentSummary(document)])
      if (!currentDocument) {
        applyDocument(document)
      }
      setStatus((currentStatus) => (currentStatus === 'loading' ? 'ready' : currentStatus))
      setError(null)
      return
    }

    try {
      const sketchDocuments = await window.sketchStore.list()

      if (sketchDocuments.length > 0) {
        setDocuments(sketchDocuments)
      } else if (currentDocument) {
        setDocuments([createSketchDocumentSummary(currentDocument)])
      } else {
        const document = await window.sketchStore.create({
          title: DEFAULT_SKETCH_TITLE,
          canvasPreset: DEFAULT_SKETCH_CANVAS_PRESET,
        })

        setDocuments([createSketchDocumentSummary(document)])
        applyDocument(document)
      }

      setStatus((currentStatus) => (currentStatus === 'loading' ? 'ready' : currentStatus))
      setError(null)
    } catch (loadError) {
      setStatus('error')
      setError(loadError instanceof Error ? loadError.message : '刷新随画列表失败')
    }
  }, [applyDocument, currentDocument])

  const deleteCurrentSketch = useCallback(async () => {
    if (!currentDocument) {
      return
    }

    setStatus('loading')

    try {
      if (window.sketchStore) {
        await window.sketchStore.delete(currentDocument.id)
      }

      const remainingDocuments = documents.filter((document) => document.id !== currentDocument.id)
      setDocuments(remainingDocuments)

      if (window.sketchStore && remainingDocuments.length > 0) {
        applyDocument(await window.sketchStore.load(remainingDocuments[0].id))
      } else {
        const replacementDocument = window.sketchStore
          ? await window.sketchStore.create({
              title: DEFAULT_SKETCH_TITLE,
              canvasPreset: DEFAULT_SKETCH_CANVAS_PRESET,
            })
          : createFallbackStoredSketchDocument()

        applyDocument(replacementDocument)
        upsertDocumentSummary(replacementDocument)
      }

      setStatus('ready')
      setError(null)
    } catch (deleteError) {
      setStatus('error')
      setError(deleteError instanceof Error ? deleteError.message : '删除随画失败')
    }
  }, [applyDocument, currentDocument, documents, upsertDocumentSummary])

  const renameCurrentSketch = useCallback(
    (title: string) => {
      if (!currentDocument) {
        return
      }

      const normalizedTitle = title.trim().slice(0, 80) || DEFAULT_SKETCH_TITLE
      const nextDocument: StoredSketchDocument = {
        ...currentDocument,
        title: normalizedTitle,
        updatedAt: new Date().toISOString(),
      }

      setCurrentDocument(nextDocument)
      upsertDocumentSummary(nextDocument)
      saveDocument(nextDocument)
    },
    [currentDocument, saveDocument, upsertDocumentSummary],
  )

  const setCurrentCanvasPreset = useCallback(
    (preset: SketchCanvasPreset) => {
      if (!currentDocument || currentDocument.events.length > 0) {
        return
      }

      const nextDocument: StoredSketchDocument = {
        ...currentDocument,
        canvas: createSketchCanvas(preset),
        updatedAt: new Date().toISOString(),
      }

      setCurrentDocument(nextDocument)
      upsertDocumentSummary(nextDocument)
      saveDocument(nextDocument)
    },
    [currentDocument, saveDocument, upsertDocumentSummary],
  )

  const value = useMemo<SketchSessionContextValue>(
    () => ({
      currentDocument,
      documents,
      status,
      error,
      state,
      dispatchSketchEvent,
      resetSketch,
      selectSketch,
      createSketch,
      refreshSketchList,
      deleteCurrentSketch,
      renameCurrentSketch,
      setCurrentCanvasPreset,
      canUndo: state.strokes.length > 0,
      canRedo: state.undoneStrokes.length > 0,
      eventCount: state.events.length,
      originalDuration: timeline.originalDuration,
      replayDuration: timeline.replayDuration,
    }),
    [
      createSketch,
      currentDocument,
      deleteCurrentSketch,
      dispatchSketchEvent,
      documents,
      error,
      refreshSketchList,
      renameCurrentSketch,
      resetSketch,
      selectSketch,
      setCurrentCanvasPreset,
      state,
      status,
      timeline.originalDuration,
      timeline.replayDuration,
    ],
  )

  return <SketchSessionContext.Provider value={value}>{children}</SketchSessionContext.Provider>
}

function createSketchDocumentSummary(document: StoredSketchDocument): SketchDocumentSummary {
  return {
    id: document.id,
    title: document.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    canvas: document.canvas,
    eventCount: document.events.length,
    fileName: document.fileName,
    filePath: document.filePath,
  }
}

function stripStoredSketchDocumentFields(document: StoredSketchDocument): SketchDocument {
  return {
    schemaVersion: document.schemaVersion,
    id: document.id,
    title: document.title,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    canvas: document.canvas,
    events: document.events,
  }
}

function saveSketchDocumentInMemory(document: StoredSketchDocument): StoredSketchDocument {
  return document
}

function createFallbackStoredSketchDocument(
  payload: { title?: string; canvasPreset?: SketchCanvasPreset } = {},
): StoredSketchDocument {
  const createdAt = new Date().toISOString()
  const id = `sketch_memory_${createdAt.replace(/\D/g, '').slice(0, 14)}`

  return {
    schemaVersion: SKETCH_DOCUMENT_SCHEMA_VERSION,
    id,
    title: payload.title?.trim() || DEFAULT_SKETCH_TITLE,
    createdAt,
    updatedAt: createdAt,
    canvas: createSketchCanvas(payload.canvasPreset ?? DEFAULT_SKETCH_CANVAS_PRESET),
    events: [],
    fileName: `${id}.json`,
    filePath: 'memory://sketch',
  }
}
