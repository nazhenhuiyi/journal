import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
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
})
