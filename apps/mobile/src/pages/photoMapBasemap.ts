import type { SemanticColorScheme } from '@journal/theme'

export const openFreeMapStyleUrls: Record<SemanticColorScheme, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
}

export function getOpenFreeMapStyleUrl(scheme: SemanticColorScheme) {
  return openFreeMapStyleUrls[scheme]
}
