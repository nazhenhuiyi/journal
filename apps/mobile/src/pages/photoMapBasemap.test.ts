import { describe, expect, it } from 'vitest'
import {
  getOpenFreeMapStyleUrl,
  openFreeMapStyleUrls,
} from './photoMapBasemap'

describe('photoMapBasemap', () => {
  it('uses a dark basemap style when the app resolves to dark mode', () => {
    expect(getOpenFreeMapStyleUrl('dark')).toBe('https://tiles.openfreemap.org/styles/dark')
  })

  it('keeps the existing positron basemap for light mode', () => {
    expect(getOpenFreeMapStyleUrl('light')).toBe('https://tiles.openfreemap.org/styles/positron')
    expect(openFreeMapStyleUrls).toEqual({
      dark: 'https://tiles.openfreemap.org/styles/dark',
      light: 'https://tiles.openfreemap.org/styles/positron',
    })
  })
})
