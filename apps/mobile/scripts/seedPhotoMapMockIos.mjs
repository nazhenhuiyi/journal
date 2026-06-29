#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import zlib from 'node:zlib'

const defaultAppId = 'app.zilin.journal'
const imageWidth = 360
const imageHeight = 260
const crc32Table = Array.from({ length: 256 }, (_, index) => {
  let value = index

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }

  return value >>> 0
})
// Development-only mock photos. Pexels and Unsplash both allow free commercial
// use without attribution; see https://www.pexels.com/license/ and
// https://unsplash.com/license/. The script downloads page og:image assets into
// the simulator data container and falls back to generated PNGs when offline.
const mockPhotoSources = [
  ...[
    'qt3IKanoH50',
    'spVrIDB3kZc',
    'DJmPqsuf400',
    'Z1nEyZFdY8E',
    'vJmu-Z_8usU',
    'xFH5VD9OCUU',
    'SSgqqf2AZz8',
    'H1QSCpTjgSM',
  ].map((id) => ({
    pageUrl: `https://unsplash.com/photos/${id}`,
    provider: 'Unsplash',
  })),
  ...[
    '33692911',
    '33965578',
    '29191587',
    '35629395',
    '29150293',
    '27403197',
    '29191590',
    '28302354',
  ].map((id) => ({
    pageUrl: `https://www.pexels.com/photo/${id}/`,
    provider: 'Pexels',
  })),
]
const mockPhotoPageHeaders = {
  Accept: 'text/html,*/*;q=0.8',
  'User-Agent': 'journal-photo-map-mock/1.0',
}
const mockPhotoImageHeaders = {
  Accept: 'image/jpeg,image/png,*/*;q=0.8',
  'User-Agent': 'journal-photo-map-mock/1.0',
}
const mockPhotoBufferCache = new Map()

const options = parseArgs(process.argv.slice(2))

if (options.help) {
  printUsage()
  process.exit(0)
}

const appContainer = getBootedAppContainer(options.appId)
const worktreeDirectory = path.join(appContainer, 'Documents', 'journal-worktree')
const mediaRoot = path.join(worktreeDirectory, 'media')
const entriesRoot = path.join(worktreeDirectory, 'entries')
const today = options.today || getLocalDateKey(new Date())
const mockDays = createMockDays(today)

assertSafeMockSeedTarget(worktreeDirectory, { force: options.force })
mkdirSync(worktreeDirectory, { recursive: true })

for (const day of mockDays) {
  await writeMockDay(day)
}

console.info(`Seeded ${mockDays.length} photo map mock days into ${worktreeDirectory}`)
console.info(`Date range: ${mockDays[mockDays.length - 1]?.date} -> ${mockDays[0]?.date}`)
console.info('This script did not write E2E runtime config, SecureStore data, or Git remotes.')

async function writeMockDay(day) {
  const [year, month] = day.date.split('-')
  const entryDirectory = path.join(entriesRoot, year, month)
  const entryPath = path.join(entryDirectory, `${day.date}.md`)

  mkdirSync(entryDirectory, { recursive: true })
  backupIfNonMock(entryPath)

  for (const murmur of day.murmurs) {
    for (const image of murmur.images) {
      const mediaDirectory = path.join(mediaRoot, ...image.src.split('/').slice(1, -1))
      const mediaPath = path.join(worktreeDirectory, image.src)

      mkdirSync(mediaDirectory, { recursive: true })
      writeFileSync(mediaPath, await createMockImageBuffer(image))
    }
  }

  writeFileSync(entryPath, serializeDay(day))
}

function backupIfNonMock(entryPath) {
  if (!existsSync(entryPath)) {
    return
  }

  const contents = readFileSync(entryPath, 'utf8')

  if (contents.includes('photoMapMock: true')) {
    return
  }

  const backupPath = `${entryPath}.before-photo-map-mock-${Date.now()}.bak`

  writeFileSync(backupPath, contents)
}

