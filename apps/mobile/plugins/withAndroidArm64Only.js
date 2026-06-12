const {
  withAppBuildGradle,
  withGradleProperties,
} = require('expo/config-plugins')

const marker = '// @journal/android-arm64-only'
const arm64Abi = 'arm64-v8a'
const reactNativeArchitecturesProperty = 'reactNativeArchitectures'

module.exports = function withAndroidArm64Only(config) {
  let nextConfig = withAppBuildGradle(config, (expoConfig) => {
    const buildGradle = expoConfig.modResults

    if (buildGradle.language !== 'groovy') {
      return expoConfig
    }

    buildGradle.contents = addArm64AbiFilter(buildGradle.contents)
    return expoConfig
  })

  nextConfig = withGradleProperties(nextConfig, (expoConfig) => {
    expoConfig.modResults = setGradleProperty(
      expoConfig.modResults,
      reactNativeArchitecturesProperty,
      arm64Abi,
    )
    return expoConfig
  })

  return nextConfig
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

function setGradleProperty(properties, key, value) {
  const property = properties.find((item) => item.type === 'property' && item.key === key)

  if (property) {
    property.value = value
    return properties
  }

  properties.push({
    type: 'property',
    key,
    value,
  })

  return properties
}

module.exports.addArm64AbiFilter = addArm64AbiFilter
module.exports.setGradleProperty = setGradleProperty
