const { withAndroidManifest } = require('expo/config-plugins')

module.exports = function withAndroidPredictiveBackOptOut(config) {
  return withAndroidManifest(config, (expoConfig) => {
    const application = expoConfig.modResults.manifest.application?.[0]

    if (!application) {
      return expoConfig
    }

    application.$ = application.$ ?? {}
    application.$['android:enableOnBackInvokedCallback'] = 'false'

    return expoConfig
  })
}
