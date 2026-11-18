import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as actions from './actions'
import { App } from './App'
import { followOtherWindows, getState } from './state'
import './styles.css'

followOtherWindows()
if (window.hive.debug) {
  ;(window as unknown as Record<string, unknown>).__hive = { ...actions, getState }
}
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
