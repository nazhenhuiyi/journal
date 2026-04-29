import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { motion } from 'motion/react'
import { useSearchParams } from 'react-router'
import {
  BookOpen,
  Eraser,
  Pause,
  PenLine,
  Play,
  Redo,
  Trash,
  Undo,
} from '../../components/HandDrawnIcons'
import {
  createReplayTimeline,
  deriveSketchState,
  formatSketchDuration,
  renderSketch,
  setupCanvasDpi,
  SKETCH_CANVAS_HEIGHT,
  SKETCH_CANVAS_WIDTH,
  useSketchSession,
  type SketchEvent,
  type SketchPoint,
  type SketchTool,
} from '../../domain/sketch'
import { panelTransition } from '../markdown-preview/constants'

const pencilColors = ['#2f261f', '#2459bc', '#14724f', '#df6246', '#e96b98', '#7a4f32']
const pointStep = 2.2

function SketchPage() {
  const { state, dispatchSketchEvent, canUndo, canRedo } = useSketchSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const timeline = useMemo(() => createReplayTimeline(state.events), [state.events])
  const shouldStartReplayFromQuery = searchParams.get('replay') === '1' && timeline.steps.length > 0
  const [activeTool, setActiveTool] = useState<SketchTool>('pencil')
  const [pencilSize, setPencilSize] = useState(4)
  const [eraserSize, setEraserSize] = useState(24)
  const [color, setColor] = useState(pencilColors[0])
  const [isReplayMode, setIsReplayMode] = useState(() => shouldStartReplayFromQuery)
  const [isReplayPlaybackRequested, setIsReplayPlaybackRequested] = useState(
    () => shouldStartReplayFromQuery,
  )
  const [replayIndex, setReplayIndex] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingStrokeIdRef = useRef<string | null>(null)
  const eventIdRef = useRef(0)
  const lastPointRef = useRef<SketchPoint | null>(null)
  const isReplayPlaying =
    isReplayPlaybackRequested && timeline.steps.length > 0 && replayIndex < timeline.steps.length
  const replayEvents = useMemo(
    () => timeline.steps.slice(0, replayIndex).map((step) => step.event),
    [replayIndex, timeline.steps],
  )
  const replayState = useMemo(() => deriveSketchState(replayEvents), [replayEvents])
  const visibleState = isReplayMode ? replayState : state
  const toolSize = activeTool === 'pencil' ? pencilSize : eraserSize

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const context = setupCanvasDpi(canvas, SKETCH_CANVAS_WIDTH, SKETCH_CANVAS_HEIGHT)

    if (!context) {
      return
    }

    renderSketch(context, visibleState, SKETCH_CANVAS_WIDTH, SKETCH_CANVAS_HEIGHT)
  }, [visibleState])

  useEffect(() => {
    if (!isReplayPlaying) {
      return
    }

    const timeout = window.setTimeout(
      () => setReplayIndex((currentIndex) => currentIndex + 1),
      timeline.steps[replayIndex]?.delay ?? 0,
    )

    return () => window.clearTimeout(timeout)
  }, [isReplayPlaying, replayIndex, timeline.steps])

  useEffect(() => {
    if (searchParams.get('replay') !== '1' || timeline.steps.length === 0) {
      return
    }

    const timeout = window.setTimeout(() => {
      setIsReplayMode(true)
      setReplayIndex(0)
      setIsReplayPlaybackRequested(true)
      setSearchParams({}, { replace: true })
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [searchParams, setSearchParams, timeline.steps.length])

  function nextEventId(prefix: string) {
    eventIdRef.current += 1
    return `${prefix}-${eventIdRef.current}`
  }

  function eventTime() {
    return Math.round(performance.now())
  }

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): SketchPoint {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * SKETCH_CANVAS_WIDTH
    const y = ((event.clientY - rect.top) / rect.height) * SKETCH_CANVAS_HEIGHT

    return {
      x: clamp(x, 0, SKETCH_CANVAS_WIDTH),
      y: clamp(y, 0, SKETCH_CANVAS_HEIGHT),
      t: eventTime(),
      pressure: event.pressure > 0 ? event.pressure : 0.5,
    }
  }

  function emit(event: SketchEvent) {
    dispatchSketchEvent(event)
  }

  function beginStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) {
      return
    }

    const point = pointFromEvent(event)
    const strokeId = nextEventId('stroke')
    drawingStrokeIdRef.current = strokeId
    lastPointRef.current = point
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsReplayMode(false)
    setIsReplayPlaybackRequested(false)
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

  function emitHistoryEvent(type: 'undo' | 'redo' | 'clear') {
    setIsReplayMode(false)
    setIsReplayPlaybackRequested(false)
    emit({
      type,
      id: nextEventId('event'),
      at: eventTime(),
    })
  }

  function toggleReplay() {
    if (timeline.steps.length === 0) {
      return
    }

    setIsReplayMode(true)

    if (replayIndex >= timeline.steps.length) {
      setReplayIndex(0)
    }

    setIsReplayPlaybackRequested(!isReplayPlaying)
  }

  function restartReplay() {
    if (timeline.steps.length === 0) {
      return
    }

    setIsReplayMode(true)
    setReplayIndex(0)
    setIsReplayPlaybackRequested(true)
  }

  return (
    <>
      <motion.header
        animate={{ opacity: 1, y: 0 }}
        className="journal-topbar sketch-topbar"
        initial={{ opacity: 0, y: -8 }}
        transition={{ ...panelTransition, delay: 0.05 }}
      >
        <div>
          <p>简易画板</p>
          <h1>今天的涂鸦过程</h1>
        </div>
        <div aria-label="画作状态" className="sketch-stats" role="status">
          <span>{state.events.length} 个事件</span>
          <span>原始 {formatSketchDuration(timeline.originalDuration)}</span>
          <span>回放 {formatSketchDuration(timeline.replayDuration)}</span>
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
                aria-label="清空画布"
                disabled={state.strokes.length === 0}
                onClick={() => emitHistoryEvent('clear')}
                type="button"
              >
                <Trash aria-hidden="true" size={20} />
              </button>
            </div>
          </div>

          <div className="sketch-tool-group">
            <p>过程</p>
            <div className="sketch-playback-actions">
              <button disabled={timeline.steps.length === 0} onClick={toggleReplay} type="button">
                {isReplayPlaying ? <Pause aria-hidden="true" size={20} /> : <Play aria-hidden="true" size={20} />}
                <span>{isReplayPlaying ? '暂停' : '播放'}</span>
              </button>
              <button disabled={timeline.steps.length === 0} onClick={restartReplay} type="button">
                <BookOpen aria-hidden="true" size={20} />
                <span>重播</span>
              </button>
            </div>
          </div>
        </aside>

        <section aria-label={isReplayMode ? '过程回放画布' : '绘画画布'} className="sketch-stage">
          <div className="sketch-paper-frame">
            <canvas
              aria-label="涂鸦画布"
              className="sketch-canvas"
              height={SKETCH_CANVAS_HEIGHT}
              onPointerCancel={endStroke}
              onPointerDown={beginStroke}
              onPointerLeave={endStroke}
              onPointerMove={continueStroke}
              onPointerUp={endStroke}
              ref={canvasRef}
              width={SKETCH_CANVAS_WIDTH}
            />
          </div>
          <div className="sketch-stage-footer">
            <span>{isReplayMode ? `回放进度 ${Math.min(replayIndex, timeline.steps.length)} / ${timeline.steps.length}` : '铅笔线条会记录为可回放事件'}</span>
            {isReplayMode ? (
              <button onClick={() => setIsReplayMode(false)} type="button">
                回到画布
              </button>
            ) : null}
          </div>
        </section>
      </motion.section>
    </>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export default SketchPage
