import * as ImagePicker from 'expo-image-picker'

export type MobileImagePickerSource = 'camera' | 'library'

const androidLauncherRetryDelayMs = 350

type LaunchWithRetryOptions = {
  platform?: string
  retryDelayMs?: number
}

type ImagePickerFailureCopy = {
  message: string
  title: string
}

export async function requestMobileImagePickerPermission(source: MobileImagePickerSource) {
  return source === 'camera'
    ? ImagePicker.requestCameraPermissionsAsync()
    : ImagePicker.requestMediaLibraryPermissionsAsync(false)
}

export async function launchMobileImagePicker(
  source: MobileImagePickerSource,
  options: { platform: string },
) {
  const launch = () => source === 'camera'
    ? ImagePicker.launchCameraAsync({
        exif: true,
        mediaTypes: ['images'],
        quality: 1,
      })
    : ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        exif: true,
        // Android Photo Picker can redact GPS EXIF on some OEM builds.
        legacy: options.platform === 'android',
        mediaTypes: ['images'],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 1,
      })

  return launchWithAndroidLauncherRetry(launch, {
    platform: options.platform,
  })
}

export async function launchWithAndroidLauncherRetry<T>(
  launch: () => Promise<T>,
  options: LaunchWithRetryOptions = {},
) {
  try {
    return await launch()
  } catch (error) {
    if (options.platform !== 'android' || !isAndroidImagePickerLauncherRegistrationError(error)) {
      throw error
    }

    const retryDelayMs = options.retryDelayMs ?? androidLauncherRetryDelayMs

    if (retryDelayMs > 0) {
      await delay(retryDelayMs)
    }

    return launch()
  }
}

export function getMobileImageImportFailureCopy(
  source: MobileImagePickerSource,
  error: unknown,
): ImagePickerFailureCopy {
  if (isMobileImagePickerLaunchFailure(error)) {
    return {
      title: source === 'camera' ? '相机没有打开' : '相册没有打开',
      message: source === 'camera'
        ? '这次还没有开始保存照片，日记内容还在。请回到 Journal 后再试一次；如果连续出现，重启 App 可以恢复。'
        : '这次还没有开始保存图片，日记内容还在。请回到 Journal 后再试一次；如果连续出现，重启 App 可以恢复。',
    }
  }

  return {
    title: '图片没有放进去',
    message: source === 'camera'
      ? '刚才拍下的照片没有保存成功。'
      : '刚才选择的图片没有保存成功。',
  }
}

export function isMobileImagePickerLaunchFailure(error: unknown) {
  const text = formatErrorText(error)

  return (
    text.includes('ExponentImagePicker.launchCameraAsync') ||
    text.includes('ExponentImagePicker.launchImageLibraryAsync') ||
    text.includes('launchCameraAsync') ||
    text.includes('launchImageLibraryAsync')
  )
}

export function isAndroidImagePickerLauncherRegistrationError(error: unknown) {
  const text = formatErrorText(error)

  return text.includes('unregistered ActivityResultLauncher')
}

function formatErrorText(error: unknown): string {
  if (error instanceof Error) {
    return [
      error.name,
      error.message,
      error.stack,
    ].filter(Boolean).join('\n')
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return ''
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
