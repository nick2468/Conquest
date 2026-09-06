import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './ui/App'
import './ui/styles.css'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('index.html is missing the element with id "root".')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
