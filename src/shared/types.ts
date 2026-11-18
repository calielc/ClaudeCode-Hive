export type SessionState = 'working' | 'waiting' | 'ready'

export interface AgentInfo {
  id: string
  description: string
  model?: string
}

/** Extra facts for the cards of open sessions. */
export interface SessionDetails {
  model?: string
  branch?: string
  repo?: string
  lastPrompt?: string
  agents: AgentInfo[]
}

export interface SessionInfo {
  id: string
  title: string
  /** Milliseconds since 1970. */
  modified: number
  state: SessionState
  details?: SessionDetails
}

/** A session that is open in a tab. The tab can belong to another folder than the selected one. */
export interface OpenTabRef {
  id: string
  folder: string
  title: string
}

export interface ScanResult {
  sessions: SessionInfo[]
  open: SessionInfo[]
}

export interface UsageWindow {
  label: string
  percent: number | null
  /** Milliseconds since 1970. */
  resetsAt: number | null
}

export interface UsageSnapshot {
  windows: UsageWindow[]
  /** Milliseconds since 1970. */
  updatedAt: number
}

export interface HooksStatus {
  hooksInstalled: boolean
  usageInstalled: boolean
}

export interface PtyAttachOptions {
  folder: string
  resume: boolean
  cols: number
  rows: number
}

export interface PtyAttachResult {
  /** What the terminal printed so far, so a new view can show the same screen. */
  buffer: string
  created: boolean
}

export interface PtyExit {
  id: string
  exitCode: number
  ranMs: number
}

/** The API the preload script puts on `window.hive`. */
export interface HiveApi {
  platform: string
  /** True when Hive runs with HIVE_DEBUG=1, so tests can drive the window. */
  debug: boolean
  home: string
  /** The folder Hive starts with: ~/code when it exists, else the home folder. */
  defaultFolder(): Promise<string>
  scan(folder: string, open: OpenTabRef[]): Promise<ScanResult>
  search(folder: string, text: string): Promise<string[]>
  readUsage(): Promise<UsageSnapshot | null>
  hooksStatus(): Promise<HooksStatus>
  installHooks(): Promise<HooksStatus>
  pickFolder(): Promise<string | null>
  setOpenTabs(tabs: OpenTabRef[]): void
  /** Opens a web link in the default browser of the system, where the user is already logged in. */
  openExternal(url: string): void
  pty: {
    attach(id: string, options: PtyAttachOptions): Promise<PtyAttachResult>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): void
    onData(listener: (id: string, data: string) => void): () => void
    onExit(listener: (exit: PtyExit) => void): () => void
  }
  /** Tells the main process which themes exist and which is current, for the Theme menu. */
  setThemeMenu(names: string[], current: string): void
  /** A theme chosen in the Theme menu. */
  onSetTheme(listener: (name: string) => void): () => void
  windows: {
    undock(id: string, title: string): void
    dock(id: string): void
    nextDisplay(id: string): void
    onDockedBack(listener: (id: string) => void): () => void
    onReveal(listener: (id: string) => void): () => void
    /** Ctrl+Tab and Ctrl+Shift+Tab, caught by the main process before the page sees the key. */
    onCycleTabs(listener: (backwards: boolean) => void): () => void
    setTitle(id: string, title: string): void
  }
}