function assertSafeMockSeedTarget(directory, { force }) {
  const targetEntriesRoot = path.join(directory, 'entries')

  if (!existsSync(targetEntriesRoot)) {
    return
  }

  const nonMockEntryPaths = findNonMockEntryPaths(targetEntriesRoot, 5)

  if (nonMockEntryPaths.length === 0) {
    return
  }

  const preview = nonMockEntryPaths
    .map((entryPath) => `  - ${path.relative(directory, entryPath)}`)
    .join('\n')

  if (force) {
    console.warn([
      'Warning: seeding into a simulator that already contains non-mock journal entries.',
      'Target dates will be backed up before overwrite; mock media files may be overwritten.',
      preview,
    ].join('\n'))
    return
  }

  fail([
    'Refusing to seed photo map mock data into a simulator that already contains non-mock journal entries.',
    'Use a clean development simulator, or rerun with --force after confirming this is safe.',
    preview,
  ].join('\n'))
}

function findNonMockEntryPaths(directory, limit) {
  const found = []

  collectNonMockEntryPaths(directory, found, limit)

  return found
}

function collectNonMockEntryPaths(directory, found, limit) {
  if (found.length >= limit) {
    return
  }

  for (const name of readdirSync(directory)) {
    if (found.length >= limit) {
      return
    }

    const entryPath = path.join(directory, name)
    const stats = statSync(entryPath)

    if (stats.isDirectory()) {
      collectNonMockEntryPaths(entryPath, found, limit)
      continue
    }

    if (!name.endsWith('.md')) {
      continue
    }

    const contents = readFileSync(entryPath, 'utf8')

    if (!contents.includes('photoMapMock: true')) {
      found.push(entryPath)
    }
  }
}

function createMockDays(todayKey) {
  const cities = createCities()
  const days = []
  let murmurIndex = 0
  let imageIndex = 0
  let textOnlyMurmurIndex = 0

  for (let weekIndex = 0; weekIndex < cities.length; weekIndex += 1) {
    const city = cities[weekIndex]
    const offsets = [weekIndex * 7, weekIndex * 7 + 2, weekIndex * 7 + 5]

    for (let dayIndex = 0; dayIndex < offsets.length; dayIndex += 1) {
      const date = addDays(todayKey, -offsets[dayIndex])
      const daySequence = weekIndex * offsets.length + dayIndex
      const murmurCount = daySequence < 12 ? 3 : 2
      const murmurs = []

      for (let index = 0; index < murmurCount; index += 1) {
        const point = city.points[(dayIndex * 2 + index) % city.points.length]
        const caseType = murmurIndex % 4
        const imageCount = murmurIndex % 2 === 0 ? 2 : 1
        const murmurId = `pm_${city.id}_${date.replace(/-/g, '')}_${String(index + 1).padStart(2, '0')}`
        const murmurLocation = caseType === 0 || caseType === 1
          ? createLocation(point, 'manual')
          : undefined
        const images = []

        for (let imageOffset = 0; imageOffset < imageCount; imageOffset += 1) {
          const imagePoint = city.points[(dayIndex * 2 + index + imageOffset + 1) % city.points.length]
          const imageId = `img_${city.id}_${String(imageIndex + 1).padStart(3, '0')}`
          const shouldUseImageLocation = caseType === 1 || caseType === 2

          images.push({
            caption: createImageCaption(city, imagePoint, imageOffset),
            id: imageId,
            location: shouldUseImageLocation ? createLocation(imagePoint, 'exif') : undefined,
            palette: createImagePalette(city, imageIndex),
            photoSource: mockPhotoSources[imageIndex % mockPhotoSources.length],
            src: `media/${date.slice(0, 4)}/${date.slice(5, 7)}/${imageId}.png`,
            tags: [city.region, imagePoint.name, '照片地图'],
          })
          imageIndex += 1
        }

        murmurs.push({
          body: createMurmurBody(city, point, daySequence, index, caseType),
          id: murmurId,
          images,
          location: murmurLocation,
          themes: [city.theme, index % 2 === 0 ? 'city-walk' : 'quiet-looking'],
          time: `${date}T${['09:20:00', '14:10:00', '18:35:00'][index] ?? '20:00:00'}${city.tz}`,
        })
        murmurIndex += 1
      }

      if (city.id === 'cd') {
        const textOnlyPoints = getChengduTextOnlyMurmurPoints(dayIndex)

        for (let index = 0; index < textOnlyPoints.length; index += 1) {
          const point = textOnlyPoints[index]
          const sequence = textOnlyMurmurIndex + 1

          murmurs.push({
            body: createTextOnlyMurmurBody(city, point, sequence),
            id: `pm_${city.id}_text_${date.replace(/-/g, '')}_${String(sequence).padStart(2, '0')}`,
            images: [],
            location: createLocation(point, 'manual'),
            themes: [city.theme, 'text-only', 'quiet-looking'],
            time: `${date}T${['11:35:00', '16:45:00', '17:05:00', '17:25:00', '17:45:00'][index] ?? '20:20:00'}${city.tz}`,
          })
          textOnlyMurmurIndex += 1
        }
      }

      days.push({
        city,
        date,
        excerpt: `${city.label}这一日被几句碎碎念和几张照片轻轻钉住，像一条从生活里长出来的四川路线。`,
        longEntry: `${city.label}这一日没有刻意写成游记。我只是把停下来的地方、当时的天气和眼前的颜色留下来，回头再看，才发现它们已经连成一小段路。`,
        murmurs,
        title: `${city.label}的一段路 ${dayIndex + 1}`,
      })
    }
  }

  return days.sort((left, right) => right.date.localeCompare(left.date))
}

