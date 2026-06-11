import type { BuiltInTheme } from './types'

export const BUILT_IN_THEMES: BuiltInTheme[] = [
  {
    id: 'sky-now',
    label: '此刻的天空',
    entrySubtitle: '留一张现在的天',
    inputMode: 'photo',
  },
  {
    id: 'quick-photo',
    label: '随手拍张照',
    entrySubtitle: '看见了就放进来',
    inputMode: 'photo',
  },
  {
    id: 'small-thing',
    label: '记一件小事',
    entrySubtitle: '不用很完整',
    inputMode: 'text',
  },
  {
    id: 'food-today',
    label: '今天吃什么',
    entrySubtitle: '这一口也算今天',
    inputMode: 'mixed',
  },
  {
    id: 'funny-today',
    label: '今天有什么好笑的',
    entrySubtitle: '笑一下也值得留',
    inputMode: 'text',
  },
  {
    id: 'thought-maybe',
    label: '一个想法不一定对',
    entrySubtitle: '先放着，不用判对错',
    inputMode: 'text',
  },
  {
    id: 'shower-thought',
    label: '浴室沉思',
    entrySubtitle: '水声里的念头',
    inputMode: 'text',
  },
  {
    id: 'breathe-moment',
    label: '生活的透气时刻',
    entrySubtitle: '给今天开个小窗',
    inputMode: 'mixed',
  },
  {
    id: 'light-shadow',
    label: '镜头下的光影',
    entrySubtitle: '留住一小块亮处',
    inputMode: 'photo',
  },
  {
    id: 'curious-colors',
    label: '我拍到的奇妙色彩',
    entrySubtitle: '颜色也会记得今天',
    inputMode: 'photo',
  },
  {
    id: 'sunrise-sunset',
    label: '日出日落',
    entrySubtitle: '天色变换的时候',
    inputMode: 'photo',
  },
  {
    id: 'season-report',
    label: '季节情报站',
    entrySubtitle: '一点季节的消息',
    inputMode: 'mixed',
  },
]

const builtInThemeMap = new Map(BUILT_IN_THEMES.map((theme) => [theme.id, theme]))

export function getBuiltInThemeById(themeId: string) {
  return builtInThemeMap.get(themeId)
}

export function getThemeLabel(themeId: string) {
  return getBuiltInThemeById(themeId)?.label ?? themeId
}

export function normalizeThemeIds(themeIds: readonly string[] | undefined) {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const themeId of themeIds ?? []) {
    const value = themeId.trim()

    if (!value || seen.has(value)) {
      continue
    }

    seen.add(value)
    normalized.push(value)
  }

  return normalized
}
