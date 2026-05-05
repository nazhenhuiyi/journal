import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SketchPlaybackCanvas } from '../SketchPlaybackCanvas'
import { createSketchCanvas } from '../document'
import type { SketchEvent } from '../types'

const events: SketchEvent[] = [
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
  {
    type: 'stroke:end',
    id: 'event-2',
    at: 24,
    strokeId: 'stroke-1',
  },
]

describe('SketchPlaybackCanvas', () => {
  it('enables playback controls when events exist', () => {
    render(<SketchPlaybackCanvas canvas={createSketchCanvas()} events={events} />)

    expect(screen.getByLabelText('随画回放画布')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /播放/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /重播/ })).toBeEnabled()
  })

  it('disables playback controls for empty sketches', () => {
    render(<SketchPlaybackCanvas canvas={createSketchCanvas()} events={[]} />)

    expect(screen.getAllByText('空白画纸')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /播放/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /重播/ })).toBeDisabled()
  })
})
