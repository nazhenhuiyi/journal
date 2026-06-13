const { withAppBuildGradle } = require('expo/config-plugins')

const debugApplicationIdSuffix = '.debug'
const marker = '// @journal/android-debug-application-id-suffix'

module.exports = function withAndroidDebugApplicationIdSuffix(config) {
  return withAppBuildGradle(config, (expoConfig) => {
    const buildGradle = expoConfig.modResults

    if (buildGradle.language !== 'groovy') {
      return expoConfig
    }

    buildGradle.contents = addDebugApplicationIdSuffix(buildGradle.contents)
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
module.exports.findGradleBlock = findGradleBlock
