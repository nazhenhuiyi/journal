import { describe, expect, it, vi } from 'vitest'
import {
  getMobileImageImportFailureCopy,
  isAndroidImagePickerLauncherRegistrationError,
  isMobileImagePickerLaunchFailure,
  launchWithAndroidLauncherRetry,
} from './mobileImagePicker'

vi.mock('expo-image-picker', () => ({
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
  UIImagePickerPreferredAssetRepresentationMode: {
    Compatible: 'compatible',
  },
}))

describe('mobileImagePicker', () => {
  it('recognizes the Android ActivityResultLauncher registration failure from expo-image-picker', () => {
    const error = new Error([
      "Call to function 'ExponentImagePicker.launchCameraAsync' has been rejected.",
      'Caused by: java.lang.IllegalStateException: Attempting to launch an unregistered ActivityResultLauncher',
    ].join('\n'))

    expect(isMobileImagePickerLaunchFailure(error)).toBe(true)
    expect(isAndroidImagePickerLauncherRegistrationError(error)).toBe(true)
  })

  it('retries Android launcher registration failures once', async () => {
    const launch = vi.fn()
      .mockRejectedValueOnce(new Error('Attempting to launch an unregistered ActivityResultLauncher'))
      .mockResolvedValueOnce({ canceled: true })

    await expect(launchWithAndroidLauncherRetry(launch, {
      platform: 'android',
      retryDelayMs: 0,
    })).resolves.toEqual({ canceled: true })
    expect(launch).toHaveBeenCalledTimes(2)
  })

  it('does not retry unrelated image picker failures', async () => {
    const error = new Error('camera permission revoked')
    const launch = vi.fn().mockRejectedValue(error)

    await expect(launchWithAndroidLauncherRetry(launch, {
      platform: 'android',
      retryDelayMs: 0,
    })).rejects.toBe(error)
    expect(launch).toHaveBeenCalledOnce()
  })

  it('uses a launch failure copy that does not imply a saved image was lost', () => {
    const copy = getMobileImageImportFailureCopy(
      'library',
      new Error("Call to function 'ExponentImagePicker.launchImageLibraryAsync' has been rejected."),
    )

    expect(copy.title).toBe('相册没有打开')
    expect(copy.message).toContain('还没有开始保存图片')
    expect(copy.message).toContain('日记内容还在')
  })
})
