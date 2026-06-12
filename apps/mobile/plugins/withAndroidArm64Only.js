const { withAppBuildGradle } = require('expo/config-plugins')

const marker = '// @journal/android-arm64-only'
const arm64Abi = 'arm64-v8a'

module.exports = function withAndroidArm64Only(config) {
  return withAppBuildGradle(config, (expoConfig) => {
    const buildGradle = expoConfig.modResults

    if (buildGradle.language !== 'groovy') {
      return expoConfig
    }

    buildGradle.contents = addArm64AbiFilter(buildGradle.contents)
    return expoConfig
  })
}

function addArm64AbiFilter(contents) {
  if (contents.includes(marker)) {
    return contents
  }

  const defaultConfigMatch = contents.match(/(^[ \t]*defaultConfig[ \t]*\{[ \t]*\n)/m)

  if (!defaultConfigMatch) {
    return contents
  }

  const defaultConfigLine = defaultConfigMatch[0]
  const baseIndent = defaultConfigLine.match(/^([ \t]*)/)?.[1] ?? ''
  const indent = `${baseIndent}    `
  const block = `${indent}${marker}
${indent}ndk {
${indent}    abiFilters "${arm64Abi}"
${indent}}
`

  return contents.replace(defaultConfigLine, `${defaultConfigLine}${block}`)
}

module.exports.addArm64AbiFilter = addArm64AbiFilter
