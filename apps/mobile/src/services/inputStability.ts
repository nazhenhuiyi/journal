export type BackgroundSyncInputState = {
  isFocused: boolean
  lastEditedAt: number
  now: number
  stableWindowMs: number
}

export function shouldDeferBackgroundSyncForInput({
  isFocused,
  lastEditedAt,
  now,
  stableWindowMs,
}: BackgroundSyncInputState) {
  return isFocused || (lastEditedAt > 0 && now - lastEditedAt < stableWindowMs)
}
