import tokens from '../tokens.json'

type PrimitiveColors = typeof tokens.primitive
type SemanticTokenMap = typeof tokens.semantic
type LegacyTokenMap = typeof tokens.legacy
type RadiusTokenMap = typeof tokens.radius
type SpacingTokenMap = typeof tokens.spacing
type PrimitiveFamily = keyof PrimitiveColors
type PrimitiveShade<TFamily extends PrimitiveFamily = PrimitiveFamily> = keyof PrimitiveColors[TFamily]

type ResolvedSemanticColors = {
  [Key in keyof SemanticTokenMap]: string
}

type ResolvedLegacyColors = {
  [Key in keyof LegacyTokenMap]: string
}

type PixelTokenMap<TTokens extends Record<string, string>> = {
  [Key in keyof TTokens]: number
}

type TailwindColors = PrimitiveColors & ResolvedSemanticColors & ResolvedLegacyColors

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

export const primitiveColors = tokens.primitive
export const semanticColors = resolveTokenMap(tokens.semantic)
export const legacyColors = resolveTokenMap(tokens.legacy)
export const radiusTokens = tokens.radius
export const spacingTokens = tokens.spacing
export const radiusPixels = resolvePixelTokenMap(tokens.radius)
export const spacingPixels = resolvePixelTokenMap(tokens.spacing)
export const tailwindColors = {
  ...primitiveColors,
  ...semanticColors,
  ...legacyColors,
} as TailwindColors

export type {
  PrimitiveColors,
  PixelTokenMap,
  RadiusTokenMap,
  ResolvedLegacyColors,
  ResolvedSemanticColors,
  SpacingTokenMap,
  TailwindColors,
}
