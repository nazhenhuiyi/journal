import type { Annotation } from '../../domain/annotations'
import { annotationKinds } from './constants'
import { brand } from '../../brand'

const annotationKindStyles: Record<Annotation['kind'], string> = {
  observation: 'text-sage',
  question: 'text-walnut/75',
  format: 'text-walnut/70',
  spelling: 'text-ink/50',
}

type AnnotationSidebarProps = {
  activeAnnotationId: string
  annotations: Annotation[]
  onChatWithAnnotation: (annotationId: string) => void
  onSelectAnnotation: (annotationId: string) => void
}

function AnnotationSidebar({
  activeAnnotationId,
  annotations,
  onChatWithAnnotation,
  onSelectAnnotation,
}: AnnotationSidebarProps) {
  return (
    <aside className="annotation-sidebar border-l border-walnut/10 bg-[#f7f3ea]/70 px-5 py-5">
      <div className="sticky top-5">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold leading-none text-ink">
              {brand.assistantName}
            </h2>
          </div>
          <span className="mb-0.5 text-xs font-medium text-ink/40">
            {annotations.length} 条
          </span>
        </div>

        <div className="divide-y divide-walnut/8">
          {annotations.map((annotation) => {
            const isActive = annotation.id === activeAnnotationId

            return (
              <div
                key={annotation.id}
                className={`group relative w-full overflow-hidden px-4 py-4 text-left ${
                  isActive
                    ? 'bg-white/38'
                    : 'bg-transparent hover:bg-white/28'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-4 left-0 w-0.5 rounded-r-full ${
                    isActive ? 'bg-sage/85' : 'bg-transparent'
                  }`}
                />
                <button
                  aria-pressed={isActive}
                  className="block w-full text-left"
                  onClick={() => onSelectAnnotation(annotation.id)}
                  type="button"
                >
                  <span
                    className={`block text-[0.68rem] font-semibold leading-none ${
                      annotationKindStyles[annotation.kind]
                    }`}
                  >
                    {annotationKinds[annotation.kind]}
                  </span>
                  <span className="mt-2.5 block text-[0.9rem] leading-[1.65] text-ink/68">
                    {annotation.body.content}
                  </span>
                </button>
                <button
                  className="mt-2.5 text-xs font-semibold text-walnut/65 opacity-0 underline decoration-walnut/20 underline-offset-4 hover:text-ink group-hover:opacity-100 group-focus-within:opacity-100"
                  onClick={() => onChatWithAnnotation(annotation.id)}
                  type="button"
                >
                  沿着聊
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

export default AnnotationSidebar
