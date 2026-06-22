import { MotionConfig } from 'motion/react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import AppLayout from './layouts/AppLayout'
import CalendarPage from './pages/CalendarPage'
import MarkdownPreviewPage from './pages/MarkdownPreviewPage'
import SettingsPage from './pages/SettingsPage'
import { DesktopAppearanceProvider } from './services/appearance'

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <DesktopAppearanceProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route element={<Navigate to="/preview" replace />} index />
              <Route element={<MarkdownPreviewPage />} path="/preview" />
              <Route element={<CalendarPage />} path="/calendar" />
              <Route element={<SettingsPage />} path="/settings" />
              <Route element={<Navigate to="/preview" replace />} path="*" />
            </Route>
          </Routes>
        </HashRouter>
      </DesktopAppearanceProvider>
    </MotionConfig>
  )
}

export default App
