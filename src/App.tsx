import { MotionConfig } from 'motion/react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import AppLayout from './layouts/AppLayout'
import CalendarPage from './pages/CalendarPage'
import MarkdownPreviewPage from './pages/MarkdownPreviewPage'

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route element={<Navigate to="/preview" replace />} index />
            <Route element={<MarkdownPreviewPage />} path="/preview" />
            <Route element={<CalendarPage />} path="/calendar" />
            <Route element={<Navigate to="/preview" replace />} path="*" />
          </Route>
        </Routes>
      </HashRouter>
    </MotionConfig>
  )
}

export default App
