const path = require('path')
const fs = require('fs')
const plistModule = require('@expo/plist')
const { IOSConfig, withXcodeProject } = require('expo/config-plugins')
const plist = plistModule.default ?? plistModule

const displayName = '且留'
const quotedDisplayName = `"${displayName}"`
const widgetFontPath = './assets/fonts/Xiaolai.ttf'
const widgetFontFileName = path.basename(widgetFontPath)
const widgetsTargetName = 'ExpoWidgetsTarget'
const resourcesBuildPhaseName = 'Resources'

function getTargetResourcesPhase(project, targetUuid) {
  const nativeTarget = project.pbxNativeTargetSection()[targetUuid]
  const phaseRef = nativeTarget?.buildPhases?.find(
    (phase) => phase.comment === resourcesBuildPhaseName,
  )?.value

  if (!phaseRef) {
    return null
  }

  return project.hash.project.objects.PBXResourcesBuildPhase?.[phaseRef] ?? null
}

function ensureTargetResourcesPhase(project, targetUuid) {
  let resourcesPhase = getTargetResourcesPhase(project, targetUuid)

  if (!resourcesPhase) {
    project.addBuildPhase(
      [],
      'PBXResourcesBuildPhase',
      resourcesBuildPhaseName,
      targetUuid,
    )
    resourcesPhase = getTargetResourcesPhase(project, targetUuid)
  }

  return resourcesPhase
}

function findFontFileRef(project) {
  const fileReferences = project.pbxFileReferenceSection()

  for (const [uuid, fileReference] of Object.entries(fileReferences)) {
    if (uuid.endsWith('_comment')) {
      continue
    }

    if (
      fileReference.name === widgetFontFileName ||
      fileReference.path?.endsWith(`/assets/fonts/${widgetFontFileName}`)
    ) {
      return uuid
    }
  }

  return null
}

function getTargetUuidByName(project, targetName) {
  const nativeTargets = project.pbxNativeTargetSection()

  for (const [uuid, target] of Object.entries(nativeTargets)) {
    if (uuid.endsWith('_comment')) {
      continue
    }

    if (target.name === targetName) {
      return uuid
    }
  }

  return null
}

function removeEmptyDuplicateResourcesPhases(project) {
  const nativeTargets = project.pbxNativeTargetSection()
  const resourcesSection = project.hash.project.objects.PBXResourcesBuildPhase

  if (!resourcesSection) {
    return
  }

  for (const [targetUuid, target] of Object.entries(nativeTargets)) {
    if (targetUuid.endsWith('_comment')) {
      continue
    }

    const resourcesPhases = target.buildPhases?.filter(
      (phase) => phase.comment === resourcesBuildPhaseName,
    ) ?? []

    if (resourcesPhases.length <= 1) {
      continue
    }

    const phaseToKeep =
      resourcesPhases.find(
        (phase) => (resourcesSection[phase.value]?.files?.length ?? 0) > 0,
      ) ?? resourcesPhases[0]
    const emptyDuplicatePhaseRefs = resourcesPhases.filter((phase) => {
      if (phase.value === phaseToKeep.value) {
        return false
      }

      return (resourcesSection[phase.value]?.files?.length ?? 0) === 0
    })

    if (emptyDuplicatePhaseRefs.length === 0) {
      continue
    }

    target.buildPhases = target.buildPhases.filter(
      (phase) => !emptyDuplicatePhaseRefs.some(
        (duplicate) => duplicate.value === phase.value,
      ),
    )

    for (const phase of emptyDuplicatePhaseRefs) {
      delete resourcesSection[phase.value]
      delete resourcesSection[`${phase.value}_comment`]
    }
  }
}

function ensureFontInWidgetResources(project, targetUuid) {
  const resourcesPhase = ensureTargetResourcesPhase(project, targetUuid)
  const fontFileRef = findFontFileRef(project)

  if (!resourcesPhase || !fontFileRef) {
    return
  }

  const buildFiles = project.pbxBuildFileSection()
  const hasFontInPhase = resourcesPhase.files.some((file) => {
    const buildFile = buildFiles[file.value]

    return buildFile?.fileRef === fontFileRef
  })

  if (hasFontInPhase) {
    return
  }

  const buildFileUuid = project.generateUuid()
  const buildFileComment = `${widgetFontFileName} in Resources`

  buildFiles[buildFileUuid] = {
    isa: 'PBXBuildFile',
    fileRef: fontFileRef,
  }
  buildFiles[`${buildFileUuid}_comment`] = buildFileComment

  resourcesPhase.files.push({
    comment: buildFileComment,
    value: buildFileUuid,
  })
}

function ensureWidgetInfoPlistFont(platformProjectRoot) {
  const infoPlistPath = path.join(
    platformProjectRoot,
    widgetsTargetName,
    'Info.plist',
  )

  if (!fs.existsSync(infoPlistPath)) {
    return
  }

  const contents = fs.readFileSync(infoPlistPath, 'utf8')
  const infoPlist = plist.parse(contents)
  const existingFonts = Array.isArray(infoPlist.UIAppFonts)
    ? infoPlist.UIAppFonts
    : []

  infoPlist.UIAppFonts = Array.from(new Set([
    ...existingFonts,
    widgetFontFileName,
  ]))

  fs.writeFileSync(infoPlistPath, plist.build(infoPlist))
}

module.exports = function withExpoWidgetsTargetVersion(config) {
  const appVersion = config.ios?.version ?? config.version ?? '1.0'
  const buildNumber = config.ios?.buildNumber ?? '1'

  config = withXcodeProject(config, (expoConfig) => {
    const project = expoConfig.modResults
    const widgetsTarget = project.pbxTargetByName(widgetsTargetName)
    const widgetsTargetUuid = getTargetUuidByName(project, widgetsTargetName)

    if (!widgetsTarget?.buildConfigurationList || !widgetsTargetUuid) {
      return expoConfig
    }

    IOSConfig.XcodeUtils.ensureGroupRecursively(project, 'Resources')
    removeEmptyDuplicateResourcesPhases(project)
    ensureTargetResourcesPhase(project, widgetsTargetUuid)
    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: path.relative(
        expoConfig.modRequest.platformProjectRoot,
        path.resolve(expoConfig.modRequest.projectRoot, widgetFontPath),
      ),
      groupName: 'Resources',
      isBuildFile: true,
      project,
      targetUuid: widgetsTargetUuid,
    })
    ensureFontInWidgetResources(project, widgetsTargetUuid)
    ensureWidgetInfoPlistFont(expoConfig.modRequest.platformProjectRoot)

    const configurationList =
      project.pbxXCConfigurationList()[widgetsTarget.buildConfigurationList]

    if (!configurationList?.buildConfigurations) {
      return expoConfig
    }

    const buildConfigurations = project.pbxXCBuildConfigurationSection()

    for (const configurationRef of configurationList.buildConfigurations) {
      const buildConfiguration = buildConfigurations[configurationRef.value]

      if (!buildConfiguration?.buildSettings) {
        continue
      }

      buildConfiguration.buildSettings.MARKETING_VERSION = appVersion
      buildConfiguration.buildSettings.CURRENT_PROJECT_VERSION = buildNumber
      buildConfiguration.buildSettings.INFOPLIST_KEY_CFBundleDisplayName =
        quotedDisplayName
      buildConfiguration.buildSettings.INFOPLIST_KEY_CFBundleName = quotedDisplayName
    }

    return expoConfig
  })

  return config
}