function serializeDay(day) {
  return `---
date: ${day.date}
createdAt: ${day.date}T00:00:00.000Z
updatedAt: ${day.date}T20:00:00.000Z
title: ${day.title}
excerpt: ${day.excerpt}
tags: [照片地图, 四川, ${day.city.region}]
photoMapMock: true
location:
  name: ${day.city.label}
  country: ${day.city.country}
---

${day.longEntry}

${day.murmurs.map(serializeMurmur).join('\n\n')}
`
}

function serializeMurmur(murmur) {
  const locationLines = murmur.location
    ? [
        `location: ${murmur.location.name}`,
        `latitude: ${murmur.location.latitude}`,
        `longitude: ${murmur.location.longitude}`,
        `locationSource: ${murmur.location.source}`,
      ]
    : []

  return `:::murmur
id: ${murmur.id}
time: ${murmur.time}
${locationLines.length > 0 ? `${locationLines.join('\n')}\n` : ''}themes: [${murmur.themes.join(', ')}]
---
${murmur.body}

${murmur.images.map(serializeImage).join('\n')}
:::`
}

function serializeImage(image) {
  const locationLines = image.location
    ? [
        `location: ${image.location.name}`,
        `latitude: ${image.location.latitude}`,
        `longitude: ${image.location.longitude}`,
        `locationSource: ${image.location.source}`,
      ]
    : []

  return `::image
id: ${image.id}
src: ${image.src}
caption: ${image.caption}
tags: [${image.tags.join(', ')}]
${locationLines.length > 0 ? `${locationLines.join('\n')}\n` : ''}::`
}

