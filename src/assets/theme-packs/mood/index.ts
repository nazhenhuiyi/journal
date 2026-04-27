import moodPackManifest from './mood-pack.json'
import moodPackPreviewImage from './mood-pack-preview.png'
import quiet01Image from './quiet/quiet-01.png'
import quiet02Image from './quiet/quiet-02.png'
import quiet03Image from './quiet/quiet-03.png'
import quiet04Image from './quiet/quiet-04.png'
import happy01Image from './happy/happy-01.png'
import happy02Image from './happy/happy-02.png'
import happy03Image from './happy/happy-03.png'
import happy04Image from './happy/happy-04.png'
import low01Image from './low/low-01.png'
import low02Image from './low/low-02.png'
import low03Image from './low/low-03.png'
import low04Image from './low/low-04.png'
import missing01Image from './missing/missing-01.png'
import missing02Image from './missing/missing-02.png'
import missing03Image from './missing/missing-03.png'
import missing04Image from './missing/missing-04.png'
import inspired01Image from './inspired/inspired-01.png'
import inspired02Image from './inspired/inspired-02.png'
import inspired03Image from './inspired/inspired-03.png'
import inspired04Image from './inspired/inspired-04.png'
import tired01Image from './tired/tired-01.png'
import tired02Image from './tired/tired-02.png'
import tired03Image from './tired/tired-03.png'
import tired04Image from './tired/tired-04.png'

const moodImages = {
  'mood.quiet-01': quiet01Image,
  'mood.quiet-02': quiet02Image,
  'mood.quiet-03': quiet03Image,
  'mood.quiet-04': quiet04Image,
  'mood.happy-01': happy01Image,
  'mood.happy-02': happy02Image,
  'mood.happy-03': happy03Image,
  'mood.happy-04': happy04Image,
  'mood.low-01': low01Image,
  'mood.low-02': low02Image,
  'mood.low-03': low03Image,
  'mood.low-04': low04Image,
  'mood.missing-01': missing01Image,
  'mood.missing-02': missing02Image,
  'mood.missing-03': missing03Image,
  'mood.missing-04': missing04Image,
  'mood.inspired-01': inspired01Image,
  'mood.inspired-02': inspired02Image,
  'mood.inspired-03': inspired03Image,
  'mood.inspired-04': inspired04Image,
  'mood.tired-01': tired01Image,
  'mood.tired-02': tired02Image,
  'mood.tired-03': tired03Image,
  'mood.tired-04': tired04Image,
} as const

export const moodPack = {
  ...moodPackManifest,
  previewImage: moodPackPreviewImage,
  items: moodPackManifest.items.map((item) => ({
    ...item,
    image: moodImages[item.id as keyof typeof moodImages],
  })),
}

export type MoodPack = typeof moodPack
export type MoodPackItem = MoodPack['items'][number]
