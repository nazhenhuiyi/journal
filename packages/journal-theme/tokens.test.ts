import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { radiusPixels, spacingPixels } from './src'
import tokens from './tokens.json'

function cssVarName(name: string) {
  return `--color-${name}`
}

function primitiveCssVarName(family: string, shade: string) {
  return cssVarName(`${family}-${shade}`)
}

function primitiveCssVarReference(reference: string) {
  const [family, shade] = reference.slice(1, -1).split('.')

  return `var(${primitiveCssVarName(family, shade)})`
}

function spacingCssVarName(name: string) {
  return `--space-${name.replace('.', '-')}`
}

describe('theme tokens css', () => {
  it('exposes every primitive color value', async () => {
    const css = await readFile(new URL('./tokens.css', import.meta.url), 'utf8')

    for (const [family, shades] of Object.entries(tokens.primitive)) {
      for (const [shade, color] of Object.entries(shades)) {
        expect(css).toContain(`${primitiveCssVarName(family, shade)}: ${color};`)
      }
    }
  })

  it('exposes every semantic color token', async () => {
    const css = await readFile(new URL('./tokens.css', import.meta.url), 'utf8')

    for (const [name, value] of Object.entries(tokens.semantic)) {
      const cssValue = value.startsWith('{') ? primitiveCssVarReference(value) : value

      expect(css).toContain(`${cssVarName(name)}: ${cssValue};`)
    }
  })

  it('exposes desktop compatibility aliases', async () => {
    const css = await readFile(new URL('./tokens.css', import.meta.url), 'utf8')
    const desktopAliases = ['paper', 'ink', 'sage', 'brass']

    for (const name of desktopAliases) {
      const value = tokens.legacy[name as keyof typeof tokens.legacy]

      expect(css).toContain(`${cssVarName(name)}: ${primitiveCssVarReference(value)};`)
    }
  })

  it('exposes every radius token', async () => {
    const css = await readFile(new URL('./tokens.css', import.meta.url), 'utf8')

    for (const [name, value] of Object.entries(tokens.radius)) {
      expect(css).toContain(`--radius-${name}: ${value};`)
    }
  })

  it('exposes every spacing token', async () => {
    const css = await readFile(new URL('./tokens.css', import.meta.url), 'utf8')

    for (const [name, value] of Object.entries(tokens.spacing)) {
      expect(css).toContain(`${spacingCssVarName(name)}: ${value};`)
    }
  })

  it('exports pixel layout tokens for native surfaces', () => {
    expect(radiusPixels.lg).toBe(10)
    expect(radiusPixels.full).toBe(9999)
    expect(spacingPixels['2.5']).toBe(10)
    expect(spacingPixels['7']).toBe(28)
  })
})
