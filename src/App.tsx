import { MotionConfig } from 'motion/react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import MarkdownPreviewPage from './pages/MarkdownPreviewPage'

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <Routes>
          <Route element={<Navigate to="/preview" replace />} index />
          <Route element={<MarkdownPreviewPage />} path="/preview" />
          <Route element={<Navigate to="/preview" replace />} path="*" />
        </Routes>
      </HashRouter>
    </MotionConfig>
  )
}

export default App
