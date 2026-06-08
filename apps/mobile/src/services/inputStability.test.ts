import { describe, expect, it } from 'vitest'
import { shouldDeferBackgroundSyncForInput } from './inputStability'

describe('input stability', () => {
  it('defers background sync while the long-entry input is focused', () => {
    expect(shouldDeferBackgroundSyncForInput({
      isFocused: true,
      lastEditedAt: 1_000,
      now: 10_000,
      stableWindowMs: 5_000,
    })).toBe(true)
  })

  it('defers background sync shortly after long-entry edits', () => {
    expect(shouldDeferBackgroundSyncForInput({
      isFocused: false,
      lastEditedAt: 8_000,
      now: 10_000,
      stableWindowMs: 5_000,
    })).toBe(true)
  })

  it('allows background sync after the input is blurred and stable', () => {
    expect(shouldDeferBackgroundSyncForInput({
      isFocused: false,
      lastEditedAt: 4_000,
      now: 10_000,
      stableWindowMs: 5_000,
    })).toBe(false)
  })

  it('does not treat never-edited input as unstable', () => {
    expect(shouldDeferBackgroundSyncForInput({
      isFocused: false,
      lastEditedAt: 0,
      now: 1_000,
      stableWindowMs: 5_000,
    })).toBe(false)
  })
})
