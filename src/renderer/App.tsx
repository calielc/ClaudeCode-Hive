import { useEffect, useRef } from 'react'
import { addFolder, cycleTabs, focusSelected, newSession, selectedTab, setLayout, startMainWindow, undock } from './actions'
import { ContextMenu } from './components/ContextMenu'
import { PaneLayout, TopBar } from './components/Panes'
import { Sidebar } from './components/Sidebar'
import { UndockedView } from './components/UndockedView'
import type { LayoutMode } from './panes'
import { shortcutFor } from './shortcuts'
import { themeNamed } from './themes'
import { useStore } from './state'

const LAYOUT_ORDER: LayoutMode[] = ['single', 'sideBySide', 'stacked', 'grid']

export function App() {
  const hash = window.location.hash.slice(1)
  if (hash.startsWith('/terminal/')) {
    const [path, query] = hash.split('?')
    const id = path.slice('/terminal/'.length)
    return <UndockedView id={id} title={new URLSearchParams(query).get('title') ?? 'Hive'} />
  }
  return <MainView />
}

function MainView() {
  const themeName = useStore((state) => state.themeName)
  const selectedTabId = useStore((state) => state.selectedTabId)
  const layout = useStore((state) => state.layout)
  const hasTabs = useStore((state) => state.tabs.length > 0)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) {
      return undefined
    }
    started.current = true
    void startMainWindow()
    const onKey = (event: KeyboardEvent): void => {
      const action = shortcutFor(event)
      if (!action) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (action.type === 'cycle') {
        cycleTabs(action.backwards)
      } else if (action.type === 'newSession') {
        newSession()
      } else if (action.type === 'addFolder') {
        void addFolder()
      } else if (action.type === 'search') {
        window.dispatchEvent(new Event('hive:focus-search'))
      } else if (action.type === 'layout') {
        setLayout(LAYOUT_ORDER[action.index])
      } else if (action.type === 'undock') {
        const tab = selectedTab()
        if (tab) {
          undock(tab.id)
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    // Typing must work right away after Alt-Tab back to Hive. A search field in use keeps the focus.
    const onWindowFocus = (): void => {
      if (document.activeElement?.tagName !== 'INPUT') {
        focusSelected()
      }
    }
    window.addEventListener('focus', onWindowFocus)
    return undefined
  }, [])

  // The terminal of the selected pane gets the keyboard whenever the selection or the layout changes.
  useEffect(() => {
    const timers = [0, 80, 300].map((delay) => setTimeout(focusSelected, delay))
    return () => timers.forEach(clearTimeout)
  }, [selectedTabId, layout])

  return (
    <div className="app" data-theme={themeName} style={{ '--pane-bg': themeNamed(themeName).background } as React.CSSProperties}>
      <Sidebar />
      <main className="main">
        <TopBar />
        {hasTabs ? (
          <PaneLayout />
        ) : (
          <div className="no-session">
            <strong>No session open</strong>
            <span>Pick a session on the left or start a new one.</span>
          </div>
        )}
      </main>
      <ContextMenu />
    </div>
  )
}
