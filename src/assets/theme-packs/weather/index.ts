import weatherPackManifest from './weather-pack.json'
import fogImage from './fog.png'
import rainImage from './rain.png'
import snowImage from './snow.png'
import sunnyImage from './sunny.png'
import thunderImage from './thunder.png'
import weatherPackPreviewImage from './weather-pack-preview.png'
import windImage from './wind.png'

const weatherImages = {
  'weather.fog': fogImage,
  'weather.rain': rainImage,
  'weather.snow': snowImage,
  'weather.sunny': sunnyImage,
  'weather.thunder': thunderImage,
  'weather.wind': windImage,
} as const

export const weatherPack = {
  ...weatherPackManifest,
  previewImage: weatherPackPreviewImage,
  items: weatherPackManifest.items.map((item) => ({
    ...item,
    image: weatherImages[item.id as keyof typeof weatherImages],
  })),
}

export type WeatherPack = typeof weatherPack
export type WeatherPackItem = WeatherPack['items'][number]
