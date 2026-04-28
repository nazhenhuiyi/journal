import { describe, expect, it } from 'vitest'
import { createReplayTimeline } from '../timeline'
import type { SketchEvent } from '../types'

describe('createReplayTimeline', () => {
  it('keeps short intervals and compresses long pauses', () => {
    const events: SketchEvent[] = [
      { type: 'clear', id: 'event-1', at: 0 },
      { type: 'clear', id: 'event-2', at: 120 },
      { type: 'clear', id: 'event-3', at: 2_120 },
      { type: 'clear', id: 'event-4', at: 2_260 },
    ]

    const timeline = createReplayTimeline(events)

    expect(timeline.steps.map((step) => step.delay)).toEqual([0, 120, 180, 140])
    expect(timeline.originalDuration).toBe(2_260)
    expect(timeline.replayDuration).toBe(440)
    expect(timeline.replayDuration).toBeLessThan(timeline.originalDuration)
  })
})
