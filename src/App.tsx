import { MotionConfig } from 'motion/react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import AppLayout from './layouts/AppLayout'
import AllPagesHomePage from './pages/AllPagesHomePage'
import MarkdownPreviewPage from './pages/MarkdownPreviewPage'

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route element={<Navigate to="/pages" replace />} index />
            <Route element={<AllPagesHomePage />} path="/pages" />
            <Route element={<MarkdownPreviewPage />} path="/preview" />
            <Route element={<Navigate to="/pages" replace />} path="*" />
          </Route>
        </Routes>
      </HashRouter>
    </MotionConfig>
  )
}

export default App
