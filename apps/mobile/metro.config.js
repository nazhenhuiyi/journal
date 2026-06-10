const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const appNodeModules = path.resolve(projectRoot, 'node_modules')
const workspaceNodeModules = path.resolve(workspaceRoot, 'node_modules')

const config = getDefaultConfig(projectRoot)
const nativeWindInput = path.resolve(projectRoot, 'global.css')
const nativeWindTailwindConfig = path.resolve(projectRoot, 'tailwind.config.js')
const e2eHmrShimPath = path.resolve(projectRoot, 'src/shims/expoHmrE2e.ts')
const expoSetupHmrPath = path.resolve(appNodeModules, 'expo/src/async-require/setupHMR.ts')
const expoNativeHmrPath = path.resolve(appNodeModules, 'expo/src/async-require/hmr.native.ts')
const isMobileE2e = Boolean(
  process.env.JOURNAL_MOBILE_E2E_RUN_ID ||
  process.env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID,
)
const packageEntries = {
  'webidl-conversions': path.resolve(
    workspaceNodeModules,
    'whatwg-url-without-unicode/node_modules/webidl-conversions/lib/index.js',
  ),
}

config.watchFolders = [workspaceRoot]
config.resolver.disableHierarchicalLookup = true
config.resolver.nodeModulesPaths = [
  appNodeModules,
  workspaceNodeModules,
]
config.resolver.extraNodeModules = {
  '@journal/core': path.resolve(workspaceRoot, 'packages/journal-core/src'),
  '@expo/vector-icons': path.resolve(appNodeModules, '@expo/vector-icons'),
  expo: path.resolve(appNodeModules, 'expo'),
  'expo-font': path.resolve(appNodeModules, 'expo-font'),
  react: path.resolve(appNodeModules, 'react'),
  'react-native': path.resolve(appNodeModules, 'react-native'),
  'react-native-svg': path.resolve(appNodeModules, 'react-native-svg'),
  'webidl-conversions': path.resolve(
    workspaceNodeModules,
    'whatwg-url-without-unicode/node_modules/webidl-conversions',
  ),
  'whatwg-url-without-unicode': path.resolve(workspaceNodeModules, 'whatwg-url-without-unicode'),
}
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    isMobileE2e &&
    platform !== 'web' &&
    isHmrClientModule(moduleName)
  ) {
    return {
      type: 'sourceFile',
      filePath: e2eHmrShimPath,
    }
  }

  if (
    platform !== 'web' &&
    moduleName === './hmr' &&
    isExpoSetupHmrPath(context.originModulePath)
  ) {
    return {
      type: 'sourceFile',
      filePath: isMobileE2e ? e2eHmrShimPath : expoNativeHmrPath,
    }
  }

  const packageEntry = packageEntries[moduleName]

  if (packageEntry) {
    return {
      type: 'sourceFile',
      filePath: packageEntry,
    }
  }

  return context.resolveRequest(context, moduleName, platform)
}

module.exports = withNativeWind(config, {
  configPath: nativeWindTailwindConfig,
  disableTypeScriptGeneration: true,
  forceWriteFileSystem: true,
  input: nativeWindInput,
})

function isExpoSetupHmrPath(originModulePath) {
  const normalizedPath = path.normalize(originModulePath ?? '')

  return normalizedPath === expoSetupHmrPath
}

function isHmrClientModule(moduleName) {
  const normalizedName = moduleName.replace(/\\/g, '/')

  return normalizedName === 'react-native/Libraries/Utilities/HMRClient' ||
    normalizedName === 'react-native/Libraries/Utilities/HMRClient.js' ||
    normalizedName.endsWith('/Utilities/HMRClient') ||
    normalizedName.endsWith('/Utilities/HMRClient.js')
}