function createCities() {
  return [
    {
      country: 'China',
      id: 'cd',
      label: '成都',
      region: '成都',
      theme: 'teahouse-walk',
      tz: '+08:00',
      points: [
        point('宽窄巷子', 30.6696, 104.0596),
        point('人民公园茶社', 30.6576, 104.0633),
        point('太古里', 30.6532, 104.0818),
        point('东郊记忆', 30.6714, 104.1265),
        point('玉林路', 30.6289, 104.0487),
        point('望江楼公园', 30.6276, 104.0849),
        point('武侯祠锦里', 30.6456, 104.0499),
      ],
      colors: ['#00786f', '#f8f2e4', '#79716b'],
    },
    {
      country: 'China',
      id: 'djy',
      label: '都江堰',
      region: '成都平原',
      theme: 'water-sound',
      tz: '+08:00',
      points: [
        point('南桥', 30.9927, 103.6185),
        point('灌县古城', 30.9875, 103.6144),
        point('离堆公园', 31.0012, 103.6164),
        point('玉垒山步道', 31.0038, 103.6097),
        point('安澜索桥', 31.0089, 103.6182),
        point('水街茶铺', 30.9886, 103.6223),
      ],
      colors: ['#00786f', '#dff3ee', '#79716b'],
    },
    {
      country: 'China',
      id: 'ems',
      label: '峨眉山',
      region: '乐山',
      theme: 'mountain-mist',
      tz: '+08:00',
      points: [
        point('报国寺', 29.5791, 103.4355),
        point('伏虎寺山门', 29.5683, 103.4315),
        point('清音阁', 29.5578, 103.3988),
        point('万年寺', 29.5481, 103.3728),
        point('雷洞坪', 29.5327, 103.3402),
        point('金顶观景台', 29.5257, 103.3338),
      ],
      colors: ['#0f766e', '#f8f2e4', '#365314'],
    },
    {
      country: 'China',
      id: 'yaan',
      label: '雅安',
      region: '雅安',
      theme: 'rain-tea',
      tz: '+08:00',
      points: [
        point('廊桥夜色', 29.9855, 103.0082),
        point('上里古镇', 30.1830, 103.1065),
        point('碧峰峡入口', 30.0717, 103.0876),
        point('蒙顶山茶园', 30.0793, 103.0447),
        point('青衣江边', 29.9826, 103.0020),
        point('多营老街', 29.9922, 102.9475),
      ],
      colors: ['#166534', '#ecfdf5', '#79716b'],
    },
    {
      country: 'China',
      id: 'kangding',
      label: '康定',
      region: '甘孜',
      theme: 'highland-wind',
      tz: '+08:00',
      points: [
        point('折多河边', 30.0508, 101.9635),
        point('跑马山脚', 30.0446, 101.9567),
        point('老城菜市', 30.0526, 101.9649),
        point('木格措湖边', 30.1376, 101.8631),
        point('榆林路口', 30.0390, 101.9620),
        point('新都桥观景台', 30.0419, 101.4957),
      ],
      colors: ['#1d4ed8', '#f8f2e4', '#78716c'],
    },
    {
      country: 'China',
      id: 'langzhong',
      label: '阆中',
      region: '南充',
      theme: 'old-town-river',
      tz: '+08:00',
      points: [
        point('华光楼', 31.5801, 105.9731),
        point('中天楼', 31.5766, 105.9747),
        point('嘉陵江码头', 31.5825, 105.9652),
        point('醋房街', 31.5749, 105.9725),
        point('贡院巷口', 31.5774, 105.9764),
        point('南津关古镇', 31.5689, 105.9530),
      ],
      colors: ['#7c2d12', '#f8f2e4', '#0f766e'],
    },
    {
      country: 'China',
      id: 'leshan',
      label: '乐山',
      region: '乐山',
      theme: 'river-temple',
      tz: '+08:00',
      points: [
        point('张公桥好吃街', 29.5700, 103.7647),
        point('嘉定坊', 29.5524, 103.7735),
        point('岷江边', 29.5481, 103.7709),
        point('乐山大佛游客中心', 29.5476, 103.7742),
        point('苏稽古镇', 29.6043, 103.6747),
        point('上中顺街', 29.5646, 103.7671),
      ],
      colors: ['#c84f31', '#fff7ed', '#00786f'],
    },
    {
      country: 'China',
      id: 'daocheng',
      label: '稻城亚丁',
      region: '甘孜',
      theme: 'snow-line',
      tz: '+08:00',
      points: [
        point('香格里拉镇', 28.5560, 100.3337),
        point('冲古寺', 28.4476, 100.3098),
        point('洛绒牛场', 28.4005, 100.2745),
        point('珍珠海栈道', 28.4537, 100.3007),
        point('仙乃日观景点', 28.4312, 100.2865),
        point('稻城县城', 29.0374, 100.2984),
      ],
      colors: ['#0369a1', '#f8fafc', '#78716c'],
    },
  ]
}

function point(name, latitude, longitude) {
  return { latitude, longitude, name }
}

