import { useEffect } from 'react'
import { activateTab, closeTab, dock, setTag, undock } from '../actions'
import { setState, useStore } from '../state'
import { TAGS } from '../themes'

/** The right-click menu of a session: colour, and for an open tab undock, dock and close. */
export function ContextMenu() {
  const menu = useStore((state) => state.contextMenu)
  const tabs = useStore((state) => state.tabs)
  const detached = useStore((state) => state.detached)
  const tags = useStore((state) => state.tags)

  useEffect(() => {
    if (!menu) {
      return undefined
    }
    const close = (): void => setState({ contextMenu: null })
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (!menu) {
    return null
  }
  const tab = tabs.find((item) => item.id === menu.sessionId)
  const isDetached = detached.includes(menu.sessionId)
  const current = tags[menu.sessionId]
  const run = (action: () => void) => () => {
    setState({ contextMenu: null })
    action()
  }
  const left = Math.min(menu.x, window.innerWidth - 220)
  const top = Math.min(menu.y, window.innerHeight - 200)

  return (
    <div className="menu-backdrop" onMouseDown={() => setState({ contextMenu: null })} onContextMenu={(event) => event.preventDefault()}>
      <div className="menu" style={{ left, top }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="menu-label">Colour</div>
        <div className="swatches">
          {TAGS.map((tag) => (
            <button
              key={tag.id}
              className={`swatch ${current === tag.id ? 'chosen' : ''}`}
              style={{ background: tag.color }}
              title={tag.title}
              onClick={run(() => setTag([menu.sessionId], tag.id))}
            >
              {current === tag.id ? '✓' : ''}
            </button>
          ))}
        </div>
        {current && (
          <button className="menu-item" onClick={run(() => setTag([menu.sessionId], null))}>
            No colour
          </button>
        )}
        {tab && (
          <>
            <div className="menu-separator" />
            <button className="menu-item" onClick={run(() => activateTab(tab.id))}>
              Go to tab
            </button>
            {isDetached ? (
              <button className="menu-item" onClick={run(() => dock(tab.id))}>
                Dock into the main window
              </button>
            ) : (
              <button className="menu-item" onClick={run(() => undock(tab.id))}>
                Undock into its own window
              </button>
            )}
            <button className="menu-item" onClick={run(() => closeTab(tab.id))}>
              Close tab
            </button>
          </>
        )}
      </div>
    </div>
  )
}
