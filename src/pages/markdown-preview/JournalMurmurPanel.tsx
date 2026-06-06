import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, MapPin, MessageSquareText, Trash } from 'lucide-react'
import type { ImageBlock, ImageLocation, MurmurBlock } from '../../domain/markdown'

type ImportedJournalImage = {
  id: string
  src: string
  fileName: string
  filePath: string
  location?: ImageLocation
}

type JournalMurmurPanelProps = {
  date: string
  murmurs: MurmurBlock[]
  onChange: (murmurs: MurmurBlock[]) => void
  onImportImages: () => Promise<ImportedJournalImage[]>
}

function JournalMurmurPanel({
  date,
  murmurs,
  onChange,
  onImportImages,
}: JournalMurmurPanelProps) {
  const [preferredMurmurId, setPreferredMurmurId] = useState(murmurs[0]?.id ?? '')
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingFocusMurmurIdRef = useRef('')
  const selectedMurmur = useMemo(
    () => murmurs.find((murmur) => murmur.id === preferredMurmurId) ?? murmurs[murmurs.length - 1] ?? null,
    [murmurs, preferredMurmurId],
  )
  const selectedMurmurId = selectedMurmur?.id ?? ''

  useEffect(() => {
    if (!selectedMurmurId || pendingFocusMurmurIdRef.current !== selectedMurmurId) {
      return
    }

    bodyTextareaRef.current?.focus()
    pendingFocusMurmurIdRef.current = ''
  }, [selectedMurmurId])

  function handleCreateMurmur() {
    const murmur = createMurmur(date, murmurs)

    pendingFocusMurmurIdRef.current = murmur.id
    onChange([...murmurs, murmur])
    setPreferredMurmurId(murmur.id)
  }

  function updateSelectedMurmur(updater: (murmur: MurmurBlock) => MurmurBlock) {
    if (!selectedMurmur) {
      return
    }

    onChange(murmurs.map((murmur) => (murmur.id === selectedMurmur.id ? updater(murmur) : murmur)))
  }

  async function handleImportImages() {
    setIsImporting(true)
    setImportError('')

    try {
      const importedImages = await onImportImages()

      if (importedImages.length === 0) {
        return
      }

      const imageBlocks = importedImages.map(importedImageToBlock)
      const targetMurmur = selectedMurmur ?? createMurmur(date, murmurs)
      const nextMurmurs = selectedMurmur
        ? murmurs.map((murmur) =>
            murmur.id === selectedMurmur.id
              ? { ...murmur, images: [...murmur.images, ...imageBlocks] }
              : murmur,
          )
        : [...murmurs, { ...targetMurmur, images: imageBlocks }]

      onChange(nextMurmurs)
      setPreferredMurmurId(targetMurmur.id)
    } catch {
      setImportError('图片刚才没有放进去。')
    } finally {
      setIsImporting(false)
    }
  }

  function handleDeleteSelected() {
    if (!selectedMurmur) {
      return
    }

    onChange(murmurs.filter((murmur) => murmur.id !== selectedMurmur.id))
  }

  return (
    <aside aria-label="碎碎念" className="journal-murmur-panel">
      <div className="journal-murmur-panel-header">
        <div>
          <p>碎碎念</p>
          <span>{murmurs.length > 0 ? `${murmurs.length} 条放在今天底部` : '今天还没有小片刻'}</span>
        </div>
        <button onClick={handleCreateMurmur} type="button">
          <MessageSquareText aria-hidden="true" size={18} strokeWidth={2.15} />
          添一条
        </button>
      </div>

      {murmurs.length > 0 ? (
        <div aria-label="碎碎念列表" className="journal-murmur-list">
          {murmurs.map((murmur) => (
            <button
              aria-pressed={murmur.id === selectedMurmurId}
              className={murmur.id === selectedMurmurId ? 'is-active' : ''}
              key={murmur.id}
              onClick={() => setPreferredMurmurId(murmur.id)}
              type="button"
            >
              <span>{formatMurmurTime(murmur.time)}</span>
              <strong>{formatMurmurSummary(murmur)}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <div className="journal-murmur-form">
        {selectedMurmur ? (
          <>
            <label>
              <span>正文</span>
              <textarea
                aria-label="碎碎念正文"
                onChange={(event) =>
                  updateSelectedMurmur((murmur) => ({ ...murmur, body: event.target.value }))
                }
                placeholder="这一刻发生了什么？"
                ref={bodyTextareaRef}
                value={selectedMurmur.body}
              />
            </label>

            <div className="journal-murmur-actions">
              <button disabled={isImporting} onClick={() => void handleImportImages()} type="button">
                <Camera aria-hidden="true" size={18} strokeWidth={2.15} />
                {isImporting ? '放入中' : '加图片'}
              </button>
              <button onClick={handleDeleteSelected} type="button">
                <Trash aria-hidden="true" size={17} strokeWidth={2.1} />
                删掉这条
              </button>
            </div>

            {importError ? <p className="journal-murmur-error">{importError}</p> : null}

            {selectedMurmur.images.length > 0 ? (
              <div className="journal-murmur-images">
                {selectedMurmur.images.map((image) => (
                  <MurmurImageForm
                    image={image}
                    key={image.id}
                    onDelete={() =>
                      updateSelectedMurmur((murmur) => ({
                        ...murmur,
                        images: murmur.images.filter((candidate) => candidate.id !== image.id),
                      }))
                    }
                    onUpdate={(nextImage) =>
                      updateSelectedMurmur((murmur) => ({
                        ...murmur,
                        images: murmur.images.map((candidate) =>
                          candidate.id === image.id ? nextImage : candidate,
                        ),
                      }))
                    }
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="journal-murmur-empty">
            <MessageSquareText aria-hidden="true" size={28} strokeWidth={2.1} />
            <p>可以先留一条碎碎念，再给它放照片。</p>
          </div>
        )}
      </div>
    </aside>
  )
}

function MurmurImageForm({
  image,
  onDelete,
  onUpdate,
}: {
  image: ImageBlock
  onDelete: () => void
  onUpdate: (image: ImageBlock) => void
}) {
  const latitude = image.location?.latitude
  const longitude = image.location?.longitude

  return (
    <section className="journal-murmur-image-form">
      <div>
        <strong title={image.src}>{image.src}</strong>
        <button aria-label="移除图片" onClick={onDelete} type="button">
          <Trash aria-hidden="true" size={16} strokeWidth={2.05} />
        </button>
      </div>
      <label>
        <span>说明</span>
        <input
          aria-label="图片说明"
          onChange={(event) => onUpdate({ ...image, caption: event.target.value })}
          placeholder="这张图想留一句什么？"
          value={image.caption ?? ''}
        />
      </label>
      <label>
        <span>标签</span>
        <input
          aria-label="图片标签"
          onChange={(event) => onUpdate({ ...image, tags: parseTagsInput(event.target.value) })}
          placeholder="雨, 窗户"
          value={image.tags.join(', ')}
        />
      </label>
      <label>
        <span>地点</span>
        <input
          aria-label="图片地点"
          onChange={(event) => onUpdate(updateImageLocationName(image, event.target.value))}
          placeholder="青龙湖、公园、家里..."
          value={image.location?.name ?? ''}
        />
      </label>
      {latitude !== undefined && longitude !== undefined ? (
        <p className="journal-murmur-image-location">
          <MapPin aria-hidden="true" size={14} strokeWidth={2.05} />
          <span>{formatImageCoordinates(latitude, longitude)}</span>
          {image.location?.source === 'exif' ? <span>EXIF</span> : null}
        </p>
      ) : null}
    </section>
  )
}

function createMurmur(date: string, existingMurmurs: MurmurBlock[]): MurmurBlock {
  const now = new Date()
  const baseId = `m_${date.split('-').join('')}_${formatTimeForId(now)}`
  const existingIds = new Set(existingMurmurs.map((murmur) => murmur.id))
  const id = createUniqueId(baseId, existingIds)

  return {
    id,
    time: now.toISOString(),
    body: '',
    images: [],
  }
}

function importedImageToBlock(importedImage: ImportedJournalImage): ImageBlock {
  return {
    id: importedImage.id,
    location: importedImage.location,
    src: importedImage.src,
    tags: [],
  }
}

function updateImageLocationName(image: ImageBlock, value: string): ImageBlock {
  const name = value.trim()
  const location = image.location
  const hasCoordinates = location?.latitude !== undefined || location?.longitude !== undefined

  return {
    ...image,
    location: name || hasCoordinates
      ? {
          ...location,
          name: name || undefined,
          source: location?.source ?? 'manual',
        }
      : undefined,
  }
}

function createUniqueId(baseId: string, existingIds: Set<string>) {
  if (!existingIds.has(baseId)) {
    return baseId
  }

  for (let index = 2; index < 10_000; index += 1) {
    const id = `${baseId}_${index}`

    if (!existingIds.has(id)) {
      return id
    }
  }

  return `${baseId}_${Math.random().toString(36).slice(2, 8)}`
}

function formatTimeForId(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')

  return `${hours}${minutes}${seconds}`
}

function formatMurmurTime(time: string) {
  const date = new Date(time)

  if (Number.isNaN(date.getTime())) {
    return '片刻'
  }

  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`
}

function formatMurmurSummary(murmur: MurmurBlock) {
  const body = murmur.body.trim().replace(/\s+/g, ' ')

  if (body) {
    return body
  }

  if (murmur.images.length > 0) {
    return `${murmur.images.length} 张图片`
  }

  return '空白碎碎念'
}

function parseTagsInput(value: string) {
  return normalizeTags(
    value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  )
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)))
}

function formatImageCoordinates(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

export default JournalMurmurPanel
