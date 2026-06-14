const { withAppBuildGradle } = require('expo/config-plugins')

const debugApplicationIdSuffix = '.debug'
const marker = '// @journal/android-debug-application-id-suffix'
const debuggableReleaseMarker = '// @journal/android-debuggable-release'

module.exports = function withAndroidDebugApplicationIdSuffix(config) {
  return withAppBuildGradle(config, (expoConfig) => {
    const buildGradle = expoConfig.modResults

    if (buildGradle.language !== 'groovy') {
      return expoConfig
    }

    buildGradle.contents = addDebuggableReleaseSwitch(
      addDebugApplicationIdSuffix(buildGradle.contents),
    )
    return expoConfig
  })
}

function addDebugApplicationIdSuffix(contents) {
  const cleanContents = removeExistingDebugApplicationIdSuffixMarker(contents)

  if (hasBuildTypesDebugApplicationIdSuffix(cleanContents)) {
    return cleanContents
  }

  const buildTypesBlock = findGradleBlock(cleanContents, 'buildTypes')

  if (!buildTypesBlock) {
    return cleanContents
  }

  const debugBlock = findGradleBlock(cleanContents, 'debug', buildTypesBlock.openBraceIndex + 1)

  if (!debugBlock || debugBlock.startIndex > buildTypesBlock.endIndex) {
    return cleanContents
  }

  const debugBlockLine = cleanContents.slice(debugBlock.startIndex, debugBlock.lineEndIndex)
  const baseIndent = debugBlockLine.match(/^([ \t]*)/)?.[1] ?? ''
  const indent = `${baseIndent}    `
  const block = `${indent}${marker}
${indent}applicationIdSuffix "${debugApplicationIdSuffix}"
`

  return `${cleanContents.slice(0, debugBlock.lineEndIndex)}${block}${cleanContents.slice(debugBlock.lineEndIndex)}`
}

function removeExistingDebugApplicationIdSuffixMarker(contents) {
  const escapedMarker = escapeRegex(marker)

  return contents.replace(
    new RegExp(`^[ \\t]*${escapedMarker}\\n[ \\t]*applicationIdSuffix[ \\t]+["']${escapeRegex(debugApplicationIdSuffix)}["'][ \\t]*\\n`, 'gm'),
    '',
  )
}

function hasBuildTypesDebugApplicationIdSuffix(contents) {
  const buildTypesBlock = findGradleBlock(contents, 'buildTypes')

  if (!buildTypesBlock) {
    return false
  }

  const debugBlock = findGradleBlock(contents, 'debug', buildTypesBlock.openBraceIndex + 1)

  if (!debugBlock || debugBlock.startIndex > buildTypesBlock.endIndex) {
    return false
  }

  const debugBlockContents = contents.slice(debugBlock.openBraceIndex, debugBlock.endIndex)

  return new RegExp(`applicationIdSuffix[ \\t]+["']${escapeRegex(debugApplicationIdSuffix)}["']`).test(debugBlockContents)
}

function addDebuggableReleaseSwitch(contents) {
  const cleanContents = removeExistingDebuggableReleaseMarker(contents)

  if (hasDebuggableReleaseSwitch(cleanContents)) {
    return cleanContents
  }

  const buildTypesBlock = findGradleBlock(cleanContents, 'buildTypes')

  if (!buildTypesBlock) {
    return cleanContents
  }

  const releaseBlock = findGradleBlock(cleanContents, 'release', buildTypesBlock.openBraceIndex + 1)

  if (!releaseBlock || releaseBlock.startIndex > buildTypesBlock.endIndex) {
    return cleanContents
  }

  const releaseBlockLine = cleanContents.slice(releaseBlock.startIndex, releaseBlock.lineEndIndex)
  const baseIndent = releaseBlockLine.match(/^([ \t]*)/)?.[1] ?? ''
  const indent = `${baseIndent}    `
  const block = `${indent}${debuggableReleaseMarker}
${indent}def enableJournalDebuggableRelease = findProperty('journalDebuggableRelease') ?: 'false'
${indent}debuggable enableJournalDebuggableRelease.toBoolean()
`

  return `${cleanContents.slice(0, releaseBlock.lineEndIndex)}${block}${cleanContents.slice(releaseBlock.lineEndIndex)}`
}

function removeExistingDebuggableReleaseMarker(contents) {
  const escapedMarker = escapeRegex(debuggableReleaseMarker)

  return contents.replace(
    new RegExp(`^[ \\t]*${escapedMarker}\\n[ \\t]*def enableJournalDebuggableRelease = findProperty\\('journalDebuggableRelease'\\) \\?: 'false'\\n[ \\t]*debuggable enableJournalDebuggableRelease\\.toBoolean\\(\\)[ \\t]*\\n`, 'gm'),
    '',
  )
}

function hasDebuggableReleaseSwitch(contents) {
  const buildTypesBlock = findGradleBlock(contents, 'buildTypes')

  if (!buildTypesBlock) {
    return false
  }

  const releaseBlock = findGradleBlock(contents, 'release', buildTypesBlock.openBraceIndex + 1)

  if (!releaseBlock || releaseBlock.startIndex > buildTypesBlock.endIndex) {
    return false
  }

  const releaseBlockContents = contents.slice(releaseBlock.openBraceIndex, releaseBlock.endIndex)

  return releaseBlockContents.includes("findProperty('journalDebuggableRelease')") ||
    releaseBlockContents.includes('findProperty("journalDebuggableRelease")')
}

function findGradleBlock(contents, blockName, startIndex = 0) {
  const blockRegex = new RegExp(`(^[ \\t]*${escapeRegex(blockName)}[ \\t]*\\{[ \\t]*\\n)`, 'm')
  const match = blockRegex.exec(contents.slice(startIndex))

  if (!match) {
    return null
  }

  const start = startIndex + match.index
  const lineEndIndex = start + match[0].length
  const openBraceIndex = contents.indexOf('{', start)
  let depth = 0

  for (let index = openBraceIndex; index < contents.length; index += 1) {
    const character = contents[index]

    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1

      if (depth === 0) {
        return {
          endIndex: index,
          lineEndIndex,
          openBraceIndex,
          startIndex: start,
        }
      }
    }
  }

  return null
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports.addDebugApplicationIdSuffix = addDebugApplicationIdSuffix
module.exports.addDebuggableReleaseSwitch = addDebuggableReleaseSwitch
module.exports.findGradleBlock = findGradleBlock
