import { MotionConfig } from 'motion/react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { SketchSessionProvider } from './domain/sketch'
import AppLayout from './layouts/AppLayout'
import AllPagesHomePage from './pages/AllPagesHomePage'
import MarkdownPreviewPage from './pages/MarkdownPreviewPage'
import SettingsPage from './pages/SettingsPage'
import SketchPage from './pages/sketch/SketchPage'

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <SketchSessionProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route element={<Navigate to="/pages" replace />} index />
              <Route element={<AllPagesHomePage />} path="/pages" />
              <Route element={<MarkdownPreviewPage />} path="/preview" />
              <Route element={<SketchPage />} path="/sketch" />
              <Route element={<SettingsPage />} path="/settings" />
              <Route element={<Navigate to="/pages" replace />} path="*" />
            </Route>
          </Routes>
        </HashRouter>
      </SketchSessionProvider>
    </MotionConfig>
  )
}

export default App
