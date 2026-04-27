import moodAnimalPackManifest from './mood-animal-pack.json'
import moodAnimalPackPreviewImage from './mood-animal-pack-preview.png'
import quietDeerImage from './quiet/quiet-deer.png'
import quietElephantImage from './quiet/quiet-elephant.png'
import quietRabbitImage from './quiet/quiet-rabbit.png'
import quietBearImage from './quiet/quiet-bear.png'
import happyDeerImage from './happy/happy-deer.png'
import happyElephantImage from './happy/happy-elephant.png'
import happyRabbitImage from './happy/happy-rabbit.png'
import happyBearImage from './happy/happy-bear.png'
import lowDeerImage from './low/low-deer.png'
import lowElephantImage from './low/low-elephant.png'
import lowRabbitImage from './low/low-rabbit.png'
import lowBearImage from './low/low-bear.png'
import missingDeerImage from './missing/missing-deer.png'
import missingElephantImage from './missing/missing-elephant.png'
import missingRabbitImage from './missing/missing-rabbit.png'
import missingBearImage from './missing/missing-bear.png'
import inspiredDeerImage from './inspired/inspired-deer.png'
import inspiredElephantImage from './inspired/inspired-elephant.png'
import inspiredRabbitImage from './inspired/inspired-rabbit.png'
import inspiredBearImage from './inspired/inspired-bear.png'
import tiredDeerImage from './tired/tired-deer.png'
import tiredElephantImage from './tired/tired-elephant.png'
import tiredRabbitImage from './tired/tired-rabbit.png'
import tiredBearImage from './tired/tired-bear.png'

const moodAnimalImages = {
  'moodAnimal.quiet-deer': quietDeerImage,
  'moodAnimal.quiet-elephant': quietElephantImage,
  'moodAnimal.quiet-rabbit': quietRabbitImage,
  'moodAnimal.quiet-bear': quietBearImage,
  'moodAnimal.happy-deer': happyDeerImage,
  'moodAnimal.happy-elephant': happyElephantImage,
  'moodAnimal.happy-rabbit': happyRabbitImage,
  'moodAnimal.happy-bear': happyBearImage,
  'moodAnimal.low-deer': lowDeerImage,
  'moodAnimal.low-elephant': lowElephantImage,
  'moodAnimal.low-rabbit': lowRabbitImage,
  'moodAnimal.low-bear': lowBearImage,
  'moodAnimal.missing-deer': missingDeerImage,
  'moodAnimal.missing-elephant': missingElephantImage,
  'moodAnimal.missing-rabbit': missingRabbitImage,
  'moodAnimal.missing-bear': missingBearImage,
  'moodAnimal.inspired-deer': inspiredDeerImage,
  'moodAnimal.inspired-elephant': inspiredElephantImage,
  'moodAnimal.inspired-rabbit': inspiredRabbitImage,
  'moodAnimal.inspired-bear': inspiredBearImage,
  'moodAnimal.tired-deer': tiredDeerImage,
  'moodAnimal.tired-elephant': tiredElephantImage,
  'moodAnimal.tired-rabbit': tiredRabbitImage,
  'moodAnimal.tired-bear': tiredBearImage,
} as const

export const moodAnimalPack = {
  ...moodAnimalPackManifest,
  previewImage: moodAnimalPackPreviewImage,
  items: moodAnimalPackManifest.items.map((item) => ({
    ...item,
    image: moodAnimalImages[item.id as keyof typeof moodAnimalImages],
  })),
}

export type MoodAnimalPack = typeof moodAnimalPack
export type MoodAnimalPackItem = MoodAnimalPack['items'][number]
