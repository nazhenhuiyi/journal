import { describe, expect, it } from 'vitest'
import {
  compareMurmursByNewest,
  orderMurmursByNewest,
  type MurmurBlock,
} from '../index'

describe('murmur ordering', () => {
  it('orders murmurs newest first without mutating the original array', () => {
    const oldMurmur = createMurmur('old', '2026-06-08T08:00:00.000Z')
    const newestMurmur = createMurmur('newest', '2026-06-08T21:00:00.000Z')
    const middleMurmur = createMurmur('middle', '2026-06-08T12:00:00.000Z')
    const murmurs = [oldMurmur, newestMurmur, middleMurmur]

    expect(orderMurmursByNewest(murmurs).map((murmur) => murmur.id)).toEqual([
      'newest',
      'middle',
      'old',
    ])
    expect(murmurs.map((murmur) => murmur.id)).toEqual(['old', 'newest', 'middle'])
  })

  it('places invalid times behind valid times', () => {
    const invalidMurmur = createMurmur('invalid', 'not-a-time')
    const validMurmur = createMurmur('valid', '2026-06-08T08:00:00.000Z')

    expect([invalidMurmur, validMurmur].sort(compareMurmursByNewest)).toEqual([
      validMurmur,
      invalidMurmur,
    ])
  })
})

function createMurmur(id: string, time: string): MurmurBlock {
  return {
    body: id,
    id,
    images: [],
    themes: [],
    time,
  }
}
