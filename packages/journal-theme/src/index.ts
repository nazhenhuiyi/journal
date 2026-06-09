import tokens from '../tokens.json'

type PrimitiveColors = typeof tokens.primitive
type SemanticTokenMap = typeof tokens.semantic
type LegacyTokenMap = typeof tokens.legacy
type PrimitiveFamily = keyof PrimitiveColors
type PrimitiveShade<TFamily extends PrimitiveFamily = PrimitiveFamily> = keyof PrimitiveColors[TFamily]

type ResolvedSemanticColors = {
  [Key in keyof SemanticTokenMap]: string
}

type ResolvedLegacyColors = {
  [Key in keyof LegacyTokenMap]: string
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

export const primitiveColors = tokens.primitive
export const semanticColors = resolveTokenMap(tokens.semantic)
export const legacyColors = resolveTokenMap(tokens.legacy)
export const tailwindColors = {
  ...primitiveColors,
  ...semanticColors,
  ...legacyColors,
} as TailwindColors

export type {
  PrimitiveColors,
  ResolvedLegacyColors,
  ResolvedSemanticColors,
  TailwindColors,
}
