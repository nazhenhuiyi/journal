import type { Transition } from 'motion/react'
import type { Annotation } from '@journal/core'

export const panelTransition: Transition = { duration: 0.34, ease: [0.22, 1, 0.36, 1] }
export const listTransition: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] }

export const annotationKinds: Record<Annotation['kind'], string> = {
  observation: '观察',
  question: '追问',
  format: '结构',
  spelling: '校对',
}
