import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../ui/styles.css'
import './editor.css'
import { EditorApp } from './EditorApp'

/**
 * The map editor, a second page beside the game. Plan task 5.9.
 *
 * It ships with the game rather than living somewhere else, so it works
 * with no internet, needs nothing installed, and is one link away from the
 * game it makes maps for.
 */
const root = document.getElementById('root')

if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <EditorApp />
    </StrictMode>,
  )
}
