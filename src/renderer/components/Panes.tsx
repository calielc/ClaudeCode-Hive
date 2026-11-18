import { useLayoutEffect, useRef, type DragEvent, type MouseEvent, type PointerEvent } from 'react'
import { activateTab, closeTab, dropOnPane, newSession, selectPane, setLayout, setSplit, setTheme, undock } from '../actions'
import { CAPACITY, type LayoutMode } from '../panes'
import { setState, useStore } from '../state'
import { fitEntry, getEntry, mountEntry, unmountEntry } from '../terminals'
import { endOfListProps, reorderProps } from './reorder'
import { tagColor, THEMES } from '../themes'

const LAYOUTS: { mode: LayoutMode; title: string; icon: string }[] = [
  { mode: 'single', title: 'Single pane', icon: '▢' },
  { mode: 'sideBySide', title: 'Side by side', icon: '◫' },
  { mode: 'stacked', title: 'Stacked', icon: '⬒' },
  { mode: 'grid', title: 'Grid (2×2)', icon: '▦' }
]

export function TopBar() {
  const layout = useStore((state) => state.layout)
  const themeName = useStore((state) => state.themeName)
  return (
    <div className="topbar">
      <button className="new-session" onClick={newSession} title="New session in the selected folder">
        + New Session
      </button>
      <TabBar />
      <select className="theme-select" value={themeName} onChange={(event) => setTheme(event.target.value)} title="Terminal colour theme">
        {THEMES.map((theme) => (
          <option key={theme.name} value={theme.name}>
            {theme.name}
          </option>
        ))}
      </select>
      <div className="layouts">
        {LAYOUTS.map((item) => (
          <button key={item.mode} className={layout === item.mode ? 'active' : ''} title={item.title} onClick={() => setLayout(item.mode)}>
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

function TabBar() {
  const tabs = useStore((state) => state.tabs)
  const slots = useStore((state) => state.slots)
  const selected = useStore((state) => state.selectedTabId)
  const detached = useStore((state) => state.detached)
  const layout = useStore((state) => state.layout)
  const tags = useStore((state) => state.tags)
  const tabDrop = useStore((state) => state.tabDrop)
  // The bar scrolls sideways only when the tabs do not fit. Its scroll stops at the ends.
  return (
    <div className="tabs" {...endOfListProps()}>
      {tabs.map((tab) => {
        const pane = slots.indexOf(tab.id)
        const color = tagColor(tags[tab.id])
        return (
          <div
            key={tab.id}
            className={`tab ${selected === tab.id ? 'selected' : ''} ${tabDrop?.id === tab.id ? (tabDrop.after ? 'drop-after' : 'drop-before') : ''}`}
            style={color ? { background: `${color}59` } : undefined}
            {...reorderProps(tab.id, 'x')}
            onClick={() => activateTab(tab.id)}
            onContextMenu={(event: MouseEvent) => {
              event.preventDefault()
              setState({ contextMenu: { x: event.clientX, y: event.clientY, sessionId: tab.id } })
            }}
          >
            {detached.includes(tab.id) && <span title="In its own window">▣</span>}
            {layout !== 'single' && pane >= 0 && pane < CAPACITY[layout] && <span className="pane-badge">{pane + 1}</span>}
            <span className="tab-title">{tab.title}</span>
            <button
              className="tab-close"
              onClick={(event) => {
                event.stopPropagation()
                closeTab(tab.id)
              }}
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** The terminal of a session. The terminal view is moved in here, and fits itself to the size of the pane. */
export function TerminalHost({ tabId }: { tabId: string }) {
  const container = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = container.current
    const entry = getEntry(tabId)
    if (!element || !entry) {
      return undefined
    }
    mountEntry(entry, element)
    const observer = new ResizeObserver(() => fitEntry(entry))
    observer.observe(element)
    return () => {
      observer.disconnect()
      unmountEntry(entry, element)
    }
  }, [tabId])
  return <div className="terminal-container" ref={container} />
}

function paneDropProps(index: number) {
  return {
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes('text/hive-session')) {
        event.preventDefault()
        setState({ dropTarget: index })
      }
    },
    onDragLeave: () => setState((current) => (current.dropTarget === index ? { dropTarget: null } : {})),
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      const id = event.dataTransfer.getData('text/hive-session')
      if (id) {
        dropOnPane(id, index)
      }
    }
  }
}

function Pane({ index }: { index: number }) {
  const tabId = useStore((state) => state.slots[index])
  const tab = useStore((state) => state.tabs.find((item) => item.id === state.slots[index]))
  const active = useStore((state) => state.activePane === index && state.layout !== 'single')
  const dropTarget = useStore((state) => state.dropTarget === index)
  const sessionState = useStore((state) => state.openSessions.find((item) => item.id === state.slots[index])?.state ?? 'ready')
  const tag = useStore((state) => (state.slots[index] ? state.tags[state.slots[index]] : undefined))
  const color = tagColor(tag)
  const classes = `pane ${active ? 'active' : ''} ${dropTarget ? 'drop' : ''} state-${sessionState}`
  if (!tabId || !tab) {
    return (
      <div className={`${classes} empty`} onClick={() => selectPane(index)} {...paneDropProps(index)}>
        <div className="empty-text">
          <strong>Empty pane</strong>
          <span>Pick a session on the left, or drop one here.</span>
        </div>
      </div>
    )
  }
  return (
    <div className={classes} {...paneDropProps(index)}>
      <div className="pane-header" style={color ? { background: `${color}59` } : undefined} onMouseDown={() => selectPane(index)} onContextMenu={(event) => {
        event.preventDefault()
        setState({ contextMenu: { x: event.clientX, y: event.clientY, sessionId: tab.id } })
      }}>
        <i className={`dot ${sessionState}`} />
        <span className="pane-title">{tab.title}</span>
        <button title="Undock into its own window" onClick={() => undock(tab.id)}>⇱</button>
        <button title="Close session" onClick={() => closeTab(tab.id)}>✕</button>
      </div>
      <div className="pane-body" onMouseDown={() => selectPane(index)}>
        <TerminalHost tabId={tabId} />
      </div>
    </div>
  )
}

/** A draggable divider. `axis` x is a vertical line that moves left and right. */
function Splitter({ axis, container }: { axis: 'x' | 'y'; container: React.RefObject<HTMLDivElement | null> }) {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const move = (moveEvent: globalThis.PointerEvent): void => {
      const rect = container.current?.getBoundingClientRect()
      if (!rect) {
        return
      }
      if (axis === 'x') {
        setSplit({ splitX: (moveEvent.clientX - rect.left) / rect.width })
      } else {
        setSplit({ splitY: (moveEvent.clientY - rect.top) / rect.height })
      }
    }
    const up = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }
  return <div className={`splitter splitter-${axis}`} onPointerDown={onPointerDown} />
}

export function PaneLayout() {
  const layout = useStore((state) => state.layout)
  const splitX = useStore((state) => state.splitX)
  const splitY = useStore((state) => state.splitY)
  const container = useRef<HTMLDivElement>(null)
  const columns = `${splitX}fr 8px ${1 - splitX}fr`
  const rows = `${splitY}fr 8px ${1 - splitY}fr`
  const cell = (row: number, column: number): React.CSSProperties => ({ gridRow: row, gridColumn: column })

  return (
    <div className="panes" ref={container} style={
      layout === 'single' ? { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
      : layout === 'sideBySide' ? { gridTemplateColumns: columns, gridTemplateRows: '1fr' }
      : layout === 'stacked' ? { gridTemplateColumns: '1fr', gridTemplateRows: rows }
      : { gridTemplateColumns: columns, gridTemplateRows: rows }
    }>
      {layout === 'single' && <Pane index={0} />}
      {layout === 'sideBySide' && (
        <>
          <div style={cell(1, 1)} className="slot"><Pane index={0} /></div>
          <div style={cell(1, 2)} className="slot"><Splitter axis="x" container={container} /></div>
          <div style={cell(1, 3)} className="slot"><Pane index={1} /></div>
        </>
      )}
      {layout === 'stacked' && (
        <>
          <div style={cell(1, 1)} className="slot"><Pane index={0} /></div>
          <div style={cell(2, 1)} className="slot"><Splitter axis="y" container={container} /></div>
          <div style={cell(3, 1)} className="slot"><Pane index={1} /></div>
        </>
      )}
      {layout === 'grid' && (
        <>
          <div style={cell(1, 1)} className="slot"><Pane index={0} /></div>
          <div style={cell(1, 3)} className="slot"><Pane index={1} /></div>
          <div style={cell(3, 1)} className="slot"><Pane index={2} /></div>
          <div style={cell(3, 3)} className="slot"><Pane index={3} /></div>
          <div style={{ gridRow: '1 / 4', gridColumn: 2 }} className="slot"><Splitter axis="x" container={container} /></div>
          <div style={{ gridRow: 2, gridColumn: '1 / 4' }} className="slot"><Splitter axis="y" container={container} /></div>
        </>
      )}
    </div>
  )
}
