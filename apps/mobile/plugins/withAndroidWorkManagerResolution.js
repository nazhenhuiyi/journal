const { withProjectBuildGradle } = require('expo/config-plugins')

const workManagerVersion = '2.8.1'
const marker = '// @journal/android-workmanager-resolution'

module.exports = function withAndroidWorkManagerResolution(config) {
  return withProjectBuildGradle(config, (expoConfig) => {
    const buildGradle = expoConfig.modResults

    if (buildGradle.language !== 'groovy') {
      return expoConfig
    }

    buildGradle.contents = addWorkManagerResolution(buildGradle.contents)
    return expoConfig
  })
}

function addWorkManagerResolution(contents) {
  if (contents.includes(marker)) {
    return contents
  }

  return `${contents.trimEnd()}

${marker}
subprojects {
  configurations.configureEach {
    resolutionStrategy.force(
      'androidx.work:work-runtime:${workManagerVersion}',
      'androidx.work:work-runtime-ktx:${workManagerVersion}'
    )
  }
}
`
}
