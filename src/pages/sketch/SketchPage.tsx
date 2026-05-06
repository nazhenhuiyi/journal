import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { motion } from 'motion/react'
import { useSearchParams } from 'react-router'
import {
  BookOpen,
  Eraser,
  PenLine,
  Play,
  Redo,
  Trash,
  Undo,
} from '../../components/HandDrawnIcons'
import {
  createReplayTimeline,
  createSketchCanvas,
  fitSketchCanvasDisplay,
  renderSketch,
  setupCanvasDpi,
  SKETCH_CANVAS_PRESETS,
  SketchPlaybackCanvas,
  useSketchSession,
  type SketchCanvasPreset,
  type SketchEvent,
  type SketchPoint,
  type SketchTool,
} from '../../domain/sketch'
import { panelTransition } from '../markdown-preview/constants'

const pencilColors = ['#2f261f', '#2459bc', '#14724f', '#df6246', '#e96b98', '#7a4f32']
const pointStep = 2.2

function SketchPage() {
  const {
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
    canUndo,
    canRedo,
  } = useSketchSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const canvas = currentDocument?.canvas ?? createSketchCanvas()
  const timeline = useMemo(() => createReplayTimeline(state.events), [state.events])
  const [activeTool, setActiveTool] = useState<SketchTool>('pencil')
  const [pencilSize, setPencilSize] = useState(4)
  const [eraserSize, setEraserSize] = useState(24)
  const [color, setColor] = useState(pencilColors[0])
  const [isReplayMode, setIsReplayMode] = useState(false)
  const [isLoadMenuOpen, setIsLoadMenuOpen] = useState(false)
  const [isLoadMenuRefreshing, setIsLoadMenuRefreshing] = useState(false)
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false)
  const [replayKey, setReplayKey] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loadMenuRef = useRef<HTMLDivElement>(null)
  const createMenuRef = useRef<HTMLDivElement>(null)
  const drawingStrokeIdRef = useRef<string | null>(null)
  const eventIdRef = useRef(0)
  const lastPointRef = useRef<SketchPoint | null>(null)
  const shortcutStateRef = useRef({
    canRedo: false,
    canUndo: false,
    hasCurrentDocument: false,
  })
  const toolSize = activeTool === 'pencil' ? pencilSize : eraserSize
  const displaySize = useMemo(() => fitSketchCanvasDisplay(canvas), [canvas])
  const hasEvents = state.events.length > 0
  const canChangeCanvasPreset = !hasEvents

  useEffect(() => {
    const sketchCanvas = canvasRef.current

    if (!sketchCanvas || isReplayMode) {
      return
    }

    const context = setupCanvasDpi(
      sketchCanvas,
      canvas.width,
      canvas.height,
      displaySize.width,
      displaySize.height,
    )

    if (!context) {
      return
    }

    renderSketch(context, state, canvas.width, canvas.height)
  }, [canvas, displaySize, isReplayMode, state])

  useLayoutEffect(() => {
    shortcutStateRef.current = {
      canRedo,
      canUndo,
      hasCurrentDocument: Boolean(currentDocument),
    }
  }, [canRedo, canUndo, currentDocument])

  useEffect(() => {
    if (searchParams.get('replay') !== '1' || timeline.steps.length === 0) {
      return
    }

    const timeout = window.setTimeout(() => {
      setIsReplayMode(true)
      setReplayKey((currentKey) => currentKey + 1)
      setSearchParams({}, { replace: true })
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [searchParams, setSearchParams, timeline.steps.length])

  useEffect(() => {
    if (!isLoadMenuOpen && !isCreateMenuOpen) {
      return
    }

    function closeTopbarMenus(event: Event) {
      if (
        loadMenuRef.current?.contains(event.target as Node) ||
        createMenuRef.current?.contains(event.target as Node)
      ) {
        return
      }

      setIsLoadMenuOpen(false)
      setIsCreateMenuOpen(false)
    }

    window.addEventListener('pointerdown', closeTopbarMenus)

    return () => window.removeEventListener('pointerdown', closeTopbarMenus)
  }, [isCreateMenuOpen, isLoadMenuOpen])

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if (!shortcutStateRef.current.hasCurrentDocument || isEditableShortcutTarget(event.target)) {
        return
      }

      const key = event.key.toLowerCase()
      const isModifierPressed = event.metaKey || event.ctrlKey
      const shouldUndo = isModifierPressed && key === 'z' && !event.shiftKey
      const shouldRedo =
        isModifierPressed && ((key === 'z' && event.shiftKey) || (!event.metaKey && key === 'y'))

      if (shouldUndo && shortcutStateRef.current.canUndo) {
        event.preventDefault()
        setIsReplayMode(false)
        eventIdRef.current += 1
        dispatchSketchEvent({
          type: 'undo',
          id: `event-${eventIdRef.current}`,
          at: Math.round(performance.now()),
        })
        return
      }

      if (shouldRedo && shortcutStateRef.current.canRedo) {
        event.preventDefault()
        setIsReplayMode(false)
        eventIdRef.current += 1
        dispatchSketchEvent({
          type: 'redo',
          id: `event-${eventIdRef.current}`,
          at: Math.round(performance.now()),
        })
      }
    }

    document.addEventListener('keydown', handleKeyboardShortcut)

    return () => document.removeEventListener('keydown', handleKeyboardShortcut)
  }, [dispatchSketchEvent])

  function nextEventId(prefix: string) {
    eventIdRef.current += 1
    return `${prefix}-${eventIdRef.current}`
  }

  function eventTime() {
    return Math.round(performance.now())
  }

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): SketchPoint {
    const eventCanvas = event.currentTarget
    const rect = eventCanvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height

    return {
      x: clamp(x, 0, canvas.width),
      y: clamp(y, 0, canvas.height),
      t: eventTime(),
      pressure: event.pressure > 0 ? event.pressure : 0.5,
    }
  }

  function emit(event: SketchEvent) {
    dispatchSketchEvent(event)
  }

  function beginStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || !currentDocument) {
      return
    }

    const point = pointFromEvent(event)
    const strokeId = nextEventId('stroke')
    drawingStrokeIdRef.current = strokeId
    lastPointRef.current = point
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsReplayMode(false)
    emit({
      type: 'stroke:start',
      id: nextEventId('event'),
      at: point.t,
      strokeId,
      tool: activeTool,
      color,
      size: toolSize,
      point,
    })
  }

  function continueStroke(event: PointerEvent<HTMLCanvasElement>) {
    const strokeId = drawingStrokeIdRef.current

    if (!strokeId) {
      return
    }

    const point = pointFromEvent(event)
    const lastPoint = lastPointRef.current

    if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < pointStep) {
      return
    }

    lastPointRef.current = point
    emit({
      type: 'stroke:point',
      id: nextEventId('event'),
      at: point.t,
      strokeId,
      point,
    })
  }

  function endStroke(event: PointerEvent<HTMLCanvasElement>) {
    const strokeId = drawingStrokeIdRef.current

    if (!strokeId) {
      return
    }

    drawingStrokeIdRef.current = null
    lastPointRef.current = null
    emit({
      type: 'stroke:end',
      id: nextEventId('event'),
      at: eventTime(),
      strokeId,
    })

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function emitHistoryEvent(type: 'undo' | 'redo') {
    setIsReplayMode(false)
    emit({
      type,
      id: nextEventId('event'),
      at: eventTime(),
    })
  }

  function startReplay() {
    if (timeline.steps.length === 0) {
      return
    }

    setIsReplayMode(true)
    setReplayKey((currentKey) => currentKey + 1)
  }

  function handleTitleBlur(title: string) {
    if (!currentDocument || title === currentDocument.title) {
      return
    }

    renameCurrentSketch(title)
  }

  async function openLoadMenu() {
    setIsCreateMenuOpen(false)
    setIsLoadMenuOpen((isOpen) => !isOpen)

    if (isLoadMenuOpen) {
      return
    }

    setIsLoadMenuRefreshing(true)
    await refreshSketchList().finally(() => setIsLoadMenuRefreshing(false))
  }

  async function chooseSketch(id: string) {
    setIsLoadMenuOpen(false)
    await selectSketch(id)
  }

  function openCreateMenu() {
    setIsLoadMenuOpen(false)
    setIsCreateMenuOpen((isOpen) => !isOpen)
  }

  async function chooseNewSketchPreset(preset: SketchCanvasPreset) {
    setIsCreateMenuOpen(false)
    await createSketch({ canvasPreset: preset })
  }

  return (
    <>
      <motion.header
        animate={{ opacity: 1, y: 0 }}
        className="journal-topbar sketch-topbar is-file-only"
        initial={{ opacity: 0, y: -8 }}
        transition={{ ...panelTransition, delay: 0.05 }}
      >
        <div aria-label="画作文件" className="sketch-document-card">
          <div className="sketch-document-summary">
            <label>
              <span>画作</span>
              <input
                aria-label="随画标题"
                className="sketch-title-input"
                defaultValue={currentDocument?.title ?? ''}
                disabled={!currentDocument}
                key={currentDocument?.id ?? 'empty-title'}
                onBlur={(event) => handleTitleBlur(event.target.value)}
                placeholder="未命名随画"
              />
            </label>
            <small>
              {status === 'saving' ? '保存中' : status === 'loading' ? '加载中' : '已保存'}
              {' · '}
              {state.events.length} 个事件
            </small>
          </div>
          <div className="sketch-document-controls">
            <div className="sketch-load-menu" ref={loadMenuRef}>
              <button
                aria-expanded={isLoadMenuOpen}
                aria-haspopup="listbox"
                onClick={() => void openLoadMenu()}
                type="button"
              >
                <BookOpen aria-hidden="true" size={18} />
                <span>加载</span>
              </button>
              {isLoadMenuOpen ? (
                <div aria-label="已有随画" className="sketch-load-menu-list" role="listbox">
                  {isLoadMenuRefreshing ? (
                    <span className="sketch-load-menu-empty">读取中</span>
                  ) : documents.length > 0 ? (
                    documents.map((document) => (
                      <button
                        aria-selected={document.id === currentDocument?.id}
                        key={document.id}
                        onClick={() => void chooseSketch(document.id)}
                        role="option"
                        type="button"
                      >
                        <strong>{document.title}</strong>
                        <small>
                          {document.eventCount} 个事件 ·{' '}
                          {SKETCH_CANVAS_PRESETS.find((preset) => preset.preset === document.canvas.preset)?.label ?? '3:2 横版'}
                        </small>
                      </button>
                    ))
                  ) : (
                    <span className="sketch-load-menu-empty">还没有画作</span>
                  )}
                </div>
              ) : null}
            </div>
            <label>
              <span>比例</span>
              <select
                aria-label="选择画布比例"
                disabled={!currentDocument || !canChangeCanvasPreset}
                onChange={(event) => setCurrentCanvasPreset(event.target.value as SketchCanvasPreset)}
                value={canvas.preset}
              >
                {SKETCH_CANVAS_PRESETS.map((preset) => (
                  <option key={preset.preset} value={preset.preset}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="sketch-create-control" ref={createMenuRef}>
              <button
                aria-expanded={isCreateMenuOpen}
                aria-haspopup="listbox"
                onClick={openCreateMenu}
                type="button"
              >
                <PenLine aria-hidden="true" size={18} />
                <span>新建</span>
              </button>
              {isCreateMenuOpen ? (
                <div aria-label="新建画作比例" className="sketch-create-menu-list" role="listbox">
                  {SKETCH_CANVAS_PRESETS.map((preset) => (
                    <button
                      key={preset.preset}
                      onClick={() => void chooseNewSketchPreset(preset.preset)}
                      role="option"
                      type="button"
                    >
                      <strong>{preset.label}</strong>
                      <small>{preset.description}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button className="is-danger" disabled={!currentDocument} onClick={() => void deleteCurrentSketch()} type="button">
              <Trash aria-hidden="true" size={18} />
              <span>删除</span>
            </button>
          </div>
        </div>
      </motion.header>

      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="sketch-page"
        initial={{ opacity: 0, y: 10 }}
        transition={{ ...panelTransition, delay: 0.08 }}
      >
        <aside aria-label="画板工具" className="sketch-toolbar">
          <div className="sketch-tool-group">
            <p>工具</p>
            <div className="sketch-tool-buttons" role="group">
              <button
                aria-pressed={activeTool === 'pencil'}
                className={activeTool === 'pencil' ? 'is-active' : ''}
                onClick={() => setActiveTool('pencil')}
                title="铅笔"
                type="button"
              >
                <PenLine aria-hidden="true" size={20} />
                <span>铅笔</span>
              </button>
              <button
                aria-pressed={activeTool === 'eraser'}
                className={activeTool === 'eraser' ? 'is-active' : ''}
                onClick={() => setActiveTool('eraser')}
                title="橡皮"
                type="button"
              >
                <Eraser aria-hidden="true" size={20} />
                <span>橡皮</span>
              </button>
            </div>
          </div>

          {error ? <span className="sketch-error">{error}</span> : null}

          <div className="sketch-tool-group">
            <p>颜色</p>
            <div aria-label="笔的颜色" className="sketch-color-grid" role="group">
              {pencilColors.map((pencilColor) => (
                <button
                  aria-label={`选择颜色 ${pencilColor}`}
                  aria-pressed={color === pencilColor}
                  className={color === pencilColor ? 'is-active' : ''}
                  key={pencilColor}
                  onClick={() => {
                    setColor(pencilColor)
                    setActiveTool('pencil')
                  }}
                  style={{ backgroundColor: pencilColor }}
                  title={pencilColor}
                  type="button"
                />
              ))}
            </div>
          </div>

          <label className="sketch-range">
            <span>笔粗 {pencilSize}px</span>
            <input
              max="18"
              min="2"
              onChange={(event) => setPencilSize(Number(event.target.value))}
              type="range"
              value={pencilSize}
            />
          </label>

          <label className="sketch-range">
            <span>橡皮 {eraserSize}px</span>
            <input
              max="72"
              min="8"
              onChange={(event) => setEraserSize(Number(event.target.value))}
              type="range"
              value={eraserSize}
            />
          </label>

          <div className="sketch-tool-group">
            <p>历史</p>
            <div className="sketch-icon-row">
              <button aria-label="撤销" disabled={!canUndo} onClick={() => emitHistoryEvent('undo')} type="button">
                <Undo aria-hidden="true" size={20} />
              </button>
              <button aria-label="重做" disabled={!canRedo} onClick={() => emitHistoryEvent('redo')} type="button">
                <Redo aria-hidden="true" size={20} />
              </button>
              <button
                aria-label="重置画布"
                disabled={!hasEvents}
                onClick={() => {
                  setIsReplayMode(false)
                  resetSketch()
                }}
                type="button"
              >
                <Trash aria-hidden="true" size={20} />
              </button>
            </div>
          </div>

          <div className="sketch-tool-group">
            <p>过程</p>
            <div className="sketch-playback-actions">
              <button disabled={timeline.steps.length === 0} onClick={startReplay} type="button">
                <Play aria-hidden="true" size={20} />
                <span>播放</span>
              </button>
              <button disabled={timeline.steps.length === 0} onClick={startReplay} type="button">
                <BookOpen aria-hidden="true" size={20} />
                <span>重播</span>
              </button>
            </div>
          </div>
        </aside>

        <section aria-label={isReplayMode ? '过程回放画布' : '绘画画布'} className="sketch-stage">
          {isReplayMode ? (
            <>
              <SketchPlaybackCanvas
                autoPlay
                canvas={canvas}
                events={state.events}
                key={`${currentDocument?.id ?? 'empty'}-${replayKey}`}
              />
              <button className="sketch-return-button" onClick={() => setIsReplayMode(false)} type="button">
                回到画布
              </button>
            </>
          ) : (
            <div
              className="sketch-playback-canvas"
              style={
                {
                  '--sketch-display-width': `${displaySize.width}px`,
                  '--sketch-display-height': `${displaySize.height}px`,
                } as CSSProperties
              }
            >
              <div className="sketch-paper-frame">
                <canvas
                  aria-label="涂鸦画布"
                  className="sketch-canvas"
                  height={canvas.height}
                  onPointerCancel={endStroke}
                  onPointerDown={beginStroke}
                  onPointerLeave={endStroke}
                  onPointerMove={continueStroke}
                  onPointerUp={endStroke}
                  ref={canvasRef}
                  width={canvas.width}
                />
              </div>
              <div className="sketch-stage-footer">
                <span>{canChangeCanvasPreset ? '空白画布可以切换比例' : '每一笔会悄悄记录成回放'}</span>
              </div>
            </div>
          )}
        </section>
      </motion.section>
    </>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export default SketchPage
