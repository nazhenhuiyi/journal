#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const defaultAppId = 'app.zilin.journal'
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const mockPhotoAssetDirectory = path.resolve(scriptDirectory, '..', 'assets', 'mock-photos', 'chengdu')
const mockPhotoSources = {
  peopleParkTeahouse: {
    localPath: 'peoples-park-teahouse.jpg',
    pageUrl: 'https://commons.wikimedia.org/wiki/File:Teahouse_in_Peoples_Park_-_Chengdu,_China_-_DSC05353.jpg',
    provider: 'Wikimedia Commons',
  },
  kuanzhaiAlley: {
    localPath: 'kuanzhai-alley.jpg',
    pageUrl: 'https://commons.wikimedia.org/wiki/File:Street_scene_-_Kuanzhai_Alleys_-_Chengdu,_China_-_DSC05311.jpg',
    provider: 'Wikimedia Commons',
  },
  wangjianglouBambooPond: {
    localPath: 'wangjianglou-bamboo-pond.jpg',
    pageUrl: 'https://commons.wikimedia.org/wiki/File:Bamboo_pond_-_Wangjianglou_Park_-_Chengdu,_China_-_DSC06111.jpg',
    provider: 'Wikimedia Commons',
  },
  wangjiangTower: {
    localPath: 'wangjiang-tower.jpg',
    pageUrl: 'https://commons.wikimedia.org/wiki/File:Wangjiang_Tower_-_Wangjianglou_Park_-_Chengdu,_China_-_DSC06034.jpg',
    provider: 'Wikimedia Commons',
  },
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
removeExistingPhotoMapMockData(entriesRoot, worktreeDirectory)

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

function removeExistingPhotoMapMockData(directory, worktreeRoot) {
  if (!existsSync(directory)) {
    return
  }

  for (const entryPath of findPhotoMapMockEntryPaths(directory)) {
    const contents = readFileSync(entryPath, 'utf8')

    for (const mediaPath of extractMediaPaths(contents)) {
      const absoluteMediaPath = path.join(worktreeRoot, mediaPath)

      if (existsSync(absoluteMediaPath)) {
        rmSync(absoluteMediaPath)
      }
    }

    rmSync(entryPath)
  }
}

function findPhotoMapMockEntryPaths(directory) {
  const found = []

  collectPhotoMapMockEntryPaths(directory, found)

  return found
}

function collectPhotoMapMockEntryPaths(directory, found) {
  for (const name of readdirSync(directory)) {
    const entryPath = path.join(directory, name)
    const stats = statSync(entryPath)

    if (stats.isDirectory()) {
      collectPhotoMapMockEntryPaths(entryPath, found)
      continue
    }

    if (!name.endsWith('.md')) {
      continue
    }

    const contents = readFileSync(entryPath, 'utf8')

    if (contents.includes('photoMapMock: true')) {
      found.push(entryPath)
    }
  }
}

function extractMediaPaths(contents) {
  return [...contents.matchAll(/^src:\s+(media\/\S+)/gm)].map((match) => match[1])
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
            photoSource: imagePoint.photoSource,
            src: `media/${date.slice(0, 4)}/${date.slice(5, 7)}/${imageId}.jpg`,
            tags: [city.label, imagePoint.name, '照片地图'],
          })
          imageIndex += 1
        }

        murmurs.push({
          body: createMurmurBody(city, point, daySequence, index, caseType),
          id: murmurId,
          images,
          location: murmurLocation,
          themes: [city.theme, index % 2 === 0 ? '随手记' : '慢慢看'],
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
            themes: [city.theme, '只写一句', '慢慢看'],
            time: `${date}T${['11:35:00', '16:45:00', '17:05:00', '17:25:00', '17:45:00'][index] ?? '20:20:00'}${city.tz}`,
          })
          textOnlyMurmurIndex += 1
        }
      }

      days.push({
        city,
        date,
        excerpt: `${city.label}这一日没有什么大事，只是几句话、几张照片和几个停下来的位置。`,
        longEntry: `${city.label}这一日没有刻意写成游记。我只是把停下来的地方、当时的天气和眼前的颜色留下来。回头再看，才发现这些小事已经替那天留了底。`,
        murmurs,
        title: `${city.label}的一天 ${dayIndex + 1}`,
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
tags: [照片地图, 成都, 日常]
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
      theme: '成都日常',
      tz: '+08:00',
      points: [
        point('人民公园茶社', 30.6576, 104.0633, mockPhotoSources.peopleParkTeahouse),
        point('宽窄巷子灰瓦屋檐', 30.6696, 104.0596, mockPhotoSources.kuanzhaiAlley),
        point('望江楼公园竹影', 30.6276, 104.0849, mockPhotoSources.wangjianglouBambooPond),
        point('望江楼崇丽阁', 30.6272, 104.0857, mockPhotoSources.wangjiangTower),
      ],
    },
  ]
}

function point(name, latitude, longitude, photoSource) {
  return { latitude, longitude, name, photoSource }
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
    '茶水还热着，旁边有人把报纸翻得很慢。',
    '街上的声音不急，刚好可以把一句话写完。',
    '照片只是顺手拍下来的，不好看也没有关系。',
    '那一阵风经过树叶，像是在提醒我可以停一会儿。',
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
  const suffix = imageOffset === 0 ? '顺手拍下的一张' : '换一个角度'

  return `${city.label} · ${pointValue.name}，${suffix}。`
}

async function createMockImageBuffer(image) {
  if (!image.photoSource) {
    throw new Error(`Mock image ${image.id} is missing a real photo source`)
  }

  return getMockPhotoBuffer(image.photoSource)
}

async function getMockPhotoBuffer(source) {
  if (mockPhotoBufferCache.has(source.localPath)) {
    return mockPhotoBufferCache.get(source.localPath)
  }

  const buffer = readLocalMockPhoto(source)

  mockPhotoBufferCache.set(source.localPath, buffer)
  return buffer
}

function readLocalMockPhoto(source) {
  const photoPath = path.join(mockPhotoAssetDirectory, source.localPath)

  if (!existsSync(photoPath)) {
    throw new Error(`Missing mock photo asset: ${photoPath}`)
  }

  const buffer = readFileSync(photoPath)

  if (buffer.byteLength < 1024) {
    throw new Error(`Mock photo asset is unexpectedly small: ${photoPath}`)
  }

  return buffer
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
