import type { SketchEvent } from './types'

export type ReplayStep = {
  event: SketchEvent
  delay: number
  elapsed: number
}

export type ReplayTimeline = {
  steps: ReplayStep[]
  originalDuration: number
  replayDuration: number
}

const DEFAULT_LONG_GAP = 800
const DEFAULT_MAX_COMPRESSED_GAP = 180

export function createReplayTimeline(
  events: SketchEvent[],
  options: { longGap?: number; maxCompressedGap?: number } = {},
): ReplayTimeline {
  const longGap = options.longGap ?? DEFAULT_LONG_GAP
  const maxCompressedGap = options.maxCompressedGap ?? DEFAULT_MAX_COMPRESSED_GAP
  const sortedEvents = [...events].sort((left, right) => left.at - right.at)

  if (sortedEvents.length === 0) {
    return {
      steps: [],
      originalDuration: 0,
      replayDuration: 0,
    }
  }

  let elapsed = 0
  const steps = sortedEvents.map((event, index) => {
    const previousEvent = sortedEvents[index - 1]
    const rawDelay = previousEvent ? Math.max(0, event.at - previousEvent.at) : 0
    const delay = rawDelay > longGap ? maxCompressedGap : rawDelay
    elapsed += delay

    return {
      event,
      delay,
      elapsed,
    }
  })

  return {
    steps,
    originalDuration: sortedEvents[sortedEvents.length - 1].at - sortedEvents[0].at,
    replayDuration: elapsed,
  }
}

export function formatSketchDuration(duration: number): string {
  const safeDuration = Math.max(0, Math.round(duration))

  if (safeDuration < 1000) {
    return `${safeDuration}ms`
  }

  const seconds = Math.round(safeDuration / 100) / 10

  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)

  return `${minutes}m ${remainingSeconds}s`
}

