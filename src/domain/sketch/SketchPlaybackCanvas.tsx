import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BookOpen, Pause, Play } from '../../components/HandDrawnIcons'
import { fitSketchCanvasDisplay, type SketchCanvas } from './document'
import { deriveSketchState } from './reducer'
import { createReplayTimeline } from './timeline'
import type { SketchEvent } from './types'
import { renderSketch, setupCanvasDpi } from './drawing'

type SketchPlaybackCanvasProps = {
  events: SketchEvent[]
  canvas: SketchCanvas
  autoPlay?: boolean
  controls?: boolean
  className?: string
  maxDisplayWidth?: number
  maxDisplayHeight?: number
  label?: string
  emptyLabel?: string
}

export function SketchPlaybackCanvas({
  events,
  canvas,
  autoPlay = false,
  controls = true,
  className = '',
  maxDisplayWidth = 930,
  maxDisplayHeight = 620,
  label = '随画回放画布',
  emptyLabel = '空白画纸',
}: SketchPlaybackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timeline = useMemo(() => createReplayTimeline(events), [events])
  const [replayIndex, setReplayIndex] = useState(() => (autoPlay ? 0 : timeline.steps.length))
  const [isPlaybackRequested, setIsPlaybackRequested] = useState(autoPlay)
  const [hasStartedPlayback, setHasStartedPlayback] = useState(autoPlay)
  const safeReplayIndex = Math.min(replayIndex, timeline.steps.length)
  const isPlaying =
    isPlaybackRequested && timeline.steps.length > 0 && safeReplayIndex < timeline.steps.length
  const displaySize = useMemo(
    () => fitSketchCanvasDisplay(canvas, maxDisplayWidth, maxDisplayHeight),
    [canvas, maxDisplayHeight, maxDisplayWidth],
  )
  const replayEvents = useMemo(
    () => timeline.steps.slice(0, safeReplayIndex).map((step) => step.event),
    [safeReplayIndex, timeline.steps],
  )
  const visibleState = useMemo(
    () =>
      deriveSketchState(
        !hasStartedPlayback || (safeReplayIndex >= timeline.steps.length && !isPlaying)
          ? events
          : replayEvents,
      ),
    [events, hasStartedPlayback, isPlaying, replayEvents, safeReplayIndex, timeline.steps.length],
  )

  useEffect(() => {
    const sketchCanvas = canvasRef.current

    if (!sketchCanvas) {
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

    renderSketch(context, visibleState, canvas.width, canvas.height)
  }, [canvas, displaySize, visibleState])

  useEffect(() => {
    if (!isPlaying) {
      return
    }

    const timeout = window.setTimeout(
      () => setReplayIndex((currentIndex) => currentIndex + 1),
      timeline.steps[safeReplayIndex]?.delay ?? 0,
    )

    return () => window.clearTimeout(timeout)
  }, [isPlaying, safeReplayIndex, timeline.steps])

  function togglePlayback() {
    if (timeline.steps.length === 0) {
      return
    }

    if (replayIndex >= timeline.steps.length) {
      setReplayIndex(0)
    }

    setHasStartedPlayback(true)
    setIsPlaybackRequested((currentValue) => !currentValue)
  }

  function restartPlayback() {
    if (timeline.steps.length === 0) {
      return
    }

    setReplayIndex(0)
    setHasStartedPlayback(true)
    setIsPlaybackRequested(true)
  }

  return (
    <div
      className={['sketch-playback-canvas', className].filter(Boolean).join(' ')}
      style={
        {
          '--sketch-display-width': `${displaySize.width}px`,
          '--sketch-display-height': `${displaySize.height}px`,
        } as CSSProperties
      }
    >
      <div className="sketch-paper-frame">
        <canvas
          aria-label={label}
          className="sketch-canvas"
          height={canvas.height}
          ref={canvasRef}
          width={canvas.width}
        />
        {events.length === 0 ? <span className="sketch-empty-label">{emptyLabel}</span> : null}
      </div>

      {controls ? (
        <div className="sketch-stage-footer">
          <span>
            {timeline.steps.length > 0
              ? `回放进度 ${safeReplayIndex} / ${timeline.steps.length}`
              : emptyLabel}
          </span>
          <div className="sketch-stage-controls">
            <button disabled={timeline.steps.length === 0} onClick={togglePlayback} type="button">
              {isPlaying ? <Pause aria-hidden="true" size={20} /> : <Play aria-hidden="true" size={20} />}
              <span>{isPlaying ? '暂停' : '播放'}</span>
            </button>
            <button disabled={timeline.steps.length === 0} onClick={restartPlayback} type="button">
              <BookOpen aria-hidden="true" size={20} />
              <span>重播</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
