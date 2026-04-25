import { motion } from 'motion/react'
import type { Annotation } from '../../domain/annotations'
import { annotationKinds, listTransition, panelTransition } from './constants'

type AnnotationSidebarProps = {
  activeAnnotationId: string
  annotations: Annotation[]
  onSelectAnnotation: (annotationId: string) => void
}

function AnnotationSidebar({
  activeAnnotationId,
  annotations,
  onSelectAnnotation,
}: AnnotationSidebarProps) {
  return (
    <motion.aside
      animate={{ opacity: 1, x: 0 }}
      className="border-t border-walnut/10 bg-white/70 px-4 py-5 lg:border-l lg:border-t-0"
      initial={{ opacity: 0, x: 14 }}
      transition={{ ...panelTransition, delay: 0.14 }}
    >
      <div className="sticky top-5">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase text-sage">Annotations</p>
          <h2 className="mt-2 font-display text-xl font-semibold text-ink">批注</h2>
        </div>

        <motion.div
          animate="visible"
          className="space-y-3"
          initial="hidden"
          variants={{
            hidden: {},
            visible: {
              transition: {
                delayChildren: 0.18,
                staggerChildren: 0.035,
              },
            },
          }}
        >
          {annotations.map((annotation) => {
            const isActive = annotation.id === activeAnnotationId

            return (
              <motion.button
                key={annotation.id}
                animate={{ opacity: 1, scale: isActive ? 1.012 : 1, y: 0 }}
                aria-pressed={isActive}
                className={`w-full border px-4 py-3 text-left transition ${
                  isActive
                    ? 'border-sage bg-sage/10 shadow-sm'
                    : 'border-walnut/10 bg-[#fbf8ef] hover:border-sage/40 hover:bg-white'
                }`}
                initial={{ opacity: 0, y: 8 }}
                layout
                onClick={() => onSelectAnnotation(annotation.id)}
                transition={listTransition}
                type="button"
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0 },
                }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
              >
                <span className="text-xs font-semibold text-sage">{annotationKinds[annotation.kind]}</span>
                <span className="mt-2 block text-sm leading-6 text-ink/75">{annotation.body.content}</span>
              </motion.button>
            )
          })}
        </motion.div>
      </div>
    </motion.aside>
  )
}

export default AnnotationSidebar
