import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

export type ImagePreviewItem = {
  alt: string
  caption?: string | null
  src: string
}

type ImagePreviewDialogProps = {
  image: ImagePreviewItem | null
  onClose: () => void
}

function ImagePreviewDialog({
  image,
  onClose,
}: ImagePreviewDialogProps) {
  const caption = image?.caption?.trim()

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
      }}
      open={Boolean(image)}
    >
      <DialogContent
        className="journal-image-preview-content"
        onClick={onClose}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">图片预览</DialogTitle>
        <DialogClose asChild>
          <Button
            aria-label="关闭图片预览"
            className="journal-image-preview-close"
            onClick={(event) => event.stopPropagation()}
            size="icon-lg"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" size={24} strokeWidth={2.2} />
          </Button>
        </DialogClose>

        {image ? (
          <div className="journal-image-preview-stage">
            <img
              alt={image.alt}
              className="journal-image-preview-full"
              onClick={(event) => event.stopPropagation()}
              src={image.src}
            />
          </div>
        ) : null}

        <DialogDescription
          className={caption ? 'journal-image-preview-caption' : 'sr-only'}
          onClick={(event) => event.stopPropagation()}
        >
          {caption || image?.alt || '查看这张碎碎念图片的大图。'}
        </DialogDescription>
      </DialogContent>
    </Dialog>
  )
}

export default ImagePreviewDialog
