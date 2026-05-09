import { motion } from 'motion/react'
import CardStyleShowcase from './all-pages/CardStyleShowcase'
import { panelTransition } from './markdown-preview/constants'

function ComponentGalleryPage() {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="component-gallery-page flex-1"
      initial={{ opacity: 0, y: 10 }}
      transition={panelTransition}
    >
      <CardStyleShowcase />
    </motion.div>
  )
}

export default ComponentGalleryPage
