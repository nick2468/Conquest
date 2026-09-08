import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '../ui/styles.css'
import { MapPage } from './MapPage'

/**
 * The map on its own, a third page beside the game and the editor.
 *
 * Nick: "We need to work on the map in isolation of the game engine. Show
 * me the map only." So this page draws a map with no game behind it: no
 * players, no counts, every place tinted with its continent's colour.
 */
const root = document.getElementById('root')

if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <MapPage />
    </StrictMode>,
  )
}
