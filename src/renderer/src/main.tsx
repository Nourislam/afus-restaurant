import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

/* On a computer the program owns its window and plain paths are fine. The web
   demo is served from a folder of a static site, where /pos is not a page, so
   there it navigates by hash. */
const Router = typeof window !== 'undefined' && window.__AFUS_WEB_DEMO__ ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>
)
