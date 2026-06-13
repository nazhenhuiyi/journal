import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  addDebugApplicationIdSuffix,
} = require('./withAndroidDebugApplicationIdSuffix.js') as {
  addDebugApplicationIdSuffix: (contents: string) => string
}

describe('withAndroidDebugApplicationIdSuffix', () => {
  it('adds the debug application id suffix inside buildTypes.debug', () => {
    const result = addDebugApplicationIdSuffix(`
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`)

    expect(result).toContain(`signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }`)
    expect(result).toContain(`buildTypes {
        debug {
            // @journal/android-debug-application-id-suffix
            applicationIdSuffix ".debug"
            signingConfig signingConfigs.debug
        }`)
  })

  it('moves a previously misplaced marker out of signingConfigs.debug', () => {
    const result = addDebugApplicationIdSuffix(`
android {
    signingConfigs {
        debug {
            // @journal/android-debug-application-id-suffix
            applicationIdSuffix ".debug"
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
    }
}
`)

    expect(result).not.toContain(`signingConfigs {
        debug {
            // @journal/android-debug-application-id-suffix
            applicationIdSuffix ".debug"`)
    expect(result).toContain(`buildTypes {
        debug {
            // @journal/android-debug-application-id-suffix
            applicationIdSuffix ".debug"
            signingConfig signingConfigs.debug
        }`)
  })
})
