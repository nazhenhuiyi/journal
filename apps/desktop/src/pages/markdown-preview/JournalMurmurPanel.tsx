import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, MessageSquareText, Pencil, Trash } from 'lucide-react'
import type { ImageBlock, ImageLocation, MurmurBlock } from '@journal/core'
import { resolveJournalMediaSrc } from '../../domain/journalMedia'

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
  const [editingMurmurId, setEditingMurmurId] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const orderedMurmurs = useMemo(
    () => [...murmurs].sort((first, second) => compareMurmursByNewest(first, second)),
    [murmurs],
  )
  const editingMurmur = useMemo(
    () => murmurs.find((murmur) => murmur.id === editingMurmurId) ?? null,
    [editingMurmurId, murmurs],
  )

  useEffect(() => {
    if (!isEditorOpen) {
      return
    }

    window.requestAnimationFrame(() => {
      bodyTextareaRef.current?.focus()
    })
  }, [editingMurmur?.id, isEditorOpen])

  function handleCreateMurmur() {
    const murmur = createMurmur(date, murmurs)

    onChange([...murmurs, murmur])
    setEditingMurmurId(murmur.id)
    setImportError('')
    setIsEditorOpen(true)
  }

  function handleEditMurmur(murmurId: string) {
    setEditingMurmurId(murmurId)
    setImportError('')
    setIsEditorOpen(true)
  }

  function updateEditingMurmur(updater: (murmur: MurmurBlock) => MurmurBlock) {
    if (!editingMurmur) {
      return
    }

    onChange(murmurs.map((murmur) => (murmur.id === editingMurmur.id ? updater(murmur) : murmur)))
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
      const targetMurmur = editingMurmur ?? createMurmur(date, murmurs)
      const nextMurmurs = editingMurmur
        ? murmurs.map((murmur) =>
            murmur.id === editingMurmur.id
              ? { ...murmur, images: [...murmur.images, ...imageBlocks] }
              : murmur,
          )
        : [...murmurs, { ...targetMurmur, images: imageBlocks }]

      onChange(nextMurmurs)
      setEditingMurmurId(targetMurmur.id)
      setIsEditorOpen(true)
    } catch {
      setImportError('图片刚才没有放进去。')
    } finally {
      setIsImporting(false)
    }
  }

  function handleDeleteEditingMurmur() {
    if (!editingMurmur) {
      return
    }

    handleDeleteMurmur(editingMurmur.id)
  }

  function handleDeleteMurmur(murmurId: string) {
    onChange(murmurs.filter((murmur) => murmur.id !== murmurId))

    if (editingMurmurId !== murmurId) {
      return
    }

    setIsEditorOpen(false)
    setEditingMurmurId('')
    setImportError('')
  }

  function handleCloseEditor() {
    setIsEditorOpen(false)
    setImportError('')
  }

  return (
    <aside aria-label="碎碎念" className="journal-murmur-panel">
      <div className="journal-murmur-panel-header">
        <div>
          <p>碎碎念</p>
        </div>
        <button onClick={handleCreateMurmur} type="button">
          <MessageSquareText aria-hidden="true" size={18} strokeWidth={2.15} />
          添一条
        </button>
      </div>

      <div className="journal-murmur-scroll">
        {orderedMurmurs.length > 0 ? (
          <div aria-label="碎碎念列表" className="journal-murmur-feed">
            {orderedMurmurs.map((murmur) => (
              <MurmurDisplayCard
                key={murmur.id}
                murmur={murmur}
                onDelete={() => handleDeleteMurmur(murmur.id)}
                onEdit={() => handleEditMurmur(murmur.id)}
              />
            ))}
          </div>
        ) : (
          <div className="journal-murmur-empty">
            <MessageSquareText aria-hidden="true" size={28} strokeWidth={2.1} />
            <p>可以先留一条碎碎念，再给它放照片。</p>
          </div>
        )}
      </div>

      {isEditorOpen && editingMurmur ? (
        <div className="journal-murmur-dialog-backdrop" onMouseDown={handleCloseEditor}>
          <section
            aria-label="编辑碎碎念"
            aria-modal="true"
            className="journal-murmur-dialog"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                handleCloseEditor()
              }
            }}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="journal-murmur-dialog-header">
              <div>
                <span>正在编辑</span>
                <strong>{formatMurmurTime(editingMurmur.time)}</strong>
              </div>
              <button onClick={handleCloseEditor} type="button">
                完成
              </button>
            </header>

            <div className="journal-murmur-dialog-body">
              <label className="journal-murmur-body-field">
                <span>正文</span>
                <textarea
                  aria-label="碎碎念正文"
                  onChange={(event) =>
                    updateEditingMurmur((murmur) => ({ ...murmur, body: event.target.value }))
                  }
                  placeholder="这一刻发生了什么？"
                  ref={bodyTextareaRef}
                  value={editingMurmur.body}
                />
              </label>

              <div className="journal-murmur-actions">
                <button disabled={isImporting} onClick={() => void handleImportImages()} type="button">
                  <Camera aria-hidden="true" size={18} strokeWidth={2.15} />
                  {isImporting ? '放入中' : '加图片'}
                </button>
                <button onClick={handleDeleteEditingMurmur} type="button">
                  <Trash aria-hidden="true" size={17} strokeWidth={2.1} />
                  删掉这条
                </button>
              </div>

              {importError ? <p className="journal-murmur-error">{importError}</p> : null}

              {editingMurmur.images.length > 0 ? (
                <section className="journal-murmur-image-section">
                  <div className="journal-murmur-section-heading">
                    <span>图片</span>
                    <strong>{editingMurmur.images.length} 张</strong>
                  </div>
                  <MurmurImageGrid
                    images={editingMurmur.images}
                    onDelete={(imageId) =>
                      updateEditingMurmur((murmur) => ({
                        ...murmur,
                        images: murmur.images.filter((image) => image.id !== imageId),
                      }))
                    }
                  />
                </section>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  )
}

