import { useSyncExternalStore } from 'react'
import type { HooksStatus, SessionInfo, UsageSnapshot } from '@shared/types'
import { initialPaneState, type LayoutMode, type PaneState } from './panes'

export interface Tab {
  id: string
  folder: string
  title: string
  /** True for a session that already exists, false for a new one. */
  resume: boolean
}

export interface ContextMenuState {
  x: number
  y: number
  sessionId: string
}

export interface State extends PaneState {
  folders: string[]
  selectedFolder: string
  tabs: Tab[]
  themeName: string
  tags: Record<string, string>
  /** Where the vertical and the horizontal divider are, from 0 to 1. */
  splitX: number
  splitY: number
  query: string
  sessions: SessionInfo[]
  openSessions: SessionInfo[]
  isLoading: boolean
  contentMatches: string[]
  isSearching: boolean
  usage: UsageSnapshot | null
  hooks: HooksStatus | null
  dropTarget: number | null
  contextMenu: ContextMenuState | null
}

const STORAGE_KEY = 'hive.settings.v1'

interface Saved {
  folders?: string[]
  selectedFolder?: string
  layout?: LayoutMode
  themeName?: string
  tags?: Record<string, string>
  splitX?: number
  splitY?: number
}

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Saved
  } catch {
    return {}
  }
}

export function createInitialState(): State {
  const saved = load()
  const home = window.hive.home
  const folders = saved.folders?.length ? saved.folders : [home]
  return {
    ...initialPaneState(saved.layout ?? 'single'),
    folders,
    selectedFolder: saved.selectedFolder && folders.includes(saved.selectedFolder) ? saved.selectedFolder : folders[0],
    tabs: [],
    themeName: saved.themeName ?? 'Tokyo Night',
    tags: saved.tags ?? {},
    splitX: saved.splitX ?? 0.5,
    splitY: saved.splitY ?? 0.5,
    query: '',
    sessions: [],
    openSessions: [],
    isLoading: true,
    contentMatches: [],
    isSearching: false,
    usage: null,
    hooks: null,
    dropTarget: null,
    contextMenu: null
  }
}

let state: State = createInitialState()
const listeners = new Set<() => void>()

export function getState(): State {
  return state
}

export function setState(update: Partial<State> | ((current: State) => Partial<State>)): void {
  const patch = typeof update === 'function' ? update(state) : update
  state = { ...state, ...patch }
  persist()
  for (const listener of listeners) {
    listener()
  }
}

function persist(): void {
  const saved: Saved = {
    folders: state.folders,
    selectedFolder: state.selectedFolder,
    layout: state.layout,
    themeName: state.themeName,
    tags: state.tags,
    splitX: state.splitX,
    splitY: state.splitY
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  } catch {
    // Storage can be full or blocked. The app still works without it.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reads a part of the state. The selector must give back the same value when nothing changed. */
export function useStore<T>(selector: (current: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

/** A second window (an undocked terminal) must follow the settings that the main window changes. */
export function followOtherWindows(): void {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      const saved = load()
      state = { ...state, themeName: saved.themeName ?? state.themeName, tags: saved.tags ?? state.tags }
      for (const listener of listeners) {
        listener()
      }
    }
  })
}