function getChengduTextOnlyMurmurPoints(dayIndex) {
  const points = [
    point('泡桐树街', 30.6708, 104.0487),
    point('小通巷', 30.6721, 104.0630),
    point('镋钯街', 30.6504, 104.0833),
    point('猛追湾河边', 30.6682, 104.0954),
    point('杜甫草堂竹影', 30.6592, 104.0281),
    point('九眼桥河边', 30.6421, 104.0866),
  ]
  const start = dayIndex * 2

  if (dayIndex === 0) {
    return [
      points[0],
      points[1],
      points[1],
      points[1],
      points[1],
    ]
  }

  if (dayIndex === 1) {
    return [
      points[1],
      points[1],
    ]
  }

  return [
    points[start % points.length],
    points[(start + 1) % points.length],
  ]
}

function createLocation(pointValue, source) {
  return {
    latitude: pointValue.latitude,
    longitude: pointValue.longitude,
    name: pointValue.name,
    source,
  }
}

function createMurmurBody(city, pointValue, daySequence, index, caseType) {
  const textures = [
    '光线贴在建筑边缘，像给这条街留了一层很薄的注脚。',
    '人流没有很急，反而让一些平时会错过的声音浮了出来。',
    '这个地方适合慢一点看，照片只是把那几秒钟暂时按住。',
    '风和路面都有自己的节奏，碎碎念负责把它们记成坐标。',
  ]
  const locationHint = caseType === 3
    ? '这一条当时没有开定位，只记得风从街口慢慢吹过来。'
    : `停在${pointValue.name}的时候，${textures[(daySequence + index) % textures.length]}`

  return `${city.label} · ${locationHint}`
}

function createTextOnlyMurmurBody(city, pointValue, sequence) {
  const observations = [
    '没有拍照，只是在街边多站了一会儿。树影和人声都很轻，适合只留一句话。',
    '这一处更像一个逗号，不需要照片证明，只要把位置钉住就够了。',
    '茶香从门口慢慢散出来，碎碎念比照片更接近当时的速度。',
    '路口的风把声音推得很远，这条只记录坐标和感受。',
  ]

  return `${city.label} · 停在${pointValue.name}的时候，${observations[sequence % observations.length]}`
}

function createImageCaption(city, pointValue, imageOffset) {
  const suffix = imageOffset === 0 ? '第一张线索' : '换一个角度'

  return `${city.label}${pointValue.name}，${suffix}。`
}

function createImagePalette(city, imageIndex) {
  const colors = city.colors
  const rotation = imageIndex % colors.length

  return [
    colors[rotation],
    colors[(rotation + 1) % colors.length],
    colors[(rotation + 2) % colors.length],
  ]
}

async function createMockImageBuffer(image) {
  const downloaded = image.photoSource ? await getMockPhotoBuffer(image.photoSource) : null

  return downloaded ?? createPng(imageWidth, imageHeight, image.palette)
}

async function getMockPhotoBuffer(source) {
  if (mockPhotoBufferCache.has(source.pageUrl)) {
    return mockPhotoBufferCache.get(source.pageUrl)
  }

  const buffer = await downloadMockPhoto(source).catch((error) => {
    console.warn(`Falling back to generated image for ${source.provider} ${source.pageUrl}: ${error.message}`)
    return null
  })

  mockPhotoBufferCache.set(source.pageUrl, buffer)
  return buffer
}

async function downloadMockPhoto(source) {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('global fetch is not available')
  }

  const pageResponse = await fetchWithTimeout(source.pageUrl, mockPhotoPageHeaders)

  if (!pageResponse.ok) {
    throw new Error(`photo page returned HTTP ${pageResponse.status}`)
  }

  const pageHtml = await pageResponse.text()
  const imageUrl = extractOpenGraphImage(pageHtml)

  if (!imageUrl) {
    throw new Error('photo page did not expose og:image')
  }

  const imageResponse = await fetchWithTimeout(normalizeMockImageUrl(imageUrl), mockPhotoImageHeaders)

  if (!imageResponse.ok) {
    throw new Error(`image asset returned HTTP ${imageResponse.status}`)
  }

  const contentType = imageResponse.headers.get('content-type') ?? ''

  if (!contentType.startsWith('image/')) {
    throw new Error(`image asset returned ${contentType || 'unknown content type'}`)
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer())

  if (buffer.byteLength < 1024) {
    throw new Error('downloaded image asset was unexpectedly small')
  }

  return buffer
}

