import { MotionConfig } from 'motion/react'
import MarkdownPreviewPage from './pages/MarkdownPreviewPage'

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <MarkdownPreviewPage />
    </MotionConfig>
  )
}

export default App
