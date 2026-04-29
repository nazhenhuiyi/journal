import { useContext } from 'react'
import { SketchSessionContext } from './sessionContext'

export function useSketchSession() {
  const context = useContext(SketchSessionContext)

  if (!context) {
    throw new Error('useSketchSession must be used inside SketchSessionProvider')
  }

  return context
}
