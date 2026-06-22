import tokens from '../tokens.json'

type PrimitiveColors = typeof tokens.primitive
type SemanticTokenMap = typeof tokens.semantic
type SemanticColorScheme = 'light' | 'dark'
type RadiusTokenMap = typeof tokens.radius
type SpacingTokenMap = typeof tokens.spacing
type PrimitiveFamily = keyof PrimitiveColors
type PrimitiveShade<TFamily extends PrimitiveFamily = PrimitiveFamily> = keyof PrimitiveColors[TFamily]

type ResolvedSemanticColors = {
  [Key in keyof SemanticTokenMap]: string
}

type PixelTokenMap<TTokens extends Record<string, string>> = {
  [Key in keyof TTokens]: number
}

type TailwindColors = PrimitiveColors & ResolvedSemanticColors
type NativeWindColorVariables = Record<`--color-${string}`, string>

function isPrimitiveReference(value: string): value is `{${PrimitiveFamily}.${string}}` {
  return /^\{[a-z]+?\.\d+?\}$/.test(value)
}

function resolveTokenValue(value: string) {
  if (!isPrimitiveReference(value)) {
    return value
  }

  const [family, shade] = value.slice(1, -1).split('.') as [PrimitiveFamily, PrimitiveShade]
  const color = tokens.primitive[family]?.[shade]

  if (!color) {
    throw new Error(`Unknown theme token reference: ${value}`)
  }

  return color
}

function resolveTokenMap<TTokens extends Record<string, string>>(tokenMap: TTokens) {
  return Object.fromEntries(
    Object.entries(tokenMap).map(([name, value]) => [name, resolveTokenValue(value)]),
  ) as { [Key in keyof TTokens]: string }
}

function toPixels(value: string) {
  if (value.endsWith('rem')) {
    return Number(value.slice(0, -3)) * 16
  }

  if (value.endsWith('px')) {
    return Number(value.slice(0, -2))
  }

  throw new Error(`Unsupported layout token unit: ${value}`)
}

function resolvePixelTokenMap<TTokens extends Record<string, string>>(tokenMap: TTokens) {
  return Object.fromEntries(
    Object.entries(tokenMap).map(([name, value]) => [name, toPixels(value)]),
  ) as PixelTokenMap<TTokens>
}

function hexToRgbChannels(value: string) {
  const hex = value.trim()
  const normalized = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex

  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Unsupported NativeWind color value: ${value}`)
  }

  const red = Number.parseInt(normalized.slice(1, 3), 16)
  const green = Number.parseInt(normalized.slice(3, 5), 16)
  const blue = Number.parseInt(normalized.slice(5, 7), 16)

  return `${red} ${green} ${blue}`
}

function createNativeWindColorVariables(colors: ResolvedSemanticColors) {
  return Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [`--color-${name}`, hexToRgbChannels(value)]),
  ) as NativeWindColorVariables
}

export const primitiveColors = tokens.primitive
export const semanticColors = resolveTokenMap(tokens.semantic)
export const semanticColorSchemes = {
  light: semanticColors,
  dark: resolveTokenMap(tokens.semanticDark),
} satisfies Record<SemanticColorScheme, ResolvedSemanticColors>
export const radiusTokens = tokens.radius
export const spacingTokens = tokens.spacing
export const radiusPixels = resolvePixelTokenMap(tokens.radius)
export const spacingPixels = resolvePixelTokenMap(tokens.spacing)
export const nativeWindColorVariables = {
  light: createNativeWindColorVariables(semanticColorSchemes.light),
  dark: createNativeWindColorVariables(semanticColorSchemes.dark),
} satisfies Record<SemanticColorScheme, NativeWindColorVariables>
export const tailwindColors = {
  ...primitiveColors,
  ...semanticColors,
} as TailwindColors

export function getSemanticColors(scheme: SemanticColorScheme) {
  return semanticColorSchemes[scheme]
}

export function getNativeWindColorVariables(scheme: SemanticColorScheme) {
  return nativeWindColorVariables[scheme]
}

export type {
  NativeWindColorVariables,
  PrimitiveColors,
  PixelTokenMap,
  RadiusTokenMap,
  ResolvedSemanticColors,
  SemanticColorScheme,
  SpacingTokenMap,
  TailwindColors,
}
