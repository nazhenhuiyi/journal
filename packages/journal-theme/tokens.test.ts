import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  getNativeWindColorVariables,
  getSemanticColors,
  radiusPixels,
  spacingPixels,
} from './src'
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

function cssTokenValue(value: string) {
  return value.startsWith('{') ? primitiveCssVarReference(value) : value
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
      expect(css).toContain(`${cssVarName(name)}: ${cssTokenValue(value)};`)
    }
  })

  it('exposes every dark semantic color override', async () => {
    const css = await readFile(new URL('./tokens.css', import.meta.url), 'utf8')

    expect(Object.keys(tokens.semanticDark)).toEqual(Object.keys(tokens.semantic))

    for (const [name, value] of Object.entries(tokens.semanticDark)) {
      expect(css).toContain(`${cssVarName(name)}: ${cssTokenValue(value)};`)
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

  it('exports semantic color schemes for native surfaces', () => {
    expect(getSemanticColors('light').background).toBe('#fdfdfd')
    expect(getSemanticColors('dark').background).toBe('#0c0a09')
    expect(getSemanticColors('dark').primary).toBe('#338f84')
  })

  it('exports NativeWind RGB channel variables', () => {
    expect(getNativeWindColorVariables('light')['--color-background']).toBe('253 253 253')
    expect(getNativeWindColorVariables('dark')['--color-background']).toBe('12 10 9')
    expect(getNativeWindColorVariables('dark')['--color-primary']).toBe('51 143 132')
  })

  it('does not expose legacy semantic aliases', async () => {
    const css = await readFile(new URL('./tokens.css', import.meta.url), 'utf8')

    expect(css).not.toMatch(/--color-(paper|ink|sage|brass|canvas|cloud|mossMuted|reed|skyWash|soil):/)
  })
})
