const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const appNodeModules = path.resolve(projectRoot, 'node_modules')
const workspaceNodeModules = path.resolve(workspaceRoot, 'node_modules')
const moduleResolutionPaths = [projectRoot, workspaceRoot]

const config = getDefaultConfig(projectRoot)
const nativeWindInput = path.resolve(projectRoot, 'global.css')
const nativeWindTailwindConfig = path.resolve(projectRoot, 'tailwind.config.js')
const e2eHmrShimPath = path.resolve(projectRoot, 'src/shims/expoHmrE2e.ts')
const emptyNodeModuleShimPath = path.resolve(projectRoot, 'src/shims/emptyNodeModule.js')
const expoPackageRoot = resolvePackageRoot('expo')
const expoSetupHmrPath = path.resolve(expoPackageRoot, 'src/async-require/setupHMR.ts')
const expoNativeHmrPath = path.resolve(expoPackageRoot, 'src/async-require/hmr.native.ts')
const isMobileE2e = Boolean(
  process.env.JOURNAL_MOBILE_E2E_RUN_ID ||
  process.env.EXPO_PUBLIC_JOURNAL_MOBILE_E2E_RUN_ID,
)
const packageEntries = {}
const emptyNodeModuleNames = new Set(['fs', 'http', 'https'])
const webidlConversionsEntry = resolveOptionalModule('webidl-conversions/lib/index.js')

if (webidlConversionsEntry) {
  packageEntries['webidl-conversions'] = webidlConversionsEntry
}

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  appNodeModules,
  workspaceNodeModules,
]
const extraNodeModules = {
  '@journal/core': path.resolve(workspaceRoot, 'packages/journal-core/src'),
  '@expo/vector-icons': resolvePackageRoot('@expo/vector-icons'),
  expo: expoPackageRoot,
  'expo-font': resolvePackageRoot('expo-font'),
  react: resolvePackageRoot('react'),
  'react-native': resolvePackageRoot('react-native'),
  'react-native-svg': resolvePackageRoot('react-native-svg'),
  'webidl-conversions': resolvePackageRoot('webidl-conversions'),
}

addOptionalExtraNodeModule(extraNodeModules, 'whatwg-url-without-unicode')

config.resolver.extraNodeModules = extraNodeModules
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

  if (emptyNodeModuleNames.has(moduleName)) {
    return {
      type: 'sourceFile',
      filePath: emptyNodeModuleShimPath,
    }
  }

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

function resolvePackageRoot(packageName) {
  return path.dirname(require.resolve(`${packageName}/package.json`, {
    paths: moduleResolutionPaths,
  }))
}

function resolveOptionalModule(moduleName) {
  try {
    return require.resolve(moduleName, {
      paths: moduleResolutionPaths,
    })
  } catch {
    return null
  }
}

function resolveOptionalPackageRoot(packageName) {
  try {
    return resolvePackageRoot(packageName)
  } catch {
    return null
  }
}

function addOptionalExtraNodeModule(extraNodeModules, packageName) {
  const packageRoot = resolveOptionalPackageRoot(packageName)

  if (packageRoot) {
    extraNodeModules[packageName] = packageRoot
  }
}

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
