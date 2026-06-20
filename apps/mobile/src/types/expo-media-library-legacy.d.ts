declare module 'expo-media-library/legacy' {
  export function requestPermissionsAsync(
    writeOnly?: boolean,
    granularPermissions?: string[],
  ): Promise<{ granted: boolean }>

  export function getAssetInfoAsync(
    asset: string,
    options?: { shouldDownloadFromNetwork?: boolean },
  ): Promise<unknown>
}
