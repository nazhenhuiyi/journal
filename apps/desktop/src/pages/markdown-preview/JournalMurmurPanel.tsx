import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, MessageSquareText, Pencil, Trash } from 'lucide-react'
import {
  orderMurmursByNewest,
  type ImageBlock,
  type ImageLocation,
  type MurmurBlock,
} from '@journal/core'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import ImagePreviewDialog, { type ImagePreviewItem } from '../../components/ImagePreviewDialog'
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
  const [previewImage, setPreviewImage] = useState<ImagePreviewItem | null>(null)
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const orderedMurmurs = useMemo(
    () => orderMurmursByNewest(murmurs),
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

  function handlePreviewImage(image: ImageBlock) {
    const alt = getImageAlt(image)

    setPreviewImage({
      alt,
      caption: image.caption,
      src: resolveJournalMediaSrc(image.src),
    })
  }

  return (
    <>
      <aside aria-label="碎碎念" className="journal-murmur-panel">
        <div className="journal-murmur-panel-header">
          <div>
            <p>碎碎念</p>
          </div>
          <Button onClick={handleCreateMurmur} size="sm" type="button" variant="outline">
            <MessageSquareText aria-hidden="true" size={18} strokeWidth={2.15} />
            添一条
          </Button>
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
                  onPreviewImage={handlePreviewImage}
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

        <Dialog
          open={isEditorOpen && Boolean(editingMurmur)}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseEditor()
            }
          }}
        >
          {editingMurmur ? (
            <DialogContent className="journal-murmur-dialog" showCloseButton={false}>
              <header className="journal-murmur-dialog-header">
                <div>
                  <span>正在编辑</span>
                  <DialogTitle>{formatMurmurTime(editingMurmur.time)}</DialogTitle>
                  <DialogDescription className="sr-only">
                    编辑这条碎碎念的正文和图片。
                  </DialogDescription>
                </div>
                <Button onClick={handleCloseEditor} size="sm" type="button" variant="outline">
                  完成
                </Button>
              </header>

              <div className="journal-murmur-dialog-body">
                <Label className="journal-murmur-body-field">
                  <span>正文</span>
                  <Textarea
                    aria-label="碎碎念正文"
                    className="journal-murmur-textarea border-border/50 bg-background/70 shadow-none focus-visible:border-ring/40 focus-visible:ring-1 focus-visible:ring-ring/20"
                    onChange={(event) =>
                      updateEditingMurmur((murmur) => ({ ...murmur, body: event.target.value }))
                    }
                    placeholder="这一刻发生了什么？"
                    ref={bodyTextareaRef}
                    value={editingMurmur.body}
                  />
                </Label>

                <div className="journal-murmur-actions">
                  <Button
                    disabled={isImporting}
                    onClick={() => void handleImportImages()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Camera aria-hidden="true" size={18} strokeWidth={2.15} />
                    {isImporting ? '放入中' : '加图片'}
                  </Button>
                  <Button onClick={handleDeleteEditingMurmur} size="sm" type="button" variant="destructive">
                    <Trash aria-hidden="true" size={17} strokeWidth={2.1} />
                    删掉这条
                  </Button>
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
                      onPreviewImage={handlePreviewImage}
                    />
                  </section>
                ) : null}
              </div>
            </DialogContent>
          ) : null}
        </Dialog>
      </aside>

      <ImagePreviewDialog image={previewImage} onClose={() => setPreviewImage(null)} />
    </>
  )
}

function MurmurDisplayCard({
  murmur,
  onDelete,
  onEdit,
  onPreviewImage,
}: {
  murmur: MurmurBlock
  onDelete: () => void
  onEdit: () => void
  onPreviewImage: (image: ImageBlock) => void
}) {
  const body = murmur.body.trim()

  return (
    <section className="journal-murmur-card">
      <div className="journal-murmur-card-header">
        <time dateTime={murmur.time}>{formatMurmurTime(murmur.time)}</time>
        <div className="journal-murmur-card-actions">
          <Button onClick={onEdit} size="sm" type="button" variant="outline">
            <Pencil aria-hidden="true" size={15} strokeWidth={2.1} />
            编辑
          </Button>
          <Button
            aria-label={`删除 ${formatMurmurTime(murmur.time)} 的碎碎念`}
            onClick={onDelete}
            size="sm"
            type="button"
            variant="destructive"
          >
            <Trash aria-hidden="true" size={15} strokeWidth={2.05} />
            删除
          </Button>
        </div>
      </div>
      {body ? <p className="journal-murmur-card-body">{murmur.body}</p> : null}
      {murmur.images.length > 0 ? (
        <MurmurImageGrid images={murmur.images} onPreviewImage={onPreviewImage} />
      ) : null}
      {!body && murmur.images.length === 0 ? <p className="journal-murmur-card-empty">空白碎碎念</p> : null}
    </section>
  )
}

function MurmurImageGrid({
  images,
  onDelete,
  onPreviewImage,
}: {
  images: ImageBlock[]
  onDelete?: (imageId: string) => void
  onPreviewImage: (image: ImageBlock) => void
}) {
  return (
    <div className="journal-murmur-images">
      {images.map((image) => (
        <MurmurImageTile
          image={image}
          key={image.id}
          onDelete={onDelete ? () => onDelete(image.id) : undefined}
          onPreview={() => onPreviewImage(image)}
        />
      ))}
    </div>
  )
}

function MurmurImageTile({
  image,
  onDelete,
  onPreview,
}: {
  image: ImageBlock
  onDelete?: () => void
  onPreview: () => void
}) {
  const alt = getImageAlt(image)

  return (
    <div className="journal-murmur-image-tile">
      <Button
        aria-label={`查看大图：${alt}`}
        className="journal-murmur-image-preview-button"
        onClick={onPreview}
        size="icon"
        type="button"
        variant="ghost"
      >
        <img
          alt={alt}
          className="journal-murmur-image-preview"
          src={resolveJournalMediaSrc(image.src)}
        />
      </Button>
      {onDelete ? (
        <Button
          aria-label="移除图片"
          className="journal-murmur-image-delete-button"
          onClick={onDelete}
          size="icon-sm"
          type="button"
          variant="destructive"
        >
          <Trash aria-hidden="true" size={15} strokeWidth={2.05} />
        </Button>
      ) : null}
    </div>
  )
}

function getImageAlt(image: ImageBlock) {
  return image.caption?.trim() || '碎碎念图片'
}

function createMurmur(date: string, existingMurmurs: MurmurBlock[]): MurmurBlock {
  const now = new Date()
  const baseId = `m_${date.split('-').join('')}_${formatTimeForId(now)}`
  const existingIds = new Set(existingMurmurs.map((murmur) => murmur.id))
  const id = createUniqueId(baseId, existingIds)

  return {
    id,
    time: now.toISOString(),
    themes: [],
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

export default JournalMurmurPanel