async function fetchWithTimeout(url, headers = mockPhotoPageHeaders) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    return await globalThis.fetch(url, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeMockImageUrl(url) {
  try {
    const parsed = new URL(url)

    if (parsed.hostname.includes('images.unsplash.com')) {
      parsed.searchParams.delete('auto')
      parsed.searchParams.set('fit', 'crop')
      parsed.searchParams.set('fm', 'jpg')
      parsed.searchParams.set('q', '85')
      parsed.searchParams.set('w', '1080')
    }

    return parsed.toString()
  } catch {
    return url
  }
}

function extractOpenGraphImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)

    if (match?.[1]) {
      return decodeHtmlEntities(match[1])
    }
  }

  return null
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function createPng(width, height, palette) {
  const bytesPerPixel = 4
  const rowByteLength = width * bytesPerPixel + 1
  const raw = Buffer.alloc(rowByteLength * height)
  const first = parseHexColor(palette[0])
  const second = parseHexColor(palette[1])
  const third = parseHexColor(palette[2])

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowByteLength

    raw[rowStart] = 0

    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * bytesPerPixel
      const mix = x / Math.max(width - 1, 1)
      const wave = (Math.sin((x + y) / 28) + 1) / 2
      const base = blendColor(first, second, mix)
      const color = blendColor(base, third, wave * 0.28)

      raw[offset] = color[0]
      raw[offset + 1] = color[1]
      raw[offset + 2] = color[2]
      raw[offset + 3] = 255
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createPngChunk('IHDR', Buffer.concat([
      uint32(width),
      uint32(height),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    createPngChunk('IDAT', zlib.deflateSync(raw)),
    createPngChunk('IEND', Buffer.alloc(0)),
  ])
}

function createPngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const crcInput = Buffer.concat([typeBuffer, data])

  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(crcInput)),
  ])
}

function uint32(value) {
  const buffer = Buffer.alloc(4)

  buffer.writeUInt32BE(value >>> 0, 0)
  return buffer
}

function crc32(buffer) {
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function parseHexColor(value) {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ]
}

function blendColor(left, right, amount) {
  return left.map((component, index) => Math.round(component + (right[index] - component) * amount))
}

function getBootedAppContainer(appId) {
  try {
    return execFileSync('xcrun', ['simctl', 'get_app_container', 'booted', appId, 'data'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr)
      : ''

    fail([
      `Could not find a booted iOS simulator data container for ${appId}.`,
      'Open the iOS simulator and install/launch the development build first.',
      stderr.trim(),
    ].filter(Boolean).join('\n'))
  }
}

function parseArgs(args) {
  const parsed = {
    appId: defaultAppId,
    force: false,
    help: false,
    today: '',
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--') {
      continue
    }

    if (arg === '--app-id') {
      parsed.appId = readValue(args, index, arg)
      index += 1
    } else if (arg === '--today') {
      parsed.today = readValue(args, index, arg)
      index += 1
    } else if (arg === '--force') {
      parsed.force = true
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true
    } else {
      fail(`Unknown option: ${arg}`)
    }
  }

  if (parsed.today && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.today)) {
    fail('--today must use YYYY-MM-DD format.')
  }

  return parsed
}

function readValue(args, index, name) {
  const value = args[index + 1]

  if (!value || value.startsWith('--')) {
    fail(`Missing value for ${name}.`)
  }

  return value
}

function getLocalDateKey(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function addDays(dateKey, dayDelta) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  date.setUTCDate(date.getUTCDate() + dayDelta)

  return [
    date.getUTCFullYear(),
    `${date.getUTCMonth() + 1}`.padStart(2, '0'),
    `${date.getUTCDate()}`.padStart(2, '0'),
  ].join('-')
}

function printUsage() {
  console.info(`Usage:
  pnpm --filter @journal/mobile run seed:photo-map-mock:ios -- [--today YYYY-MM-DD] [--app-id ${defaultAppId}] [--force]

Seeds normal iOS simulator journal-worktree data only. It does not configure sync or E2E state.
By default, it refuses to run when the simulator already has non-mock journal entries. Use --force only for a disposable development simulator.`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
