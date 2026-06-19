export function resolveJournalMediaSrc(src: string) {
  if (isAbsoluteUrl(src) || src.startsWith('/')) {
    return src
  }

  return `journal-media://local/${src.split('/').map(encodeURIComponent).join('/')}`
}

export function resolveJournalMediaThumbnailSrc(src: string, size = 512) {
  const resolvedSrc = resolveJournalMediaSrc(src)

  if (!resolvedSrc.startsWith('journal-media://')) {
    return resolvedSrc
  }

  const url = new URL(resolvedSrc)

  url.searchParams.set('variant', 'thumbnail')
  url.searchParams.set('size', `${size}`)

  return url.toString()
}

function isAbsoluteUrl(src: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(src)
}
