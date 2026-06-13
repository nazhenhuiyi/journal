import type { MurmurBlock } from './types'

export function compareMurmursByNewest(first: MurmurBlock, second: MurmurBlock) {
  return getMurmurSortTime(second) - getMurmurSortTime(first)
}

export function orderMurmursByNewest(murmurs: readonly MurmurBlock[]) {
  return [...murmurs].sort(compareMurmursByNewest)
}

function getMurmurSortTime(murmur: MurmurBlock) {
  const time = new Date(murmur.time).getTime()

  return Number.isNaN(time) ? 0 : time
}
