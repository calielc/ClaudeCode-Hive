import type { PaneState } from './panes'

export interface Tab {
  id: string
  folder: string
  title: string
  /** True for a session that already exists, false for a new one. */
  resume: boolean
}

/**
 * The open tabs and which pane shows which. Saved in the session storage of the window, so a reload of the page
 * (hot reload while developing, or Cmd+R) can show the same tabs again. The processes behind them keep running
 * in the main process, and the restored terminals attach to them again.
 */
export interface SavedSession extends Pick<PaneState, 'tabIds' | 'detached' | 'slots' | 'activePane' | 'selectedTabId'> {
  tabs: Tab[]
}

const KEY = 'hive.session.v1'
const PANES = 4

const isString = (value: unknown): value is string => typeof value === 'string'

/** Reads a saved session. Anything that does not fit is dropped, so a bad value can never break the start. */
export function parseSession(raw: string | null): SavedSession | null {
  if (!raw) {
    return null
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const saved = value as Record<string, unknown>
  if (!Array.isArray(saved.tabs)) {
    return null
  }
  const tabs: Tab[] = []
  for (const item of saved.tabs as Record<string, unknown>[]) {
    if (item && isString(item.id) && isString(item.folder) && isString(item.title) && !tabs.some((tab) => tab.id === item.id)) {
      tabs.push({ id: item.id, folder: item.folder, title: item.title, resume: item.resume !== false })
    }
  }
  const known = new Set(tabs.map((tab) => tab.id))
  const idList = (list: unknown): string[] => (Array.isArray(list) ? list.filter((id): id is string => isString(id) && known.has(id)) : [])
  const tabIds = tabs.map((tab) => tab.id)
  const rawSlots = Array.isArray(saved.slots) ? saved.slots : []
  const slots = Array.from({ length: PANES }, (_, index) => {
    const id = rawSlots[index]
    return isString(id) && known.has(id) ? id : null
  })
  const selected = isString(saved.selectedTabId) && known.has(saved.selectedTabId) ? saved.selectedTabId : null
  const activePane = typeof saved.activePane === 'number' && saved.activePane >= 0 && saved.activePane < PANES ? saved.activePane : 0
  return { tabs, tabIds, detached: idList(saved.detached), slots, activePane, selectedTabId: selected }
}

export function loadSession(): SavedSession | null {
  try {
    return parseSession(sessionStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function saveSession(session: SavedSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // Storage can be full or blocked. The app still works without it.
  }
}