function MurmurDisplayCard({
  murmur,
  onDelete,
  onEdit,
}: {
  murmur: MurmurBlock
  onDelete: () => void
  onEdit: () => void
}) {
  const body = murmur.body.trim()

  return (
    <section className="journal-murmur-card">
      <div className="journal-murmur-card-header">
        <time dateTime={murmur.time}>{formatMurmurTime(murmur.time)}</time>
        <div className="journal-murmur-card-actions">
          <button onClick={onEdit} type="button">
            <Pencil aria-hidden="true" size={15} strokeWidth={2.1} />
            编辑
          </button>
          <button aria-label={`删除 ${formatMurmurTime(murmur.time)} 的碎碎念`} onClick={onDelete} type="button">
            <Trash aria-hidden="true" size={15} strokeWidth={2.05} />
            删除
          </button>
        </div>
      </div>
      {body ? <p className="journal-murmur-card-body">{murmur.body}</p> : null}
      {murmur.images.length > 0 ? <MurmurImageGrid images={murmur.images} /> : null}
      {!body && murmur.images.length === 0 ? <p className="journal-murmur-card-empty">空白碎碎念</p> : null}
    </section>
  )
}

function MurmurImageGrid({
  images,
  onDelete,
}: {
  images: ImageBlock[]
  onDelete?: (imageId: string) => void
}) {
  return (
    <div className="journal-murmur-images">
      {images.map((image) => (
        <MurmurImageTile
          image={image}
          key={image.id}
          onDelete={onDelete ? () => onDelete(image.id) : undefined}
        />
      ))}
    </div>
  )
}

function MurmurImageTile({
  image,
  onDelete,
}: {
  image: ImageBlock
  onDelete?: () => void
}) {
  return (
    <div className="journal-murmur-image-tile">
      <img
        alt={image.caption?.trim() || '碎碎念图片'}
        className="journal-murmur-image-preview"
        src={resolveJournalMediaSrc(image.src)}
      />
      {onDelete ? (
        <button aria-label="移除图片" onClick={onDelete} type="button">
          <Trash aria-hidden="true" size={15} strokeWidth={2.05} />
        </button>
      ) : null}
    </div>
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

function compareMurmursByNewest(first: MurmurBlock, second: MurmurBlock) {
  return getMurmurSortTime(second) - getMurmurSortTime(first)
}

function getMurmurSortTime(murmur: MurmurBlock) {
  const time = new Date(murmur.time).getTime()

  return Number.isNaN(time) ? 0 : time
}

export default JournalMurmurPanel
