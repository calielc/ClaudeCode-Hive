export type LayoutMode = 'single' | 'sideBySide' | 'stacked' | 'grid'

export const CAPACITY: Record<LayoutMode, number> = { single: 1, sideBySide: 2, stacked: 2, grid: 4 }
export const MAX_PANES = 4

/** Which session shows in which pane. Everything here is data, so the rules can be tested without a window. */
export interface PaneState {
  /** Ids of the open tabs, in tab order. */
  tabIds: string[]
  /** Tabs that live in their own window. */
  detached: string[]
  /** The session in each pane (up to 4). Panes past the layout's capacity are empty. */
  slots: (string | null)[]
  /** The pane that gets the next session you pick. */
  activePane: number
  selectedTabId: string | null
  layout: LayoutMode
}

export function initialPaneState(layout: LayoutMode): PaneState {
  return { tabIds: [], detached: [], slots: Array(MAX_PANES).fill(null), activePane: 0, selectedTabId: null, layout }
}

const docked = (state: PaneState): string[] => state.tabIds.filter((id) => !state.detached.includes(id))

/**
 * Keeps the panes consistent: no closed or undocked tab in a pane, no tab twice, and no empty pane while a
 * docked tab is hidden. An empty pane gets the tab that follows the previous pane's tab, so a new split
 * shows: current tab first, then the next ones.
 */
export function normalize(state: PaneState): PaneState {
  const capacity = CAPACITY[state.layout]
  const available = docked(state)
  const next: (string | null)[] = Array(MAX_PANES).fill(null)
  const used = new Set<string>()
  for (let index = 0; index < capacity; index += 1) {
    const id = state.slots[index]
    if (id && available.includes(id) && !used.has(id)) {
      next[index] = id
      used.add(id)
    }
  }
  const nextUnused = (after: string | null): string | null => {
    const start = after ? available.indexOf(after) : -1
    for (let offset = 1; offset <= available.length; offset += 1) {
      const candidate = available[(start + offset) % available.length]
      if (!used.has(candidate)) {
        return candidate
      }
    }
    return null
  }
  for (let index = 0; index < capacity; index += 1) {
    if (next[index] === null) {
      const id = nextUnused(index > 0 ? next[index - 1] : state.selectedTabId)
      if (id) {
        next[index] = id
        used.add(id)
      }
    }
  }
  const activePane = Math.min(state.activePane, capacity - 1)
  let selectedTabId = state.selectedTabId
  if (selectedTabId === null || !state.tabIds.includes(selectedTabId)) {
    selectedTabId = next[activePane] ?? next.find((id) => id !== null) ?? null
  }
  return { ...state, slots: next, activePane, selectedTabId }
}

/** Click on a pane: it becomes the target for the next session you pick. */
export function selectPane(state: PaneState, pane: number): PaneState {
  if (pane >= CAPACITY[state.layout]) {
    return state
  }
  return { ...state, activePane: pane, selectedTabId: state.slots[pane] }
}

/** Puts a tab in a pane. A tab that is already in another pane swaps places with this pane's tab. */
export function show(state: PaneState, id: string, pane: number): PaneState {
  if (state.detached.includes(id) || pane >= CAPACITY[state.layout]) {
    return state
  }
  const slots = [...state.slots]
  const from = slots.indexOf(id)
  if (from >= 0 && from !== pane) {
    slots[from] = slots[pane]
  }
  slots[pane] = id
  return { ...normalize({ ...state, slots, activePane: pane }), selectedTabId: id }
}

/**
 * Click on a tab (top bar, session list or Ctrl+Tab).
 * - In its own window: select it, and the caller brings that window to the front.
 * - Already in a pane: only select that pane. Nothing moves.
 * - Not visible: it replaces the session in the selected pane.
 */
export function activate(state: PaneState, id: string): PaneState {
  if (state.detached.includes(id)) {
    return { ...state, selectedTabId: id }
  }
  const pane = state.slots.indexOf(id)
  if (pane >= 0 && pane < CAPACITY[state.layout]) {
    return selectPane(state, pane)
  }
  return show(state, id, state.activePane)
}

/** A new tab: the selected pane when it is empty, else the first empty pane, else it replaces the selected pane. */
export function addTab(state: PaneState, id: string): PaneState {
  const withTab = { ...state, tabIds: [...state.tabIds, id] }
  let target = withTab.activePane
  if (withTab.slots[target] !== null) {
    const empty = withTab.slots.slice(0, CAPACITY[withTab.layout]).findIndex((slot) => slot === null)
    if (empty >= 0) {
      target = empty
    }
  }
  return show(withTab, id, target)
}

export function removeTab(state: PaneState, id: string): PaneState {
  return normalize({
    ...state,
    tabIds: state.tabIds.filter((item) => item !== id),
    detached: state.detached.filter((item) => item !== id),
    slots: state.slots.map((slot) => (slot === id ? null : slot)),
    selectedTabId: state.selectedTabId === id ? null : state.selectedTabId
  })
}

export function setLayout(state: PaneState, layout: LayoutMode): PaneState {
  const slots = [...state.slots]
  let activePane = state.activePane
  // When the layout shrinks, the active pane's session moves to the first pane.
  if (activePane >= CAPACITY[layout]) {
    const moved = slots[activePane]
    slots[activePane] = slots[0]
    slots[0] = moved
    activePane = 0
  }
  return normalize({ ...state, layout, slots, activePane })
}

export function detach(state: PaneState, id: string): PaneState {
  return normalize({ ...state, detached: [...state.detached, id] })
}

/** Back in the main window: into an empty pane, or else into the active pane. */
export function dockBack(state: PaneState, id: string): PaneState {
  const next = normalize({ ...state, detached: state.detached.filter((item) => item !== id) })
  return next.slots.includes(id) ? { ...next, selectedTabId: id } : show(next, id, next.activePane)
}

/** Ctrl+Tab goes to the next tab, Ctrl+Shift+Tab to the previous one. It wraps around. */
export function cycle(state: PaneState, backwards: boolean): string | null {
  if (state.tabIds.length < 2) {
    return null
  }
  const current = state.tabIds.indexOf(state.selectedTabId ?? '')
  const start = current === -1 ? (backwards ? 0 : -1) : current
  const count = state.tabIds.length
  return state.tabIds[(start + (backwards ? -1 : 1) + count) % count]
}

/** Moves a tab to just before or just after another tab. The panes keep their sessions. */
export function moveTab(state: PaneState, id: string, targetId: string, after: boolean): PaneState {
  if (id === targetId || !state.tabIds.includes(id)) {
    return state
  }
  const others = state.tabIds.filter((item) => item !== id)
  const index = others.indexOf(targetId)
  if (index < 0) {
    return state
  }
  const insertAt = after ? index + 1 : index
  return { ...state, tabIds: [...others.slice(0, insertAt), id, ...others.slice(insertAt)] }
}

/** Moves a tab to the end of the list. */
export function moveTabToEnd(state: PaneState, id: string): PaneState {
  if (!state.tabIds.includes(id)) {
    return state
  }
  return { ...state, tabIds: [...state.tabIds.filter((item) => item !== id), id] }
}
