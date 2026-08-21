import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import App from './App.tsx'
import { applyTheme, loadTheme } from './ui/prefs.ts'
import './index.css'

// pdf.js parses and rasterises on its own worker thread; without this the main
// thread does it and the UI stops responding on anything but a tiny document.
GlobalWorkerOptions.workerSrc = workerSrc

// Set before the first paint, or a remembered dark theme flashes light first.
applyTheme(loadTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
