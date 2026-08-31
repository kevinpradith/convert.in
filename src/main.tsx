import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import './index.css'

const root = document.getElementById('root')!

/*
  scripts/prerender.mts leaves the hero in the HTML so there is something to
  look at, and something to measure a largest paint against, before this file
  has finished arriving. Those nodes have already played the entrance animation
  by the time React replaces them with its own, and the replacements would play
  it again: the hero would rise into place a second time, a second or so after
  it first settled. The flag is what index.css reads to skip it, and it is set
  before the render rather than after so the new nodes never get the animation
  at all instead of having it taken off them a frame later.
*/
if (root.hasChildNodes()) document.documentElement.dataset.prerendered = ''

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
