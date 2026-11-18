import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import type { PtyExit } from '@shared/types'
import { shortcutFor } from './shortcuts'
import { toXtermTheme, type TerminalTheme } from './themes'

/** One terminal per session. It lives as long as the tab, also while no pane shows it. */
export interface TerminalEntry {
  id: string
  folder: string
  resume: boolean
  term: Terminal
  fit: FitAddon
  element: HTMLDivElement
  opened: boolean
  started: boolean
  ready: boolean
}

const entries = new Map<string, TerminalEntry>()
let exitHandler: ((exit: PtyExit) => void) | undefined
let listening = false

const FONT = 'Menlo, Monaco, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace'

function listenOnce(): void {
  if (listening) {
    return
  }
  listening = true
  window.hive.pty.onData((id, data) => {
    // Data that comes before the first answer of `attach` is already in its buffer.
    const entry = entries.get(id)
    if (entry?.ready) {
      entry.term.write(data)
    }
  })
  window.hive.pty.onExit((exit) => {
    if (window.hive.debug) {
      console.log('[pty exit]', JSON.stringify(exit))
    }
    entries.get(exit.id)?.term.write(`\r\n\x1b[2m[process ended with code ${exit.exitCode}]\x1b[0m\r\n`)
    exitHandler?.(exit)
  })
}

export function onProcessExit(handler: (exit: PtyExit) => void): void {
  exitHandler = handler
  listenOnce()
}

export function getEntry(id: string): TerminalEntry | undefined {
  return entries.get(id)
}

export function createEntry(id: string, folder: string, resume: boolean, theme: TerminalTheme): TerminalEntry {
  const existing = entries.get(id)
  if (existing) {
    return existing
  }
  listenOnce()
  const term = new Terminal({
    fontFamily: FONT,
    fontSize: 13,
    cursorBlink: true,
    scrollback: 10000,
    allowProposedApi: true,
    theme: toXtermTheme(theme)
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  const element = document.createElement('div')
  element.className = 'terminal-host'
  const entry: TerminalEntry = { id, folder, resume, term, fit, element, opened: false, started: false, ready: false }
  entries.set(id, entry)

  // Keys that Hive handles itself must not reach the terminal.
  term.attachCustomKeyEventHandler((event) => shortcutFor(event) === undefined)
  term.onData((data) => {
    if (entry.started) {
      window.hive.pty.write(id, data)
    }
  })
  term.onResize(({ cols, rows }) => {
    if (entry.started) {
      window.hive.pty.resize(id, cols, rows)
    }
  })
  return entry
}

/** Puts the terminal into a container. The first time, it also starts the process with the real size. */
export function mountEntry(entry: TerminalEntry, container: HTMLElement): void {
  container.appendChild(entry.element)
  if (!entry.opened) {
    entry.term.open(entry.element)
    entry.opened = true
  }
  requestAnimationFrame(() => {
    fitEntry(entry)
    void start(entry)
  })
}

export function unmountEntry(entry: TerminalEntry, container: HTMLElement): void {
  if (entry.element.parentElement === container) {
    container.removeChild(entry.element)
  }
}

export function fitEntry(entry: TerminalEntry): void {
  if (entry.element.isConnected && entry.element.clientWidth > 0 && entry.element.clientHeight > 0) {
    try {
      entry.fit.fit()
    } catch {
      // The terminal is not ready to measure yet.
    }
  }
}

async function start(entry: TerminalEntry): Promise<void> {
  if (entry.started) {
    return
  }
  entry.started = true
  const size = entry.fit.proposeDimensions()
  const cols = size?.cols ?? 100
  const rows = size?.rows ?? 30
  let result: Awaited<ReturnType<typeof window.hive.pty.attach>>
  try {
    result = await window.hive.pty.attach(entry.id, { folder: entry.folder, resume: entry.resume, cols, rows })
  } catch (error) {
    // Say why in the terminal, so the user is not left with an empty pane.
    entry.term.write(`\r\n\x1b[31mCould not start the session: ${error instanceof Error ? error.message : String(error)}\x1b[0m\r\n`)
    return
  }
  if (result.buffer) {
    entry.term.write(result.buffer)
  }
  entry.ready = true
  if (!result.created) {
    // A second window shows a process that already runs. Changing the size once makes Claude Code draw the screen again.
    window.hive.pty.resize(entry.id, Math.max(cols - 1, 2), rows)
    setTimeout(() => window.hive.pty.resize(entry.id, cols, rows), 60)
  }
}

export function disposeEntry(id: string): void {
  const entry = entries.get(id)
  if (entry) {
    entries.delete(id)
    entry.element.remove()
    entry.term.dispose()
  }
}

export function applyTheme(theme: TerminalTheme): void {
  for (const entry of entries.values()) {
    entry.term.options.theme = toXtermTheme(theme)
  }
}

export function focusEntry(id: string): void {
  const entry = entries.get(id)
  if (entry?.element.isConnected) {
    entry.term.focus()
  }
}
