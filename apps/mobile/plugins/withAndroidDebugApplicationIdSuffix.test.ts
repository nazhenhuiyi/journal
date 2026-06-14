import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  addDebugApplicationIdSuffix,
  addDebuggableReleaseSwitch,
} = require('./withAndroidDebugApplicationIdSuffix.js') as {
  addDebugApplicationIdSuffix: (contents: string) => string
  addDebuggableReleaseSwitch: (contents: string) => string
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

  it('adds the journal debuggable release switch inside buildTypes.release', () => {
    const result = addDebuggableReleaseSwitch(`
android {
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

    expect(result).toContain(`release {
            // @journal/android-debuggable-release
            def enableJournalDebuggableRelease = findProperty('journalDebuggableRelease') ?: 'false'
            debuggable enableJournalDebuggableRelease.toBoolean()
            signingConfig signingConfigs.debug
        }`)
  })

  it('keeps an existing journal debuggable release switch in place', () => {
    const result = addDebuggableReleaseSwitch(`
android {
    buildTypes {
        release {
            signingConfig signingConfigs.debug
            def enableJournalDebuggableRelease = findProperty('journalDebuggableRelease') ?: 'false'
            debuggable enableJournalDebuggableRelease.toBoolean()
        }
    }
}
`)

    expect(result.match(/findProperty\('journalDebuggableRelease'\)/g)).toHaveLength(1)
  })
})
